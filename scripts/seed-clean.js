'use strict'

const fs   = require('fs')
const path = require('path')

// ── Load .env.local ───────────────────────────────────────────────────────────
;(function loadEnv () {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      const v = t.slice(eq + 1).trim()
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
})()

const Stripe   = require('stripe')
const mongoose = require('mongoose')

// ── Config ────────────────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY    = process.env.STRIPE_SECRET_KEY || ''
const MONGODB_URI          = process.env.MONGODB_URI       || ''
const CONNECTED_ACCOUNT_ID = 'acct_1THqSiBeIJa2lMvm'
const opts = { stripeAccount: CONNECTED_ACCOUNT_ID }
const stripe = Stripe(STRIPE_SECRET_KEY)

if (!STRIPE_SECRET_KEY) { console.error('❌ Missing STRIPE_SECRET_KEY'); process.exit(1) }
if (!MONGODB_URI)        { console.error('❌ Missing MONGODB_URI');        process.exit(1) }

// ─────────────────────────────────────────────────────────────────────────────
// Stripe cleanup — delete all customers with @test.com email
// ─────────────────────────────────────────────────────────────────────────────
async function cleanStripeCustomers () {
  console.log('🔴 1. Suppression des customers Stripe (@test.com)...')
  let deleted = 0
  let startingAfter = undefined
  let hasMore = true

  while (hasMore) {
    const params = { limit: 100 }
    if (startingAfter) params.starting_after = startingAfter

    const list = await stripe.customers.list(params, opts)
    hasMore = list.has_more
    if (list.data.length > 0) startingAfter = list.data[list.data.length - 1].id

    for (const c of list.data) {
      if (!c.email?.includes('@test.com')) continue
      try {
        await stripe.customers.del(c.id, opts)
        console.log(`  ✅ Deleted: ${c.email} (${c.id})`)
        deleted++
      } catch (err) {
        console.log(`  ⚠ Could not delete ${c.id}: ${err.message}`)
      }
    }
  }

  console.log(`   → ${deleted} customer(s) deleted\n`)
  return deleted
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe cleanup — archive "Plan Pro Test" products and their prices
// ─────────────────────────────────────────────────────────────────────────────
async function cleanStripeProducts () {
  console.log('🔴 2. Archivage des produits "Plan Pro Test"...')
  let archived = 0

  const list = await stripe.products.list({ limit: 100, active: true }, opts)
  for (const p of list.data) {
    if (p.name !== 'Plan Pro Test') continue

    // Archive prices first
    const pricesList = await stripe.prices.list({ product: p.id, active: true, limit: 100 }, opts)
    for (const pr of pricesList.data) {
      await stripe.prices.update(pr.id, { active: false }, opts)
    }

    await stripe.products.update(p.id, { active: false }, opts)
    console.log(`  ✅ Archived: ${p.name} (${p.id}) — ${pricesList.data.length} price(s) deactivated`)
    archived++
  }

  console.log(`   → ${archived} product(s) archived\n`)
  return archived
}

// ─────────────────────────────────────────────────────────────────────────────
// MongoDB cleanup — delete all documents tied to @test.com customers
// ─────────────────────────────────────────────────────────────────────────────
async function cleanMongo () {
  console.log('🔴 3. Nettoyage MongoDB (documents @test.com)...')
  const db = mongoose.connection.db
  const TEST_EMAIL_REGEX = { $regex: /@test\.com$/i }

  // ── Subscriptions ──────────────────────────────────────────────────────────
  const subColl = db.collection('subscriptions')
  // Collect stripeCustomerIds and _ids before deletion (for cascade)
  const testSubs = await subColl
    .find({ customerEmail: TEST_EMAIL_REGEX }, { projection: { _id: 1, stripeCustomerId: 1 } })
    .toArray()
  const testCustomerIds = [...new Set(testSubs.map((s) => s.stripeCustomerId).filter(Boolean))]

  const subDel = await subColl.deleteMany({ customerEmail: TEST_EMAIL_REGEX })
  console.log(`  ✅ subscriptions:     ${subDel.deletedCount} deleted`)

  // ── Invoices ───────────────────────────────────────────────────────────────
  const invColl = db.collection('invoices')
  const testInvoices = await invColl
    .find({ customerEmail: TEST_EMAIL_REGEX }, { projection: { _id: 1 } })
    .toArray()
  const testInvoiceIds = testInvoices.map((i) => i._id)

  const invDel = await invColl.deleteMany({ customerEmail: TEST_EMAIL_REGEX })
  console.log(`  ✅ invoices:          ${invDel.deletedCount} deleted`)

  // ── Dunning Sequences (cascade from invoice IDs) ───────────────────────────
  let seqDelCount = 0
  if (testInvoiceIds.length > 0) {
    const seqDel = await db.collection('dunningsequences').deleteMany({ invoiceId: { $in: testInvoiceIds } })
    seqDelCount = seqDel.deletedCount
  }
  console.log(`  ✅ dunningsequences:  ${seqDelCount} deleted`)

  // ── Trial Guards ───────────────────────────────────────────────────────────
  const tgDel = await db.collection('trialguards').deleteMany({ customerEmail: TEST_EMAIL_REGEX })
  console.log(`  ✅ trialguards:       ${tgDel.deletedCount} deleted`)

  // ── Email Events (no customerEmail — match by stripeCustomerId) ────────────
  let emailDelCount = 0
  if (testCustomerIds.length > 0) {
    const emailDel = await db.collection('emailevents').deleteMany({
      stripeCustomerId: { $in: testCustomerIds },
    })
    emailDelCount = emailDel.deletedCount
  }
  console.log(`  ✅ emailevents:       ${emailDelCount} deleted`)

  const total = subDel.deletedCount + invDel.deletedCount + seqDelCount + tgDel.deletedCount + emailDelCount
  console.log(`\n   → ${total} MongoDB document(s) deleted total\n`)
  return total
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function clean () {
  console.log('🧹 REVENANT Seed Cleaner')
  console.log(`   Stripe account : ${CONNECTED_ACCOUNT_ID}`)
  console.log(`   Started at     : ${new Date().toISOString()}`)
  console.log('   ⚠️  Will delete all customers with @test.com emails\n')

  await mongoose.connect(MONGODB_URI)
  console.log('   MongoDB        : connected\n')

  const deletedCustomers = await cleanStripeCustomers()
  const archivedProducts = await cleanStripeProducts()
  const deletedDocs      = await cleanMongo()

  await mongoose.disconnect()

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🎉 CLEAN SUMMARY')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Stripe customers deleted  : ${deletedCustomers}`)
  console.log(`Stripe products archived  : ${archivedProducts}`)
  console.log(`MongoDB documents deleted : ${deletedDocs}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('👉 Relance seed.js pour recréer les données de test')
  console.log('   node scripts/seed.js')
  console.log('   node scripts/seed.js --group A')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

clean().catch((err) => {
  console.error('❌ Clean error:', err.message)
  process.exit(1)
})
