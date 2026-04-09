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
  // Revenue Health Score — computed at end of each sync
  healthScore: {
    total: { type: Number },
    dimensions: {
      expiryRisk:    { type: Number },
      failureRate:   { type: Number },
      recoveryRate:  { type: Number },
      customerRisk:  { type: Number },
      dunningConfig: { type: Boolean },
    },
    computedAt: { type: Date },
  },
  // Onboarding nurture email tracking (steps 0-3 = emails 1-4)
  onboardingEmailsSent: { type: [Number], default: [] },
  // Trial Guard — mode and activation (top-level for quick access in webhook)
  trialGuardMode: {
    type: String,
    enum: ['universal', 'selective'],
    default: 'universal',
  },
  trialGuardActive: { type: Boolean, default: true },
  // Feature settings — all have opinionated defaults, nothing is required to configure
  settings: {
    trialGuard: {
      enabled:        { type: Boolean, default: true },
      radarThreshold: { type: Number,  default: 65   },
    },
  },
}, { timestamps: true });

// Used in cron/prevention: find({ syncStatus: 'done' })
stripeConnectionSchema.index({ syncStatus: 1 });

export default mongoose.models.StripeConnection ||
  mongoose.model('StripeConnection', stripeConnectionSchema);
