const Stripe = require('stripe')
const stripe = Stripe('sk_test_51TEEu0RqQO9pAco7k9uGLTUxMQuQT4RD3REyWa84igWBZHl5K8tKNpRDuLqMDuwsTDEHBnZhnM9UirD8nNNfnmqq00soszHv75')
const CONNECTED_ACCOUNT_ID = 'acct_1TL4vBDjv0y8sHKj'
const opts = { stripeAccount: CONNECTED_ACCOUNT_ID }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Compteurs — les holds/annulations sont confirmés par le webhook (async)
// Ces valeurs reflètent ce que le seed déclenche, pas ce que le webhook confirme
const stats = {
  customersCreated: 0,
  trialsStarted: 0,
  holdsExpectedOk: 0,   // scénarios où le hold devrait réussir
  holdsExpectedFail: 0, // scénarios où le hold devrait échouer
  trialsCancelled: 0,
  trialsIgnored: 0,     // scénarios >7j ignorés par Trial Guard
}

// ─────────────────────────────────────
// SETUP : créer le produit et le prix
// ─────────────────────────────────────

async function setupProduct() {
  const product = await stripe.products.create({ name: 'REVENANT Trial Guard Test' }, opts)
  console.log('✅ Product créé:', product.id)
  const price = await stripe.prices.create(
    { product: product.id, unit_amount: 4900, currency: 'eur', recurring: { interval: 'month' } },
    opts
  )
  console.log('✅ Price créée: €49/mo —', price.id)
  return price
}

// ─────────────────────────────────────
// HELPER : créer un customer avec trial
// ─────────────────────────────────────

// pmInput : string token (ex: 'pm_card_visa') OU objet carte brute (ex: { type: 'card', card: { ... } })
async function createTrialCustomer({ email, name, pmInput, trialDays, priceId }) {
  const out = { customer: null, sub: null }

  try {
    out.customer = await stripe.customers.create({ email, name }, opts)
    stats.customersCreated++
  } catch (err) {
    console.error(`   ❌ customers.create: ${err.message}`)
    return out
  }

  try {
    let pm
    if (typeof pmInput === 'string') {
      try {
        pm = await stripe.paymentMethods.attach(pmInput, { customer: out.customer.id }, opts)
      } catch (err) {
        console.error(`   ❌ paymentMethods.attach échoué: ${err.decline_code || err.code || err.message}`)
        return out
      }
    } else {
      // Carte brute (ex: expiry personnalisée pour tester card_expires_before_trial_end)
      try {
        pm = await stripe.paymentMethods.create(pmInput, opts)
        await stripe.paymentMethods.attach(pm.id, { customer: out.customer.id }, opts)
      } catch (err) {
        console.error(`   ❌ paymentMethods.create/attach (carte brute) échoué: ${err.decline_code || err.code || err.message}`)
        return out
      }
    }

    try {
      await stripe.customers.update(
        out.customer.id,
        { invoice_settings: { default_payment_method: pm.id } },
        opts
      )
    } catch (err) {
      console.error(`   ❌ customers.update (default_payment_method) échoué: ${err.decline_code || err.code || err.message}`)
      return out
    }

    try {
      const sub = await stripe.subscriptions.create(
        {
          customer: out.customer.id,
          items: [{ price: priceId }],
          default_payment_method: pm.id,
          trial_end: Math.floor(Date.now() / 1000) + trialDays * 86400,
        },
        opts
      )
      out.sub = sub
      stats.trialsStarted++
    } catch (err) {
      console.error(`   ❌ subscriptions.create échoué: ${err.decline_code || err.code || err.message}`)
    }
  } catch (err) {
    console.error(`   ❌ Erreur inattendue: ${err.message}`)
  }

  return out
}

// ─────────────────────────────────────
// HELPER : annuler une subscription
// ─────────────────────────────────────

async function cancelSubscription(subId) {
  try {
    await stripe.subscriptions.cancel(subId, {}, opts)
    stats.trialsCancelled++
    console.log(`   ↳ ✅ Subscription ${subId} annulée`)
  } catch (err) {
    console.error(`   ↳ ❌ Cancel: ${err.message}`)
  }
}

// ─────────────────────────────────────
// LOG : résumé d'un scénario
// ─────────────────────────────────────

function logScenario({ id, name, email, customerId, subId, pmToken, trialDays, expectedOutcome }) {
  console.log(
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧪 SCÉNARIO ${id} — ${name}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📧 Email     : ${email}\n` +
    `👤 Customer  : ${customerId ?? 'N/A'}\n` +
    `📋 Sub       : ${subId ?? 'N/A'}\n` +
    `💳 Carte     : ${pmToken}\n` +
    `⏱  Trial     : ${trialDays} jours\n` +
    `🎯 Attendu   : ${expectedOutcome}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  )
}

