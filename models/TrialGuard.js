import mongoose from 'mongoose';

const trialGuardSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stripeAccountId: { type: String, required: true },
  stripeCustomerId: { type: String, required: true },
  stripeSubscriptionId: { type: String, required: true, unique: true },
  // Customer readable info
  customerEmail: { type: String, default: null },
  customerName: { type: String, default: null },
  // Card info
  cardLast4: { type: String, default: null },
  cardBrand: { type: String, default: null },
  cardExpMonth: { type: Number, default: null },
  cardExpYear: { type: Number, default: null },
  cardFunding: { type: String, default: null },
  paymentIntentId: { type: String, default: null },
  riskSignals: [{ type: String }],
  isHighRisk: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['monitoring', 'hold_active', 'captured', 'cancelled', 'failed', 'expired'],
    default: 'monitoring',
  },
  preAuthAmount: { type: Number, default: 100 }, // cents
  trialEnd: { type: Date },
  capturedAt: { type: Date },
  cancelledAt: { type: Date },
  failedAt: { type: Date },
}, { timestamps: true });

trialGuardSchema.index({ orgId: 1, status: 1 });
trialGuardSchema.index({ stripeSubscriptionId: 1 });

export default mongoose.models.TrialGuard ||
  mongoose.model('TrialGuard', trialGuardSchema);
