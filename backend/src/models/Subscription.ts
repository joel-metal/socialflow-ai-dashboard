/**
 * Subscription & CreditLog models (in-memory — swap Map for DB in production)
 */

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';
export type SubscriptionPlan = 'free' | 'starter' | 'pro' | 'enterprise';

export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  creditsRemaining: number;
  creditsMonthly: number; // reset amount each billing cycle
  currentPeriodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreditAction =
  | 'ai:generate'
  | 'ai:analyze'
  | 'post:publish'
  | 'credit:topup'
  | 'credit:reset';

export interface CreditLog {
  id: string;
  userId: string;
  action: CreditAction;
  delta: number; // negative = deduction, positive = addition
  balanceAfter: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/** Credits granted per plan per billing cycle */
export const PLAN_CREDITS: Record<SubscriptionPlan, number> = {
  free: 20,
  starter: 200,
  pro: 1000,
  enterprise: 10000,
};

/** Credit cost per action */
export const ACTION_COST: Record<string, number> = {
  'ai:generate': 5,
  'ai:analyze': 2,
  'post:publish': 1,
};

// ── In-memory stores ──────────────────────────────────────────────────────────

const subscriptions = new Map<string, Subscription>(); // keyed by userId
const creditLogs: CreditLog[] = [];
let logIdCounter = 0;

export const SubscriptionStore = {
  findByUserId: (userId: string): Subscription | undefined => subscriptions.get(userId),

  findByStripeCustomerId: (customerId: string): Subscription | undefined =>
    [...subscriptions.values()].find((s) => s.stripeCustomerId === customerId),

  findByStripeSubscriptionId: (subId: string): Subscription | undefined =>
    [...subscriptions.values()].find((s) => s.stripeSubscriptionId === subId),

  upsert: (sub: Subscription): Subscription => {
    subscriptions.set(sub.userId, sub);
    return sub;
  },

  patch: (userId: string, patch: Partial<Subscription>): Subscription | undefined => {
    const sub = subscriptions.get(userId);
    if (!sub) return undefined;
    const updated = { ...sub, ...patch, updatedAt: new Date() };
    subscriptions.set(userId, updated);
    return updated;
  },
};

export const CreditLogStore = {
  append: (entry: Omit<CreditLog, 'id' | 'createdAt'>): CreditLog => {
    const log: CreditLog = {
      ...entry,
      id: String(++logIdCounter),
      createdAt: new Date(),
    };
    creditLogs.push(log);
    return log;
  },

  forUser: (userId: string, limit = 50): CreditLog[] =>
    creditLogs
      .filter((l) => l.userId === userId)
      .slice(-limit)
      .reverse(),
};
