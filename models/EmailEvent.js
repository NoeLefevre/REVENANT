import mongoose from 'mongoose';

const emailEventSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
  stripeCustomerId: { type: String },
  type: {
    type: String,
    enum: [
      'dunning_soft_temporary',
      'dunning_soft_updatable',
      'expiry_j30',
      'expiry_j14',
      'expiry_j7',
      'chargeback_shield',
    ],
    required: true,
  },
  step: { type: Number },
  resendMessageId: { type: String },
  sentAt: { type: Date, default: Date.now },
  openedAt: { type: Date },
  clickedAt: { type: Date },
}, { timestamps: true });

// Dedup check in cron/prevention: subscriptionId + type + sentAt range
emailEventSchema.index({ subscriptionId: 1, type: 1, sentAt: 1 });

// Reporting queries by org
emailEventSchema.index({ orgId: 1, type: 1 });

export default mongoose.models.EmailEvent ||
  mongoose.model('EmailEvent', emailEventSchema);
