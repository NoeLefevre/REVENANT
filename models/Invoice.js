import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stripeAccountId: { type: String, required: true },
  stripeInvoiceId: { type: String, required: true, unique: true },
  stripeSubscriptionId: { type: String },
  stripeCustomerId: { type: String, required: true },
  customerEmail: { type: String },
  customerName: { type: String },
  amount: { type: Number, required: true }, // in cents
  currency: { type: String, default: 'usd' },
  status: {
    type: String,
    enum: ['open', 'recovered', 'void', 'uncollectible'],
    default: 'open',
  },
  // DIE classification
  dieCategory: {
    type: String,
    enum: ['SOFT_TEMPORARY', 'SOFT_UPDATABLE', 'HARD_PERMANENT'],
    default: null,
  },
  failureCode: { type: String },
  failureMessage: { type: String },
  failedAt: { type: Date },
  recoveredAt: { type: Date },
  // Retry scheduling
  retryCount: { type: Number, default: 0 },
  nextRetryAt: { type: Date },
  nextRetrySource: {
    type: String,
    enum: ['payday_inferred', 'country_benchmark', 'default'],
    default: 'default',
  },
  lastRetryAt: { type: Date },
  // Recovery Score snapshot at time of failure
  recoveryScore: { type: Number, default: null },
}, { timestamps: true });

invoiceSchema.index({ orgId: 1, status: 1 });
invoiceSchema.index({ orgId: 1, dieCategory: 1 });
invoiceSchema.index({ nextRetryAt: 1, status: 1 }); // for cron

export default mongoose.models.Invoice ||
  mongoose.model('Invoice', invoiceSchema);
