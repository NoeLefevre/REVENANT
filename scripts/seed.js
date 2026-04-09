const Stripe = require('stripe')
const stripe = Stripe('sk_test_51TEEu0RqQO9pAco7k9uGLTUxMQuQT4RD3REyWa84igWBZHl5K8tKNpRDuLqMDuwsTDEHBnZhnM9UirD8nNNfnmqq00soszHv75')
const CONNECTED_ACCOUNT_ID = 'acct_1TKOemBmSgAw5GP7'
const opts = { stripeAccount: CONNECTED_ACCOUNT_ID }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Helpers ───────────────────────────────────────────────────────────────────

function logScenario({ id, name, email, customerId, subId, mrr, pmLabel, expected }) {
  console.log(
    '\n  ┌─────────────────────────────────────────────────\n' +
    `  │ ${id} — ${name}\n` +
    '  ├─────────────────────────────────────────────────\n' +
    `  │ Email    : ${email}\n` +
    `  │ Customer : ${customerId ?? 'N/A'}\n` +
    `  │ Sub      : ${subId ?? 'N/A'}\n` +
    `  │ MRR      : €${mrr / 100}/mo\n` +
    `  │ Token    : ${pmLabel}\n` +
    `  │ Expected : ${expected}\n` +
    '  └─────────────────────────────────────────────────'
  )
}

// ── Product setup ─────────────────────────────────────────────────────────────

async function setupProduct() {
  const product = await stripe.products.create({ name: 'REVENANT Test Plan' }, opts)
  console.log('✅ Product créé:', product.id)

  const makePrice = (amount) =>
    stripe.prices.create(
      { product: product.id, unit_amount: amount, currency: 'eur', recurring: { interval: 'month' } },
      opts
    )

  const [price49, price99, price249] = await Promise.all([
    makePrice(4900),
    makePrice(9900),
    makePrice(24900),
  ])
  console.log('✅ Prices créées: €49, €99, €249')
  return { product, price49, price99, price249 }
}

// ── Core customer helper ──────────────────────────────────────────────────────
// pmInput : string token OU objet { type:'card', card:{...} } pour carte brute
// priceId : stripe Price ID
// options : { trialDays }
// Retourne : { customer, pm, sub, invoiceId }

async function createCustomer(email, name, pmInput, priceId, options = {}) {
  const { trialDays = null } = options
  const out = { email, customer: null, pm: null, sub: null, invoiceId: null }

  try {
    out.customer = await stripe.customers.create({ email, name }, opts)
  } catch (err) {
    console.error(`   ❌ customers.create: ${err.message}`)
    return out
  }

  try {
    let pm
    if (typeof pmInput === 'string') {
      pm = await stripe.paymentMethods.attach(pmInput, { customer: out.customer.id }, opts)
    } else {
      // Carte brute (ex: expiry personnalisée)
      pm = await stripe.paymentMethods.create(pmInput, opts)
      await stripe.paymentMethods.attach(pm.id, { customer: out.customer.id }, opts)
    }
    out.pm = pm

    await stripe.customers.update(
      out.customer.id,
      { invoice_settings: { default_payment_method: pm.id } },
      opts
    )

    const subParams = {
      customer: out.customer.id,
      items: [{ price: priceId }],
      default_payment_method: pm.id,
      expand: ['latest_invoice.payment_intent'],
    }
    if (trialDays) {
      subParams.trial_end = Math.floor(Date.now() / 1000) + trialDays * 86400
    }

    out.sub = await stripe.subscriptions.create(subParams, opts)
    out.invoiceId = out.sub.latest_invoice?.id ?? null
  } catch (err) {
    console.error(`   ❌ ${err.decline_code || err.code || err.message}`)
  }

  return out
}

// ── GROUPE A — Customers sains ────────────────────────────────────────────────

