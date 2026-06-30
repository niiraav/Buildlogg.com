import { useLiveQuery } from 'dexie-react-hooks';
import { useAppStore } from '../store/useAppStore';
import { db } from './db';
import { getAppModeConfig, getVerticalConfig, type VerticalConfig } from './verticalConfig';

export function useVerticalConfig(): VerticalConfig {
  const userId = useAppStore((s) => s.userId);
  const profile = useLiveQuery(
    () => (userId ? db.profiles.get(userId) : undefined),
    [userId]
  );
  // Try app_mode first, fall back to business_type for existing users
  if (profile?.app_mode) return getAppModeConfig(profile.app_mode);
  return getVerticalConfig(profile?.business_type);
}
