export type PlanId = 'starter' | 'business' | 'premium';

export const PLANS = {
  starter: {
    id: 'starter' as PlanId,
    name: 'Starter',
    priceLabel: '$4.99 / month',
    photoLimit: 5,
    stripePriceId: 'price_replace_starter'
  },
  business: {
    id: 'business' as PlanId,
    name: 'Business',
    priceLabel: '$9.99 / month',
    photoLimit: 10,
    stripePriceId: 'price_replace_business'
  },
  premium: {
    id: 'premium' as PlanId,
    name: 'Premium',
    priceLabel: '$14.99 / month',
    photoLimit: 15,
    stripePriceId: 'price_replace_premium'
  }
};

export const MAX_PHOTOS = 15;

export function getPhotoLimit(plan?: PlanId | null) {
  if (!plan) return 0;
  return PLANS[plan]?.photoLimit ?? 0;
}
