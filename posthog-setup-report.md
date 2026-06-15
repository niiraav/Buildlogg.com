<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of Buildlogg. PostHog was already bootstrapped (`posthog-js` installed, `src/lib/analytics.ts` wrapping `posthog.init`, `identifyUser` called from `App.tsx`). The wizard extended that foundation with four missing funnel events, user identification on sign-in, and a full dashboard.

## Changes made

| File | Change |
|------|--------|
| `src/lib/analytics.ts` | Added typed wrapper functions: `captureUserSignedIn`, `captureJobBooked`, `captureJobStarted`, `captureJobCancelled` |
| `src/screens/Auth.tsx` | Calls `identifyUser` + `captureUserSignedIn` on successful email/password sign-in |
| `src/screens/JobDetail/index.tsx` | Calls `captureJobBooked` in `handleMarkAsBooked`, `captureJobStarted` in `handleStartJob`, `captureJobCancelled` in `handleCancelJob` |
| `.env` | Set `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` to the correct EU project values |

## Event inventory

| Event | Description | File |
|-------|-------------|------|
| `user_signed_up` | User completes onboarding. Properties: `trade`, `source` | `src/screens/Onboarding/index.tsx` |
| `user_signed_in` | Successful email/password sign-in | `src/screens/Auth.tsx` *(new)* |
| `job_created` | New job created via quote flow or missed-call logging. Property: `entry_point` | `src/screens/Quote/index.tsx`, `src/screens/Quote/LogMissedCall.tsx` |
| `quote_sent` | Quote sent to customer. Property: `send_method` (whatsapp \| sms \| copy) | `src/screens/Quote/index.tsx` |
| `job_booked` | Quoted job marked as booked/accepted | `src/screens/JobDetail/index.tsx` *(new)* |
| `job_started` | Job transitioned to in_progress | `src/screens/JobDetail/index.tsx` *(new)* |
| `job_marked_paid` | Payment recorded for a completed job. Property: `days_since_quote_sent` | `src/screens/JobDetail/index.tsx` |
| `job_cancelled` | Job cancelled. Property: `reason` (customer_cancelled \| dave_cancelled) | `src/screens/JobDetail/index.tsx` *(new)* |

## Next steps

We've built a dashboard and five insights based on the instrumented events:

**Dashboard**
- [Analytics basics (wizard)](https://eu.posthog.com/project/196651/dashboard/733454)

**Insights**
- [Revenue funnel](https://eu.posthog.com/project/196651/insights/6NvpeClK) — 5-step conversion funnel from signup to payment
- [New signups & sign-ins over time](https://eu.posthog.com/project/196651/insights/IWhAgXr6) — daily acquisition trend
- [Jobs pipeline over time](https://eu.posthog.com/project/196651/insights/uhlI2DH4) — weekly volume across all job statuses
- [Quote send method breakdown](https://eu.posthog.com/project/196651/insights/4JbgIIkv) — WhatsApp vs SMS vs copy-link share
- [Job cancellations over time](https://eu.posthog.com/project/196651/insights/YrBIf6Qt) — weekly cancellation count to watch for spikes

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