// ─────────────────────────────────────
// SCÉNARIOS
// ─────────────────────────────────────

// Scénario 1 — Trial qui réussit (Universal)
// Carte valide, mode universal, hold doit réussir
async function runScenario1(price) {
  const ts = Date.now()
  const email = `s1-good-${ts}@trial-test.com`
  const pmToken = 'pm_card_visa'
  const trialDays = 7

  const { customer, sub } = await createTrialCustomer({
    email, name: 'S1 Good Card', pmInput: pmToken, trialDays, priceId: price.id,
  })

  if (sub) stats.holdsExpectedOk++

  logScenario({
    id: '1', name: 'Trial qui réussit (Universal)',
    email, customerId: customer?.id, subId: sub?.id,
    pmToken, trialDays,
    expectedOutcome: 'Hold placé → paymentIntentStatus: "held"',
  })
}

// Scénario 2 — Trial bloqué (carte refusée — generic decline)
// pm_card_chargeDeclinedInsufficientFunds échoue à l'attach sur compte connecté.
// On utilise pm_card_chargeDeclined (generic decline) : s'attache, trial créé, hold échoue.
async function runScenario2(price) {
  const ts = Date.now()
  const email = `s2-declined-${ts}@trial-test.com`
  const pmToken = 'pm_card_chargeDeclined'
  const trialDays = 7

  const { customer, sub } = await createTrialCustomer({
    email, name: 'S2 Declined Card', pmInput: pmToken, trialDays, priceId: price.id,
  })

  if (customer) stats.holdsExpectedFail++

  logScenario({
    id: '2', name: 'Trial bloqué (carte refusée — generic decline)',
    email, customerId: customer?.id, subId: sub?.id ?? '(annulée par Trial Guard via webhook)',
    pmToken, trialDays,
    expectedOutcome: 'Hold échoue (do_not_honor) → subscription annulée → paymentIntentStatus: "failed"',
  })
}

// Scénario 3 — Trial bloqué (carte expirée — carte brute)
// pm_card_chargeDeclinedExpiredCard est rejeté par Stripe à l'attach (carte littéralement expirée).
// On utilise une carte brute avec expiry passée : attach OK, trial créé,
// mais hold échoue car la carte est expirée au moment du PaymentIntent.
async function runScenario3(price) {
  const ts = Date.now()
  const email = `s3-expired-${ts}@trial-test.com`
  const trialDays = 7

  // Carte expirée il y a 2 mois
  const now = new Date()
  const expMonth = now.getMonth() <= 1
    ? 12 + now.getMonth() - 1  // handle janvier/février
    : now.getMonth() - 1       // mois précédent (1-indexé, getMonth() est 0-indexé donc -1 = 2 mois avant)
  const expYear = now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear()
  const pmInput = { type: 'card', card: { number: '4242424242424242', exp_month: expMonth, exp_year: expYear, cvc: '314' } }
  const pmLabel = `raw_card exp=${String(expMonth).padStart(2, '0')}/${expYear} (expirée)`

  const { customer, sub } = await createTrialCustomer({
    email, name: 'S3 Expired Card', pmInput, trialDays, priceId: price.id,
  })

  if (customer) stats.holdsExpectedFail++

  logScenario({
    id: '3', name: 'Trial bloqué (carte expirée — carte brute)',
    email, customerId: customer?.id, subId: sub?.id ?? '(annulée par Trial Guard via webhook)',
    pmToken: pmLabel, trialDays,
    expectedOutcome: 'Hold échoue (expired_card via carte brute) → subscription annulée → paymentIntentStatus: "failed"',
  })
}

// Scénario 4 — Trial bloqué (carte frauduleuse)
async function runScenario4(price) {
  const ts = Date.now()
  const email = `s4-fraud-${ts}@trial-test.com`
  const pmToken = 'pm_card_chargeDeclinedFraudulent'
  const trialDays = 7

  const { customer, sub } = await createTrialCustomer({
    email, name: 'S4 Fraudulent Card', pmInput: pmToken, trialDays, priceId: price.id,
  })

  if (customer) stats.holdsExpectedFail++

  logScenario({
    id: '4', name: 'Trial bloqué (carte frauduleuse)',
    email, customerId: customer?.id, subId: sub?.id ?? '(annulée par Trial Guard via webhook)',
    pmToken, trialDays,
    expectedOutcome: 'Hold échoue (fraudulent) → subscription annulée → paymentIntentStatus: "failed"',
  })
}

