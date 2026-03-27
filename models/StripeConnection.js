import mongoose from 'mongoose';

const stripeConnectionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  stripeAccountId: { type: String, required: true, unique: true },
  accessToken: { type: String, required: true }, // AES-256-GCM encrypted
  livemode: { type: Boolean, default: false },
  syncStatus: {
    type: String,
    enum: ['pending', 'syncing', 'done', 'error'],
    default: 'pending',
  },
  syncError: { type: String },
  lastSyncAt: { type: Date },
  connectedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Used in cron/prevention: find({ syncStatus: 'done' })
stripeConnectionSchema.index({ syncStatus: 1 });

export default mongoose.models.StripeConnection ||
  mongoose.model('StripeConnection', stripeConnectionSchema);
