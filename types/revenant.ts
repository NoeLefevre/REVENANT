export type DIECategory = 'SOFT_TEMPORARY' | 'SOFT_UPDATABLE' | 'HARD_PERMANENT';
export type RecoveryTier = 'HIGH_VALUE' | 'STANDARD' | 'LOW_PRIORITY';
export type InvoiceStatus = 'open' | 'recovered' | 'void' | 'uncollectible';
export type SequenceStatus = 'active' | 'stopped' | 'completed' | 'recovered';
export type SyncStatus = 'pending' | 'syncing' | 'done' | 'error';

export interface Invoice {
  _id: string;
  orgId: string;
  stripeInvoiceId: string;
  stripeSubscriptionId?: string;
  stripeCustomerId: string;
  customerEmail?: string;
  customerName?: string;
  amount: number; // cents
  currency: string;
  status: InvoiceStatus;
  dieCategory?: DIECategory;
  failureCode?: string;
  failureMessage?: string;
  failedAt?: string;
  recoveredAt?: string;
  retryCount: number;
  nextRetryAt?: string;
  nextRetrySource?: 'payday_inferred' | 'country_benchmark' | 'default';
  recoveryScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  _id: string;
  orgId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  customerEmail?: string;
  customerName?: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'unpaid';
  mrr: number; // cents
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: number;
  cardExpYear?: number;
  cardCountry?: string;
  recoveryScore?: number;
  inferredPaydayCycle?: string;
  currentPeriodEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DunningSequence {
  _id: string;
  invoiceId: string;
  orgId: string;
  category: 'SOFT_TEMPORARY' | 'SOFT_UPDATABLE';
  status: SequenceStatus;
  currentStep: number;
  steps: Array<{
    step: number;
    scheduledAt: string;
    sentAt?: string;
  }>;
  stoppedAt?: string;
  stoppedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StripeConnectionInfo {
  stripeAccountId: string;
  livemode: boolean;
  syncStatus: SyncStatus;
  lastSyncAt?: string;
  connectedAt: string;
}

export interface OverviewMetrics {
  mrrAtRisk: number;
  invoicesAtRiskCount: number;
  temporaryAmount: number;
  updatableAmount: number;
  trend: number; // % vs last month
  protectedMrr: number;
  protectedDelta: number;
  recoveredMrr: number;
  recoveredDelta: number;
  activeSequences: number;
  sequencesCompletingThisWeek: number;
}

export interface HealthScore {
  total: number;
  dimensions: {
    expiryRisk: number;
    failureRate: number;
    recoveryRate: number;
    customerRisk: number;
    dunningConfig: boolean;
  };
}
