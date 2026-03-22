import mongoose from 'mongoose';

const dunningSequenceSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
  },
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  category: {
    type: String,
    enum: ['SOFT_TEMPORARY', 'SOFT_UPDATABLE'],
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'stopped', 'completed', 'recovered'],
    default: 'active',
  },
  currentStep: { type: Number, default: 0 }, // 0-indexed
  steps: [{
    step: { type: Number },
    scheduledAt: { type: Date },
    sentAt: { type: Date },
    emailEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailEvent',
    },
  }],
  stoppedAt: { type: Date },
  stoppedReason: {
    type: String,
    enum: ['payment_success', 'card_updated', 'manual', 'hard_failure'],
  },
}, { timestamps: true });

dunningSequenceSchema.index({ orgId: 1, status: 1 });
dunningSequenceSchema.index({ invoiceId: 1 });

export default mongoose.models.DunningSequence ||
  mongoose.model('DunningSequence', dunningSequenceSchema);
