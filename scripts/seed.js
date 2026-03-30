const Stripe = require('stripe')
const stripe = Stripe('sk_test_51TEEu0RqQO9pAco7k9uGLTUxMQuQT4RD3REyWa84igWBZHl5K8tKNpRDuLqMDuwsTDEHBnZhnM9UirD8nNNfnmqq00soszHv75')
const CONNECTED_ACCOUNT_ID = 'acct_1TGmlHKI69I5xCzZ'
const opts = { stripeAccount: CONNECTED_ACCOUNT_ID }

async function seed() {
  console.log('🌱 Création des données de test sur le compte connecté:', CONNECTED_ACCOUNT_ID)

  const product = await stripe.products.create({ name: 'Plan Pro Test' }, opts)
  console.log('✅ Product créé:', product.id)

  // ✅ opts manquant ici dans ton script
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 4900,
    currency: 'eur',
    recurring: { interval: 'month' }
  }, opts) // ← MANQUAIT
  console.log('✅ Price créé:', price.id)

  async function createCustomer(email, name, pmToken, trialDays = null) {
    // ✅ opts manquant ici
    const customer = await stripe.customers.create({ email, name }, opts)
    console.log(`   ↳ Customer créé : ${customer.id}`)

    let pm
    try {
      // ✅ opts manquant ici
      pm = await stripe.paymentMethods.attach(
        pmToken,
        { customer: customer.id },
        opts // ← MANQUAIT
      )
      console.log(`   ↳ PaymentMethod attaché : ${pm.id}`)
    } catch (err) {
      console.log(`   ↳ Attach échoué (${err.decline_code || err.code})`)
      return
    }

    // ✅ opts manquant ici
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id }
    }, opts) // ← MANQUAIT

    const subParams = {
      customer: customer.id,
      items: [{ price: price.id }],
      default_payment_method: pm.id,
      expand: ['latest_invoice.payment_intent']
    }

    if (trialDays) {
      subParams.trial_end = Math.floor(Date.now() / 1000) + (trialDays * 24 * 60 * 60)
    }

    try {
      // ✅ opts manquant ici
      const sub = await stripe.subscriptions.create(subParams, opts) // ← MANQUAIT
      console.log(`   ↳ Subscription créée : ${sub.id} — status: ${sub.status}`)
    } catch (err) {
      console.log(`   ↳ Subscription échouée (${err.decline_code || err.code})`)
    }
  }

  await createCustomer('good@test.com', 'Good Customer', 'pm_card_visa')
  console.log('✅ Customer 1 — paiement réussi\n')

  await createCustomer('nsf@test.com', 'NSF Customer', 'pm_card_chargeDeclinedInsufficientFunds')
  console.log('✅ Customer 2 — insufficient funds (SOFT_TEMPORARY)\n')

  await createCustomer('expired@test.com', 'Expired Card', 'pm_card_chargeDeclinedExpiredCard')
  console.log('✅ Customer 3 — carte expirée (SOFT_UPDATABLE)\n')

  await createCustomer('fraud@test.com', 'Fraud Customer', 'pm_card_chargeDeclinedFraudulent')
  console.log('✅ Customer 4 — fraude (HARD_PERMANENT)\n')

  await createCustomer('trial@test.com', 'Trial Customer', 'pm_card_visa', 7)
  console.log('✅ Customer 5 — en trial (Trial Guard)\n')

  console.log('🎉 Seed terminé.')
  console.log('👉 Vérifie dans Stripe Dashboard → compte connecté que les 5 customers sont créés.')
  console.log('👉 Vérifie dans les logs Vercel que les webhooks ont bien été reçus.')
}

seed().catch(console.error)