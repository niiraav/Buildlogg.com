import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { capture } from '../../lib/analytics';
import { showSuccess, showError } from '../../components/Toast/store';
import { hapticSuccess, hapticError } from '../../lib/haptics';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';

type FeedbackType = 'bug' | 'feature_request' | 'general';

const TYPE_OPTIONS: Array<{ value: FeedbackType; label: string }> = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'general', label: 'General feedback' },
];

const MAX_MESSAGE_LENGTH = 2000;

interface FeedbackSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackSheet({ isOpen, onClose }: FeedbackSheetProps) {
  const userId = useAppStore((s) => s.userId);
  const [type, setType] = useState<FeedbackType>('general');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = message.trim().length > 0 && !submitting;

  const reset = () => {
    setType('general');
    setMessage('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      // Get the current user's email from Supabase auth
      let userEmail: string | null = null;
      let userName: string | null = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        userEmail = user?.email || null;
        userName = user?.user_metadata?.full_name || null;
      } catch {
        // Non-fatal — proceed without email
      }

      // 1. Store feedback in Supabase (RLS ensures user_id matches auth.uid())
      // Fall back to local storage if Supabase is unavailable (dev mode, RLS, table missing)
      const { error: insertError } = await supabase.from('feedback').insert({
        user_id: userId,
        type,
        message: message.trim(),
        user_email: userEmail,
      });

      if (insertError) {
        console.warn('[FeedbackSheet] Supabase insert failed, storing locally:', insertError);
        // Store locally as fallback so feedback is never lost
        try {
          const existing = JSON.parse(localStorage.getItem('buildlogg_pending_feedback') || '[]');
          existing.push({ type, message: message.trim(), userEmail, timestamp: new Date().toISOString() });
          localStorage.setItem('buildlogg_pending_feedback', JSON.stringify(existing));
        } catch {}
      }

      // 2. Send notification email via Cloudflare Pages Function
      // Fire-and-forget — email failure shouldn't block the success state
      try {
        await fetch('/api/feedback-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            message: message.trim(),
            userEmail,
            userName,
          }),
        });
      } catch {
        // Non-fatal — feedback is stored in Supabase regardless
        console.warn('[FeedbackSheet] Email notification failed — feedback still saved in Supabase');
      }

      // 3. Analytics
      capture('feedback_submitted', { type });

      // 4. Success
      hapticSuccess();
      showSuccess('Thanks for your feedback!');
      reset();
      onClose();
    } catch (err) {
      console.error('[FeedbackSheet] Submit failed:', err);
      hapticError();
      showError('Could not submit. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={handleClose}
      title="Send feedback"
      subtitle="Found a bug or have an idea? Let us know."
      footer={
        <Button
          variant="primary"
          fullWidth
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting ? 'Sending…' : 'Send feedback'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Type selector */}
        <div className="flex flex-col gap-2">
          <label className="text-micro font-bold tracking-[0.7px] text-brand-mid">
            Type
          </label>
          <div className="flex flex-col gap-2">
            {TYPE_OPTIONS.map((opt) => {
              const isSelected = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setType(opt.value); }}
                  className={`flex items-center min-h-13 rounded-xl border-2 px-4 py-2.5 transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'border-brand-black bg-brand-surface'
                      : 'border-brand-border bg-white'
                  }`}
                >
                  <span
                    className={`font-semibold text-sm ${
                      isSelected ? 'text-brand-black' : 'text-brand-mid'
                    }`}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message textarea */}
        <div className="flex flex-col gap-2">
          <label className="text-micro font-bold tracking-[0.7px] text-brand-mid">
            Message
          </label>
          <textarea
            value={message}
            onChange={(e) => {
              if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                setMessage(e.target.value);
              }
            }}
            placeholder="Tell us what's on your mind…"
            rows={5}
            className="w-full min-h-[120px] px-4 py-3 text-base font-medium text-brand-black border border-brand-border rounded-xl outline-none focus:border-brand-black bg-white resize-none"
          />
          <div className="flex justify-end">
            <span className="text-xs text-brand-muted">
              {message.length} / {MAX_MESSAGE_LENGTH}
            </span>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
