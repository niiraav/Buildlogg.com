import { useLiveQuery } from 'dexie-react-hooks';
import { useAppStore } from '../store/useAppStore';
import { db } from './db';
import { getVerticalConfig, type VerticalConfig } from './verticalConfig';

export function useVerticalConfig(): VerticalConfig {
  const userId = useAppStore((s) => s.userId);
  const profile = useLiveQuery(
    () => (userId ? db.profiles.get(userId) : undefined),
    [userId]
  );
  return getVerticalConfig(profile?.business_type);
}