async function seedGroupA({ price49, price99, price249 }) {
  console.log('\n\n📗 GROUPE A — Customers sains')
  const results = []

  {
    const r = await createCustomer('alice@healthy.com', 'Alice Healthy', 'pm_card_visa', price49.id)
    logScenario({ id: 'A1', name: 'Alice Healthy', email: 'alice@healthy.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 4900, pmLabel: 'pm_card_visa', expected: 'Active sub — baseline positif Health Score' })
    results.push({ id: 'A1', type: 'healthy', email: 'alice@healthy.com', ok: !!r.sub, mrr: 4900 })
  }

  {
    const r = await createCustomer('bob@healthy.com', 'Bob Enterprise', 'pm_card_mastercard', price249.id)
    logScenario({ id: 'A2', name: 'Bob Enterprise', email: 'bob@healthy.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 24900, pmLabel: 'pm_card_mastercard', expected: 'Active sub €249 — priorité War Room si échec' })
    results.push({ id: 'A2', type: 'healthy', email: 'bob@healthy.com', ok: !!r.sub, mrr: 24900 })
  }

  {
    const r = await createCustomer('carol@healthy.com', 'Carol Loyal', 'pm_card_visa', price99.id)
    logScenario({ id: 'A3', name: 'Carol Loyal', email: 'carol@healthy.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 9900, pmLabel: 'pm_card_visa', expected: 'Active sub €99 — Recovery Score élevé (tenure)' })
    results.push({ id: 'A3', type: 'healthy', email: 'carol@healthy.com', ok: !!r.sub, mrr: 9900 })
  }

  return results
}

// ── GROUPE B — Expiry Detection ───────────────────────────────────────────────
// Stripe n'expose pas de token avec expiry personnalisée via pm_card_*.
// Subscriptions créées avec pm_card_visa valide.
// Patcher cardExpMonth/Year manuellement dans MongoDB (voir bilan final).

async function seedGroupB({ price49 }) {
  console.log('\n\n🟡 GROUPE B — Expiry Detection')
  console.log('   ⚠️  Expiry simulée via patch MongoDB après webhook (voir bilan final)')
  const results = []

  const cases = [
    { id: 'B1', email: 'urgent@expiry.com', name: 'Dan Critical', expected: 'Patch MongoDB → exp dans ~15j → badge rouge ⚠' },
    { id: 'B2', email: 'soon@expiry.com',   name: 'Emma Soon',    expected: 'Patch MongoDB → exp dans ~45j → badge orange' },
    { id: 'B3', email: 'later@expiry.com',  name: 'Frank Later',  expected: 'Patch MongoDB → exp dans ~75j → badge jaune' },
  ]

  for (const c of cases) {
    const r = await createCustomer(c.email, c.name, 'pm_card_visa', price49.id)
    logScenario({ id: c.id, name: c.name, email: c.email, customerId: r.customer?.id, subId: r.sub?.id, mrr: 4900, pmLabel: 'pm_card_visa', expected: c.expected })
    results.push({ id: c.id, type: 'expiry', email: c.email, ok: !!r.sub, mrr: 4900 })
  }

  return results
}

// ── GROUPE C — DIE Classification & Dunning ───────────────────────────────────

async function seedGroupC({ price49, price99 }) {
  console.log('\n\n🔴 GROUPE C — DIE Classification & Dunning')
  const results = []

  // C1 — insufficient_funds → SOFT_TEMPORARY (5 steps)
  {
    const r = await createCustomer('nsf@decline.com', 'Henry NSF', 'pm_card_chargeDeclinedInsufficientFunds', price49.id)
    logScenario({ id: 'C1', name: 'Henry NSF', email: 'nsf@decline.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 4900, pmLabel: 'pm_card_chargeDeclinedInsufficientFunds', expected: 'insufficient_funds → SOFT_TEMPORARY → DunningSequence 5 steps' })
    results.push({ id: 'C1', type: 'soft_temporary', email: 'nsf@decline.com', ok: !!r.customer, mrr: 4900 })
  }

  // C2 — generic_decline → SOFT_TEMPORARY (5 steps)
  // Note: do_not_honor est HARD_PERMANENT dans die.js — remplacé par generic_decline
  {
    const r = await createCustomer('generic@decline.com', 'Isabelle Generic', 'pm_card_chargeDeclined', price99.id)
    logScenario({ id: 'C2', name: 'Isabelle Generic', email: 'generic@decline.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 9900, pmLabel: 'pm_card_chargeDeclined', expected: 'generic_decline → SOFT_TEMPORARY → DunningSequence 5 steps' })
    results.push({ id: 'C2', type: 'soft_temporary', email: 'generic@decline.com', ok: !!r.customer, mrr: 9900 })
  }

  // C3 — expired_card → SOFT_UPDATABLE (4 steps)
  {
    const r = await createCustomer('expired@decline.com', 'Jules ExpiredCard', 'pm_card_chargeDeclinedExpiredCard', price49.id)
    logScenario({ id: 'C3', name: 'Jules ExpiredCard', email: 'expired@decline.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 4900, pmLabel: 'pm_card_chargeDeclinedExpiredCard', expected: 'expired_card → SOFT_UPDATABLE → DunningSequence 4 steps' })
    results.push({ id: 'C3', type: 'soft_updatable', email: 'expired@decline.com', ok: !!r.customer, mrr: 4900 })
  }

  // C4 — fraudulent → HARD_PERMANENT (aucune séquence dunning)
  {
    const r = await createCustomer('fraud@decline.com', 'Liam Fraudulent', 'pm_card_chargeDeclinedFraudulent', price49.id)
    logScenario({ id: 'C4', name: 'Liam Fraudulent', email: 'fraud@decline.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 4900, pmLabel: 'pm_card_chargeDeclinedFraudulent', expected: 'fraudulent → HARD_PERMANENT → aucune séquence dunning' })
    results.push({ id: 'C4', type: 'hard_permanent', email: 'fraud@decline.com', ok: !!r.customer, mrr: 4900 })
  }

  // C5 — NSF multi-failure (idempotency DunningSequence)
  {
    const r = await createCustomer('multi@decline.com', 'Nathan MultiFailure', 'pm_card_chargeDeclinedInsufficientFunds', price99.id)
    logScenario({ id: 'C5', name: 'Nathan MultiFailure', email: 'multi@decline.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 9900, pmLabel: 'pm_card_chargeDeclinedInsufficientFunds', expected: 'NSF → 1 séquence active (idempotency). Multi-invoices: retry via CLI.' })
    results.push({ id: 'C5', type: 'soft_temporary', email: 'multi@decline.com', ok: !!r.customer, mrr: 9900 })
  }

  return results
}

// ── GROUPE D — Recovery ───────────────────────────────────────────────────────

async function seedGroupD({ price49, price99 }) {
  console.log('\n\n♻️  GROUPE D — Recovery')
  const results = []

  // D1 — NSF → carte valide → invoice.payment_succeeded
  {
    const r = await createCustomer('recovered@test.com', 'Olivia Recovered', 'pm_card_chargeDeclinedInsufficientFunds', price49.id)
    if (r.customer && r.invoiceId) {
      console.log('   ↳ [D1] Attente 2s puis retry avec pm_card_visa...')
      await sleep(2000)
      try {
        const newPm = await stripe.paymentMethods.attach('pm_card_visa', { customer: r.customer.id }, opts)
        await stripe.customers.update(r.customer.id, { invoice_settings: { default_payment_method: newPm.id } }, opts)
        if (r.sub?.id) await stripe.subscriptions.update(r.sub.id, { default_payment_method: newPm.id }, opts)
        await stripe.invoices.pay(r.invoiceId, { payment_method: newPm.id }, opts)
        console.log('   ↳ [D1] ✅ Invoice retentée → invoice.payment_succeeded attendu dans webhook')
      } catch (err) {
        console.error(`   ↳ [D1] ❌ Retry échoué: ${err.message}`)
      }
    } else {
      console.log('   ↳ [D1] ⚠ invoiceId non disponible')
    }
    logScenario({ id: 'D1', name: 'Olivia Recovered', email: 'recovered@test.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 4900, pmLabel: 'NSF → pm_card_visa', expected: 'Invoice recovered — DunningSequence stoppée — Recovered MRR +€49' })
    results.push({ id: 'D1', type: 'recovered', email: 'recovered@test.com', ok: !!r.customer, mrr: 4900 })
  }

  // D2 — expired_card → carte valide → invoice.payment_succeeded
  {
    const r = await createCustomer('cardupdated@test.com', 'Peter CardUpdated', 'pm_card_chargeDeclinedExpiredCard', price99.id)
    if (r.customer && r.invoiceId) {
      console.log('   ↳ [D2] Attente 2s puis mise à jour carte...')
      await sleep(2000)
      try {
        const newPm = await stripe.paymentMethods.attach('pm_card_visa', { customer: r.customer.id }, opts)
        await stripe.customers.update(r.customer.id, { invoice_settings: { default_payment_method: newPm.id } }, opts)
        if (r.sub?.id) await stripe.subscriptions.update(r.sub.id, { default_payment_method: newPm.id }, opts)
        await stripe.invoices.pay(r.invoiceId, { payment_method: newPm.id }, opts)
        console.log('   ↳ [D2] ✅ Carte mise à jour + invoice retentée → séquence stoppée attendue')
      } catch (err) {
        console.error(`   ↳ [D2] ❌ Retry échoué: ${err.message}`)
      }
    } else {
      console.log('   ↳ [D2] ⚠ invoiceId non disponible')
    }
    logScenario({ id: 'D2', name: 'Peter CardUpdated', email: 'cardupdated@test.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 9900, pmLabel: 'expired → pm_card_visa', expected: 'SOFT_UPDATABLE → carte mise à jour → DunningSequence stoppée' })
    results.push({ id: 'D2', type: 'recovered', email: 'cardupdated@test.com', ok: !!r.customer, mrr: 9900 })
  }

  return results
}

// ── GROUPE E — Trial Guard / SmartCharge ──────────────────────────────────────

async function seedGroupE({ price49, price99 }) {
  console.log('\n\n🔒 GROUPE E — Trial Guard / SmartCharge')
  console.log('   ⚠️  E4/E5 : timing dépendant du webhook — sleep 5s avant update/cancel')
  const results = []

  // E1 — Prepaid → HIGH RISK → hold_active (Signal 1: funding=prepaid)
  {
    const r = await createCustomer('prepaid@trial.com', 'Quinn PrepaidTrial', 'pm_card_visa_prepaid', price49.id, { trialDays: 7 })
    logScenario({ id: 'E1', name: 'Quinn PrepaidTrial', email: 'prepaid@trial.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 4900, pmLabel: 'pm_card_visa_prepaid', expected: 'prepaid_card → isHighRisk:true → TrialGuard hold_active (pre-auth $1)' })
    results.push({ id: 'E1', type: 'trial_high_risk', email: 'prepaid@trial.com', ok: !!r.sub, mrr: 4900 })
  }

  // E2 — Card expires before trial end → HIGH RISK → hold_active (Signal 2)
  // Carte brute exp 03/2026 : cardExpiry = new Date(2026,2,28) = March 28
  // trial_end ≈ aujourd'hui + 7j → March 28 < trial_end → signal card_expires_before_trial_end
  {
    const rawCard = { type: 'card', card: { number: '4242424242424242', exp_month: 3, exp_year: 2026, cvc: '314' } }
    const r = await createCustomer('expiring@trial.com', 'Rachel ExpiringCard', rawCard, price49.id, { trialDays: 7 })
    logScenario({ id: 'E2', name: 'Rachel ExpiringCard', email: 'expiring@trial.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 4900, pmLabel: 'raw_card exp=03/2026', expected: 'card_expires_before_trial_end → isHighRisk:true → TrialGuard hold_active' })
    results.push({ id: 'E2', type: 'trial_high_risk', email: 'expiring@trial.com', ok: !!r.sub, mrr: 4900 })
  }

  // E3 — Safe trial : pm_card_visa → aucun signal → monitoring
  {
    const r = await createCustomer('safe@trial.com', 'Steve SafeTrial', 'pm_card_visa', price49.id, { trialDays: 7 })
    logScenario({ id: 'E3', name: 'Steve SafeTrial', email: 'safe@trial.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 4900, pmLabel: 'pm_card_visa', expected: 'Aucun signal → isHighRisk:false → TrialGuard status:monitoring' })
    results.push({ id: 'E3', type: 'trial_monitoring', email: 'safe@trial.com', ok: !!r.sub, mrr: 4900 })
  }

  // E4 — Trial converted : prepaid → hold_active → trial_end:now → active → captured
  // prepaid requis pour qu'un hold_active existe à capturer
  {
    const r = await createCustomer('converted@trial.com', 'Tina Converted', 'pm_card_visa_prepaid', price99.id, { trialDays: 7 })
    if (r.sub?.id) {
      console.log('   ↳ [E4] Attente 5s (webhook doit créer TrialGuard hold_active)...')
      await sleep(5000)
      try {
        await stripe.subscriptions.update(r.sub.id, { trial_end: 'now' }, opts)
        console.log('   ↳ [E4] ✅ trial_end:now → customer.subscription.updated → capture pre-auth')
      } catch (err) {
        console.error(`   ↳ [E4] ❌ trial_end update: ${err.message}`)
      }
    }
    logScenario({ id: 'E4', name: 'Tina Converted', email: 'converted@trial.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 9900, pmLabel: 'pm_card_visa_prepaid', expected: 'prepaid → hold_active → trial converti → TrialGuard captured (timing webhook)' })
    results.push({ id: 'E4', type: 'trial_converted', email: 'converted@trial.com', ok: !!r.sub, mrr: 9900 })
  }

  // E5 — Trial cancelled : prepaid → hold_active → subscription.deleted → cancelled
  {
    const r = await createCustomer('cancelled@trial.com', 'Uma CancelledTrial', 'pm_card_visa_prepaid', price49.id, { trialDays: 7 })
    if (r.sub?.id) {
      console.log('   ↳ [E5] Attente 5s (webhook doit créer TrialGuard hold_active)...')
      await sleep(5000)
      try {
        await stripe.subscriptions.cancel(r.sub.id, {}, opts)
        console.log('   ↳ [E5] ✅ Subscription annulée → customer.subscription.deleted → pre-auth cancelled')
      } catch (err) {
        console.error(`   ↳ [E5] ❌ Cancel: ${err.message}`)
      }
    }
    logScenario({ id: 'E5', name: 'Uma CancelledTrial', email: 'cancelled@trial.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 4900, pmLabel: 'pm_card_visa_prepaid', expected: 'prepaid → hold_active → annulé → TrialGuard cancelled (timing webhook)' })
    results.push({ id: 'E5', type: 'trial_cancelled', email: 'cancelled@trial.com', ok: !!r.sub, mrr: 4900 })
  }

  return results
}

// ── GROUPE F — Chargeback Shield ──────────────────────────────────────────────

async function seedGroupF({ price49 }) {
  console.log('\n\n🛡  GROUPE F — Chargeback Shield')
  const results = []

  {
    const r = await createCustomer('highrisk@chargeback.com', 'Victor HighRisk', 'pm_card_chargeDeclinedInsufficientFunds', price49.id)
    logScenario({ id: 'F1', name: 'Victor HighRisk', email: 'highrisk@chargeback.com', customerId: r.customer?.id, subId: r.sub?.id, mrr: 4900, pmLabel: 'pm_card_chargeDeclinedInsufficientFunds', expected: 'NSF → Recovery Score < 40 → listé dans Chargeback Shield' })
    results.push({ id: 'F1', type: 'chargeback_shield', email: 'highrisk@chargeback.com', ok: !!r.customer, mrr: 4900 })
  }

  return results
}

// ── GROUPE G — Mix réaliste (volume) ──────────────────────────────────────────

async function seedGroupG({ price49, price99, price249 }) {
  console.log('\n\n📊 GROUPE G — Mix réaliste (volume)')
  const results = []

  const customers = [
    { id: 'G1',  email: 'g1@test.com',  name: 'Greta Greene', pm: 'pm_card_visa',                            priceId: price49.id,  mrr: 4900,  type: 'healthy',        note: 'visa, sain' },
    { id: 'G2',  email: 'g2@test.com',  name: 'Hans Bloom',   pm: 'pm_card_mastercard',                      priceId: price99.id,  mrr: 9900,  type: 'healthy',        note: 'mastercard, sain €99' },
    { id: 'G3',  email: 'g3@test.com',  name: 'Ida Durand',   pm: 'pm_card_visa',                            priceId: price49.id,  mrr: 4900,  type: 'healthy',        note: 'visa, sain' },
    { id: 'G4',  email: 'g4@test.com',  name: 'Jack Laval',   pm: 'pm_card_mastercard',                      priceId: price249.id, mrr: 24900, type: 'healthy',        note: 'mastercard, sain €249' },
    { id: 'G5',  email: 'g5@test.com',  name: 'Kira Wellman', pm: 'pm_card_visa',                            priceId: price49.id,  mrr: 4900,  type: 'healthy',        note: 'visa, sain' },
    { id: 'G6',  email: 'g6@test.com',  name: 'Leo ExpSoon',  pm: 'pm_card_visa',                            priceId: price49.id,  mrr: 4900,  type: 'expiry',         note: 'patch MongoDB exp dans ~20j' },
    { id: 'G7',  email: 'g7@test.com',  name: 'Mia ExpLater', pm: 'pm_card_visa',                            priceId: price49.id,  mrr: 4900,  type: 'expiry',         note: 'patch MongoDB exp dans ~55j' },
    { id: 'G8',  email: 'g8@test.com',  name: 'Nate Failing', pm: 'pm_card_chargeDeclinedInsufficientFunds', priceId: price49.id,  mrr: 4900,  type: 'soft_temporary', note: 'NSF → DunningSequence 5 steps' },
    { id: 'G9',  email: 'g9@test.com',  name: 'Ora Declined', pm: 'pm_card_chargeDeclined',                  priceId: price99.id,  mrr: 9900,  type: 'soft_temporary', note: 'generic_decline → DunningSequence 5 steps' },
    { id: 'G10', email: 'g10@test.com', name: 'Pat HardStop', pm: 'pm_card_chargeDeclinedFraudulent',        priceId: price49.id,  mrr: 4900,  type: 'hard_permanent', note: 'fraudulent → HARD_PERMANENT — aucune séquence' },
  ]

  for (const c of customers) {
    const r = await createCustomer(c.email, c.name, c.pm, c.priceId)
    logScenario({ id: c.id, name: c.name, email: c.email, customerId: r.customer?.id, subId: r.sub?.id, mrr: c.mrr, pmLabel: c.pm, expected: c.note })
    results.push({ id: c.id, type: c.type, email: c.email, ok: !!r.customer, mrr: c.mrr })
  }

  return results
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary(allResults) {
  const flat = Object.values(allResults).flat()
  const count = (...types) => flat.filter((r) => types.includes(r.type)).length
  const totalMrr = flat.filter((r) => r.ok).reduce((sum, r) => sum + (r.mrr ?? 0), 0)
  const totalOk = flat.filter((r) => r.ok).length

  const now = new Date()
  const m = now.getMonth() + 1
  const y = now.getFullYear()
  const nextMonth = (offset) => {
    const d = new Date(y, m - 1 + offset, 1)
    return { m: d.getMonth() + 1, y: d.getFullYear() }
  }
  const nm1 = nextMonth(1)
  const nm2 = nextMonth(2)

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 REVENANT SEED — BILAN FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Créés OK             : ${totalOk}/${flat.length}
Customers sains      : ${count('healthy')} (A1-A3 + G1-G5)
Cartes expirantes    : ${count('expiry')} (B1-B3 + G6-G7) — patch MongoDB requis
Echecs SOFT_TEMP     : ${count('soft_temporary')} (C1, C2, C5, G8, G9)
Echecs SOFT_UPD      : ${count('soft_updatable')} (C3)
Echecs HARD_PERM     : ${count('hard_permanent')} (C4, G10)
Recouvrements        : ${count('recovered')} (D1, D2)
Trials SmartCharge   : ${count('trial_high_risk', 'trial_monitoring', 'trial_converted', 'trial_cancelled')} (E1-E5)
  dont high-risk     : ${count('trial_high_risk')} (E1 prepaid, E2 card expires)
  dont monitoring    : ${count('trial_monitoring')} (E3 safe)
  dont converted     : ${count('trial_converted')} (E4)
  dont cancelled     : ${count('trial_cancelled')} (E5)
Chargeback Shield    : ${count('chargeback_shield')} (F1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MRR total simule     : €${(totalMrr / 100).toLocaleString('fr-FR')}/mo
Health Score attendu : ~60-70/100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PATCH MONGODB requis pour Expiry (B + G6-G7) :
Trouver chaque Subscription par customerEmail,
puis mettre a jour : { cardExpMonth, cardExpYear }

  urgent@expiry.com  (B1) -> cardExpMonth:${m},      cardExpYear:${y}     (~15j)
  soon@expiry.com    (B2) -> cardExpMonth:${nm1.m},  cardExpYear:${nm1.y}  (~45j)
  later@expiry.com   (B3) -> cardExpMonth:${nm2.m},  cardExpYear:${nm2.y}  (~75j)
  g6@test.com        (G6) -> cardExpMonth:${m},      cardExpYear:${y}     (~20j)
  g7@test.com        (G7) -> cardExpMonth:${nm1.m},  cardExpYear:${nm1.y}  (~55j)

VERIFICATIONS :
  1. Stripe Dashboard -> compte connecte
     -> ${totalOk} customers crees, subscriptions actives + trials

  2. Vercel Logs -> stripe-connect webhook
     -> Aucun "No handler for event"
     -> Events : customer.subscription.created,
       invoice.payment_failed, invoice.payment_succeeded

  3. MongoDB Atlas
     -> Invoice         : docs avec dieCategory
     -> Subscription    : docs avec cardMeta
     -> TrialGuard      : ${count('trial_high_risk')} hold_active attendus (E1, E2)
     -> DunningSequence : sequences actives pour C1, C2, C5, G8, G9

  4. Dashboard REVENANT
     -> Overview                    : Health Score ~60-70
     -> Prevention/Trial Guard      : ${count('trial_high_risk', 'trial_monitoring')} trials (${count('trial_high_risk')} high-risk)
     -> Prevention/Expiring Cards   : ${count('expiry')} cards (apres patch MongoDB)
     -> Prevention/Chargeback Shield: ${count('chargeback_shield')} customers
     -> War Room                    : C1, C2, C5, G8, G9 (SOFT_TEMP x5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 REVENANT SEED — compte connecté:', CONNECTED_ACCOUNT_ID)

  const args = process.argv.slice(2)
  const groupIdx = args.indexOf('--group')
  const groupArg = groupIdx !== -1 ? args[groupIdx + 1]?.toUpperCase() : null

  if (groupArg) console.log(`\n🎯 Mode groupe unique : ${groupArg}`)

  const { price49, price99, price249 } = await setupProduct()
  const prices = { price49, price99, price249 }
  const results = {}

  const run = async (key, fn) => {
    if (!groupArg || groupArg === key) {
      results[key] = await fn()
      await sleep(1000)
    }
  }

  await run('A', () => seedGroupA(prices))
  await run('B', () => seedGroupB(prices))
  await run('C', () => seedGroupC(prices))
  await run('D', () => seedGroupD(prices))
  await run('E', () => seedGroupE(prices))
  await run('F', () => seedGroupF(prices))
  await run('G', () => seedGroupG(prices))

  if (!groupArg) printSummary(results)
}

seed().catch(console.error)
