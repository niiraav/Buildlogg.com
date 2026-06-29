import { useEffect, useRef, useCallback } from 'react';

/**
 * Warns the user when they try to navigate away with unsaved changes.
 *
 * Works at two levels:
 * 1. **Browser-level**: `beforeunload` event — fires on tab close, refresh,
 *    or navigating to a different site. iOS Safari largely ignores this for
 *    PWAs, so the in-app guard is the primary mechanism.
 * 2. **In-app navigation**: Monkey-patches `history.pushState` and
 *    `history.replaceState` to intercept route changes. When unsaved changes
 *    exist, shows a `window.confirm()` dialog. If the user confirms, the
 *    navigation proceeds; if cancelled, the navigation is blocked.
 *
 * Usage:
 *   const isDirty = name !== originalName || phone !== originalPhone;
 *   useUnsavedChanges(isDirty);
 *
 * Or with a custom message:
 *   useUnsavedChanges(isDirty, 'You have unsaved changes to this template.');
 *
 * The hook automatically cleans up on unmount, so it's safe to use in
 * components that mount/unmount (screens, sheets, etc).
 */

export function useUnsavedChanges(isDirty: boolean, message = 'You have unsaved changes. Leave without saving?'): void {
  const isDirtyRef = useRef(isDirty);
  const messageRef = useRef(message);

  // Keep refs in sync so the event listeners always see the latest values
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  // beforeunload — fires on tab close / refresh / external navigation
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      // For browsers that still support returnValue
      e.returnValue = messageRef.current;
      return messageRef.current;
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // In-app navigation guard — intercepts pushState/replaceState
  useEffect(() => {
    if (!isDirty) return;

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const interceptNavigation = (
      original: typeof history.pushState,
      args: Parameters<typeof history.pushState>,
    ): void => {
      if (!isDirtyRef.current) {
        original.apply(history, args);
        return;
      }

      const confirmed = window.confirm(messageRef.current);
      if (confirmed) {
        // Temporarily mark as clean so the popstate listener doesn't re-prompt
        isDirtyRef.current = false;
        original.apply(history, args);
      }
      // If not confirmed, do nothing — navigation is blocked
    };

    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      interceptNavigation(originalPushState, args);
    };

    history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
      interceptNavigation(originalReplaceState, args);
    };

    // Also intercept popstate (browser back button)
    const handlePopState = (e: PopStateEvent) => {
      if (!isDirtyRef.current) return;
      // popstate has already fired — the URL has changed. We need to
      // re-push the original state to "undo" the back navigation.
      // The confirm dialog gives the user a choice.
      const confirmed = window.confirm(messageRef.current);
      if (!confirmed) {
        // Re-push current state to cancel the back navigation
        history.pushState(e.state || {}, '', window.location.href);
      } else {
        isDirtyRef.current = false;
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isDirty]);
}

/**
 * Helper for BottomSheet-style components.
 * Returns a wrapped onClose handler that checks for unsaved changes before closing.
 *
 * Usage:
 *   const [name, setName] = useState('');
 *   const isDirty = name !== originalName;
 *   const handleSheetClose = useDiscardGuard(isDirty, () => setShowSheet(false));
 *   // Pass handleSheetClose to BottomSheet's onClose
 */
export function useDiscardGuard(
  isDirty: boolean,
  onClose: () => void,
  message = 'You have unsaved changes. Discard and close?',
): () => void {
  const isDirtyRef = useRef(isDirty);
  const onCloseRef = useRef(onClose);
  const messageRef = useRef(message);

  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { messageRef.current = message; }, [message]);

  return useCallback(() => {
    if (isDirtyRef.current) {
      const confirmed = window.confirm(messageRef.current);
      if (!confirmed) return;
    }
    onCloseRef.current();
  }, []);
}
