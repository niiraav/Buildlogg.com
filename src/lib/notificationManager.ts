/**
 * Notification permission manager — replaces the cold requestNotificationPermission()
 * call with a managed flow: in-app banner first, contextual re-prompts, max 3 denials.
 */

const DISMISSAL_KEY = 'buildlogg_notification_dismissals';
const CONTEXTUAL_FLAG = 'buildlogg_show_notification_prompt';

export type NotificationState = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationState(): NotificationState {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationState;
}

export function getDismissalCount(): number {
  const raw = localStorage.getItem(DISMISSAL_KEY);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

export function incrementDismissalCount(): void {
  const current = getDismissalCount();
  localStorage.setItem(DISMISSAL_KEY, String(current + 1));
}

export function shouldShowBanner(): boolean {
  const state = getNotificationState();
  if (state === 'unsupported' || state === 'granted') return false;
  if (getDismissalCount() >= 3) return false;
  // Show if permission is 'default' OR if contextual flag is set
  return state === 'default' || localStorage.getItem(CONTEXTUAL_FLAG) === '1';
}

export function shouldShowContextualPrompt(): boolean {
  const state = getNotificationState();
  if (state === 'unsupported' || state === 'granted') return false;
  if (getDismissalCount() >= 3) return false;
  return state === 'default';
}

export function setContextualFlag(): void {
  if (shouldShowContextualPrompt()) {
    localStorage.setItem(CONTEXTUAL_FLAG, '1');
  }
}

export function clearContextualFlag(): void {
  localStorage.removeItem(CONTEXTUAL_FLAG);
}

export function isContextualActive(): boolean {
  return localStorage.getItem(CONTEXTUAL_FLAG) === '1';
}

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'default') return Notification.permission === 'granted';
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}