// Scénario 5 — Trial annulé (hold libéré)
// Hold réussit d'abord, puis on annule → webhook libère le PaymentIntent
async function runScenario5(price) {
  const ts = Date.now()
  const email = `s5-cancelled-${ts}@trial-test.com`
  const pmToken = 'pm_card_visa'
  const trialDays = 7

  const { customer, sub } = await createTrialCustomer({
    email, name: 'S5 Cancelled Trial', pmInput: pmToken, trialDays, priceId: price.id,
  })

  if (sub?.id) {
    console.log('   ↳ [S5] Attente 5s — le webhook doit placer le hold avant l\'annulation...')
    await sleep(5000)
    await cancelSubscription(sub.id)
  }

  logScenario({
    id: '5', name: 'Trial annulé (hold libéré)',
    email, customerId: customer?.id, subId: sub?.id,
    pmToken, trialDays,
    expectedOutcome: 'Hold placé puis libéré → paymentIntentStatus: "cancelled"',
  })
}

// Scénario 6 — Mode Selective, pas de risque
// Prérequis : StripeConnection.trialGuardMode = "selective" dans MongoDB
async function runScenario6(price) {
  const ts = Date.now()
  const email = `s6-selective-norisk-${ts}@trial-test.com`
  const pmToken = 'pm_card_visa'
  const trialDays = 7

  console.log(
    '\n   ⚠️  [S6] PRÉREQUIS : StripeConnection.trialGuardMode doit être "selective" dans MongoDB\n' +
    '         Si la connexion est en mode "universal", un hold sera placé quand même\n' +
    '         Pour le changer : Settings → Trial Guard Mode → Selective'
  )

  const { customer, sub } = await createTrialCustomer({
    email, name: 'S6 Selective No Risk', pmInput: pmToken, trialDays, priceId: price.id,
  })

  logScenario({
    id: '6', name: 'Mode Selective — aucun risque (pas de hold)',
    email, customerId: customer?.id, subId: sub?.id,
    pmToken, trialDays,
    expectedOutcome: 'Mode selective + 0 signal → PAS de hold → paymentIntentStatus: null',
  })
}

// Scénario 7 — Mode Selective, carte qui expire avant la fin du trial (risque détecté → hold)
// pm_card_visa_prepaid n'est pas un token PaymentMethod valide dans Stripe.
// On simule un signal de risque via une carte brute dont l'expiry tombe avant trial_end.
// Signal déclenché : card_expires_before_trial_end
// Prérequis : StripeConnection.trialGuardMode = "selective" dans MongoDB
async function runScenario7(price) {
  const ts = Date.now()
  const email = `s7-selective-expiringtrial-${ts}@trial-test.com`
  const trialDays = 7

  // Carte qui expire le mois précédent → toujours avant trial_end (now + 7j)
  // Stripe test mode accepte les cartes expirées
  const now = new Date()
  const expMonth = now.getMonth() === 0 ? 12 : now.getMonth() // mois précédent (1-indexé)
  const expYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const pmInput = { type: 'card', card: { number: '4242424242424242', exp_month: expMonth, exp_year: expYear, cvc: '314' } }
  const pmLabel = `raw_card exp=${String(expMonth).padStart(2, '0')}/${expYear}`

  console.log(
    '\n   ⚠️  [S7] PRÉREQUIS : StripeConnection.trialGuardMode doit être "selective" dans MongoDB\n' +
    `         Carte brute exp=${String(expMonth).padStart(2, '0')}/${expYear} → expire avant trial_end → signal card_expires_before_trial_end\n` +
    '         En mode universal, le hold est aussi placé (même résultat, raison différente)'
  )

  const { customer, sub } = await createTrialCustomer({
    email, name: 'S7 Selective Expiring Card', pmInput, trialDays, priceId: price.id,
  })

  if (sub) stats.holdsExpectedOk++

  logScenario({
    id: '7', name: 'Mode Selective — carte expire avant trial (hold déclenché)',
    email, customerId: customer?.id, subId: sub?.id,
    pmToken: pmLabel, trialDays,
    expectedOutcome: `Mode selective + card_expires_before_trial_end → hold placé → paymentIntentStatus: "held", riskSignals: ["card_expires_before_trial_end"]`,
  })
}

// Scénario 8 — Trial trop long (ignoré par Trial Guard)
// 14 jours > 7 jours max → Trial Guard skip
async function runScenario8(price) {
  const ts = Date.now()
  const email = `s8-toolong-${ts}@trial-test.com`
  const pmToken = 'pm_card_visa'
  const trialDays = 14

  const { customer, sub } = await createTrialCustomer({
    email, name: 'S8 Too Long Trial', pmInput: pmToken, trialDays, priceId: price.id,
  })

  if (sub) stats.trialsIgnored++

  logScenario({
    id: '8', name: 'Trial trop long (ignoré par Trial Guard)',
    email, customerId: customer?.id, subId: sub?.id,
    pmToken, trialDays,
    expectedOutcome: '14j > 7j max → Trial Guard ignoré → aucun hold → log "[TRIAL-GUARD] Trial > 7 days — skipping"',
  })
}

