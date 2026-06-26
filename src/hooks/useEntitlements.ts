import { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/db';
import { useAppStore } from '../store/useAppStore';
import { isProFeature, type Feature } from '../lib/entitlements';

const UPGRADE_URL = import.meta.env.VITE_STRIPE_CHECKOUT_URL || 'https://buy.stripe.com/buildlogg-pro';

export interface Entitlements {
  isPro: boolean;
  can: (feature: Feature) => boolean;
  upgradeUrl: string;
}

/**
 * Entitlements hook — controls free vs Pro feature access.
 *
 * During beta: isPro = true for everyone (all features accessible).
 * Post-beta: isPro = profile.subscription_status === 'active' || 'trialing'.
 *
 * can(feature) returns true if:
 *   - User is Pro (all features accessible), OR
 *   - Feature is not in PRO_FEATURES (free feature)
 */
export function useEntitlements(): Entitlements {
  const userId = useAppStore((s) => s.userId);
  const [isPro, setIsPro] = useState(true); // Beta: everyone is Pro

  useEffect(() => {
    if (!userId) return;
    db.profiles.get(userId).then((profile) => {
      if (!profile) {
        setIsPro(true); // Beta safety: no profile = Pro
        return;
      }
      // Post-beta: check subscription_status
      // During beta: subscription_status is undefined/null → isPro = true
      const status = profile.subscription_status;
      if (status === 'active' || status === 'trialing') {
        setIsPro(true);
      } else if (status === 'expired' || status === 'canceled') {
        setIsPro(false);
      } else {
        // undefined or null — beta user with no subscription field
        setIsPro(true);
      }
    });
  }, [userId]);

  const can = useCallback(
    (feature: Feature): boolean => isPro || !isProFeature(feature),
    [isPro],
  );

  return { isPro, can, upgradeUrl: UPGRADE_URL };
}
