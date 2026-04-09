import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stripeAccountId: { type: String, required: true },
  stripeSubscriptionId: { type: String, required: true, unique: true },
  stripeCustomerId: { type: String, required: true },
  customerEmail: { type: String },
  customerName: { type: String },
  status: {
    type: String,
    enum: ['active', 'past_due', 'canceled', 'trialing', 'unpaid'],
    required: true,
  },
  mrr: { type: Number, default: 0 },
  planId: { type: String },
  currentPeriodStart: { type: Date },
  currentPeriodEnd: { type: Date },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  // Prevention
  paymentMethodId: { type: String },
  cardBrand: { type: String },
  cardLast4: { type: String },
  cardExpMonth: { type: Number },
  cardExpYear: { type: Number },
  cardCountry: { type: String },
  // Recovery Score
  recoveryScore: { type: Number, default: null },
  recoveryScoreUpdatedAt: { type: Date },
  // Payday inference
  inferredPaydayCycle: { type: String },
  inferredPaydaySource: {
    type: String,
    enum: ['inferred', 'country_benchmark', 'default'],
    default: 'default',
  },
  // Trial Guard
  trialGuardEnabled: { type: Boolean, default: false },
  trialGuardMode: {
    type: String,
    enum: ['universal', 'selective'],
    default: 'universal',
  },
  riskSignals: { type: [String], default: [] },
  paymentIntentId: { type: String, default: null },
  paymentIntentStatus: {
    type: String,
    enum: ['pending', 'held', 'captured', 'cancelled', 'failed'],
    default: null,
  },
  holdAmount: { type: Number, default: null },   // en cents
  holdCurrency: { type: String, default: null },
  holdCreatedAt: { type: Date, default: null },
  holdExpiresAt: { type: Date, default: null },  // holdCreatedAt + 7 jours
}, { timestamps: true });

subscriptionSchema.index({ orgId: 1, stripeSubscriptionId: 1 });
subscriptionSchema.index({ orgId: 1, status: 1 });

// Used in webhook payment_method.updated: updateMany({ paymentMethodId: pm.id })
subscriptionSchema.index({ paymentMethodId: 1 });

export default mongoose.models.Subscription ||
  mongoose.model('Subscription', subscriptionSchema);
