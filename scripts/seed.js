<<<<<<< HEAD
const Stripe = require('stripe')                                                            
const CONNECTED_ACCOUNT_ID = 'acct_1TG5jaPk3SK7u5Jp'
const opts = { stripeAccount: CONNECTED_ACCOUNT_ID }                        
  
  async function seed() {
    console.log('🌱 Création des données de test sur le compte connecté', CONNECTED_ACCOUNT_ID)
=======
const Stripe = require('stripe')
const stripe = Stripe('sk_test_51S00ELIIUIa99ii0gcntnvLskqrUbbb29NCX84UEaJXJP2ISXDSqGB33CGmhzH3jwdtsFafDHfeYPXIvekDMTZon00PX1BONcx')
>>>>>>> parent of d105891 (Fix Sign in)

async function seed() {
  console.log('🌱 Création des données de test...')

  const product = await stripe.products.create({ name: 'Plan Pro Test' })
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 4900,
    currency: 'eur',
    recurring: { interval: 'month' }
  })

  async function createCustomer(email, name, pmToken, trialDays = null) {
    const customer = await stripe.customers.create({ email, name })

    let pm
    try {
      pm = await stripe.paymentMethods.attach(pmToken, { customer: customer.id })
    } catch (err) {
      console.log(`   ↳ Attach échoué comme prévu (${err.decline_code || err.code}) — webhook envoyé`)
      return // On arrête là pour ce customer, les suivants continuent
    }

    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id }
    })

    const subParams = {
      customer: customer.id,
      items: [{ price: price.id }],
      default_payment_method: pm.id,
    }

    if (trialDays) {
      subParams.trial_end = Math.floor(Date.now() / 1000) + (trialDays * 24 * 60 * 60)
    }

    try {
      await stripe.subscriptions.create(subParams)
    } catch (err) {
      console.log(`   ↳ Subscription échouée comme prévu (${err.decline_code || err.code}) — webhook envoyé`)
    }
  }

  await createCustomer('good@test.com', 'Good Customer', 'pm_card_visa')
  console.log('✅ Customer 1 — paiement réussi')

  await createCustomer('nsf@test.com', 'NSF Customer', 'pm_card_chargeDeclinedInsufficientFunds')
  console.log('✅ Customer 2 — insufficient funds (SOFT_TEMPORARY)')

  await createCustomer('expired@test.com', 'Expired Card', 'pm_card_chargeDeclinedExpiredCard')
  console.log('✅ Customer 3 — carte expirée (SOFT_UPDATABLE)')

  await createCustomer('fraud@test.com', 'Fraud Customer', 'pm_card_chargeDeclinedFraudulent')
  console.log('✅ Customer 4 — fraude (HARD_PERMANENT)')

  await createCustomer('trial@test.com', 'Trial Customer', 'pm_card_visa', 7)
  console.log('✅ Customer 5 — en trial (Trial Guard)')

  console.log('\n🎉 Seed terminé.')
  console.log('👉 Vérifie dans ton dashboard Stripe test que les 5 customers sont bien créés.')
  console.log('👉 Vérifie dans les logs Vercel que les webhooks ont bien été reçus.')
}

seed().catch(console.error)