// ─────────────────────────────────────
// BILAN FINAL
// ─────────────────────────────────────

function printSummary() {
  console.log(`
╔═══════════════════════════════════════╗
║     REVENANT — SEED TRIAL GUARD       ║
╠═══════════════════════════════════════╣
║                                       ║
║  Customers créés         : ${String(stats.customersCreated).padEnd(10)} ║
║  Trials démarrés         : ${String(stats.trialsStarted).padEnd(10)} ║
║  Holds attendus (OK)     : ${String(stats.holdsExpectedOk).padEnd(10)} ║
║  Holds attendus (échec)  : ${String(stats.holdsExpectedFail).padEnd(10)} ║
║  Trials annulés          : ${String(stats.trialsCancelled).padEnd(10)} ║
║  Trials ignorés (>7j)    : ${String(stats.trialsIgnored).padEnd(10)} ║
║                                       ║
║  ⚠  Holds/annulations = async webhook ║
║     Vérifie MongoDB pour le statut    ║
║     réel (pas dans ce script)         ║
║                                       ║
╠═══════════════════════════════════════╣
║  CE QUE TU DOIS VÉRIFIER             ║
╠═══════════════════════════════════════╣
║                                       ║
║  1. Dans Stripe Dashboard             ║
║     → Compte connecté                 ║
║     → 8 customers créés              ║
║     → Subscriptions en trial          ║
║     → PaymentIntents créés            ║
║       (scénarios 1, 5, 7)            ║
║                                       ║
║  2. Dans les logs Vercel              ║
║     → [TRIAL-GUARD] Hold placed       ║
║       scénarios 1, 5, 7              ║
║     → [TRIAL-GUARD] Hold failed       ║
║       scénarios 2, 3, 4              ║
║     → [TRIAL-GUARD] Trial > 7 days   ║
║       scénario 8                      ║
║     → [TRIAL-GUARD] monitoring only   ║
║       scénario 6                      ║
║     → Aucun "No handler for event"    ║
║       sur les events subscription     ║
║                                       ║
║  3. Dans MongoDB — Subscription       ║
║     → paymentIntentStatus: "held"     ║
║       → scénarios 1, 7 (si selective)║
║     → paymentIntentStatus: "failed"   ║
║       → scénarios 2, 3, 4           ║
║     → paymentIntentStatus: "cancelled"║
║       → scénario 5                   ║
║     → paymentIntentStatus: null       ║
║       → scénario 6 (si mode selective)║
║     → trialGuardEnabled: false        ║
║       → scénario 8 (14j, ignoré)     ║
║                                       ║
║  4. Dans le Dashboard REVENANT        ║
║     → Page Trial Guard                ║
║     → Trials protégés ce mois        ║
║     → Bloqués (scénarios 2, 3, 4)   ║
║     → Holds actifs (scénarios 1, 7)  ║
║       S7 : signal card_expires_before║
║       _trial_end (pas prepaid_card)  ║
║                                       ║
║  ⚠️  Scénarios 6 & 7 : nécessitent  ║
║     trialGuardMode: "selective"       ║
║     dans StripeConnection (MongoDB)   ║
╚═══════════════════════════════════════╝
`)
}

// ─────────────────────────────────────
// MAIN
// ─────────────────────────────────────

async function seed() {
  console.log('🌱 REVENANT SEED — Trial Guard — compte connecté:', CONNECTED_ACCOUNT_ID)

  const args = process.argv.slice(2)
  const scenarioArg = args.find((a) => a.startsWith('--scenario='))
  const targetId = scenarioArg ? parseInt(scenarioArg.split('=')[1]) : null

  if (targetId) console.log(`\n🎯 Mode scénario unique : S${targetId}`)

  const price = await setupProduct()

  const scenarios = [
    { id: 1, fn: runScenario1 },
    { id: 2, fn: runScenario2 },
    { id: 3, fn: runScenario3 },
    { id: 4, fn: runScenario4 },
    { id: 5, fn: runScenario5 },
    { id: 6, fn: runScenario6 },
    { id: 7, fn: runScenario7 },
    { id: 8, fn: runScenario8 },
  ]

  for (const { id, fn } of scenarios) {
    if (targetId && id !== targetId) continue
    try {
      await fn(price)
    } catch (err) {
      console.error(`\n❌ Scénario ${id} — Erreur inattendue: ${err.message}`)
    }
    if (!targetId || id !== scenarios[scenarios.length - 1].id) {
      await sleep(1500)
    }
  }

  printSummary()
}

seed().catch(console.error)
