# Customer Notification Gaps — Implementation Plan

**Date:** 29 June 2026

---

## Problem

5 critical and 3 medium user journeys involve a state change (reschedule, cancel, no-show, payment, job completion) but don't offer Dave a way to notify Sophie. The app already has a `SendSheet` pattern and a `getFilledTemplateMessage` template engine — the fix is to open the SendSheet with a pre-filled message after each state change.

## Existing Pattern (how the app already works)

The app uses `setSendSheetConfig({ title, messageText, onSend })` to open the SendSheet. The message text comes from `getFilledTemplateMessage(userId, category, job, customer, profile, total, fallbackText)` which looks up the user's custom template for that category, or falls back to the hardcoded fallback string.

**Existing categories:** `booking`, `reminder`, `invoice`, `follow_up`, `review`, `receipt`, `update`, `custom`, `recurring_reminder`

**Existing placeholders:** `{firstName}`, `{lastName}`, `{jobTitle}`, `{date}`, `{time}`, `{address}`, `{amount}`, `{businessName}`, `{jobNumber}`, `{bookingLink}`, `{reviewLink}`

**SendSheet render:** Already mounted at line 3473 of JobDetail, driven by `sendSheetConfig` state. When `sendSheetConfig` is set, the sheet opens. When `onSend` or `onClose` fires, it's cleared.

---

## Implementation — 5 Critical Gaps + 3 Medium Gaps

All changes are in **one file**: `src/screens/JobDetail/index.tsx`

The pattern for each fix is:
1. After the state change completes (Dexie update + sync queue + work log), call `setSendSheetConfig()` with a pre-filled message
2. Use `getFilledTemplateMessage()` with an appropriate category and fallback text
3. The SendSheet opens — Dave can edit, send via WhatsApp/SMS, or close without sending
4. If Dave closes without sending, no harm done — the state change already happened

### Gap 1: Reschedule (Critical)

**Current:** `handleReschedule` (line 1047) updates the job date, adds a work-log note, closes the sheet, and refreshes. No SendSheet.

**Fix:** After `setSheet(null)`, before `refresh()`, open the SendSheet:

```typescript
// After existing code at line 1068-1069
setRescheduleDate('');
setSheet(null);

// Open SendSheet to inform customer of new date
if (customer && profile && userId) {
  const newDate = formatShortDate(new Date(rescheduleDate));
  const newTime = formatTime(new Date(rescheduleDate));
  const fallback = `Hi ${customer.name.split(' ')[0]}, I've rescheduled your ${job.title} to ${newDate} at ${newTime}. Does that still work for you?\n— ${profile.business_name || profile.full_name}`;
  const msg = await getFilledTemplateMessage(userId, 'booking', job, customer, profile, total, fallback);
  setSendSheetConfig({
    title: `Inform ${customer.name} about reschedule?`,
    messageText: msg,
    onSend: () => { setSendSheetConfig(null); refresh(); },
  });
} else {
  refresh();
}
```

**Template category:** `booking` (reuses the booking confirmation template which includes `{date}` and `{time}` — these will now reflect the NEW rescheduled date because the job was already updated in Dexie).

**Edge case — no customer phone:** If `customer.phone` is empty, SendSheet's WhatsApp/SMS buttons are disabled (existing behaviour). Dave sees the message but can't send. That's fine — he can copy it.

### Gap 2: Job cancellation (Critical)

**Current:** `handleCancelJob` (line 439) marks the job cancelled, adds a work-log, shows a toast, and closes the sheet. No SendSheet.

**Fix:** After `setSheet(null)`, before `refresh()`:

```typescript
setSheet(null);

if (customer && profile && userId) {
  const fallback = `Hi ${customer.name.split(' ')[0]}, sorry but I need to cancel the ${job.title} scheduled for ${job.scheduled_start ? formatShortDate(new Date(job.scheduled_start)) : 'the planned date'}. Let me know when works to reschedule.\n— ${profile.business_name || profile.full_name}`;
  const msg = await getFilledTemplateMessage(userId, 'update', job, customer, profile, total, fallback);
  setSendSheetConfig({
    title: `Inform ${customer.name} about cancellation?`,
    messageText: msg,
    onSend: () => { setSendSheetConfig(null); refresh(); },
  });
} else {
  refresh();
}
```

**Template category:** `update` (generic update template). No dedicated "cancellation" category exists — `update` is the closest. Dave can edit the message.

### Gap 3: No-show (Critical)

**Current:** `handleNotHome` (line 466) marks the job `no_show`, adds a work-log, and refreshes. No toast, no SendSheet.

**Fix:** After the existing code, before `refresh()`:

```typescript
if (customer && profile && userId) {
  const fallback = `Hi ${customer.name.split(' ')[0]}, I called today but no one was home. Can we reschedule the ${job.title}?\n— ${profile.business_name || profile.full_name}`;
  const msg = await getFilledTemplateMessage(userId, 'update', job, customer, profile, total, fallback);
  setSendSheetConfig({
    title: `Inform ${customer.name} about no-show?`,
    messageText: msg,
    onSend: () => { setSendSheetConfig(null); refresh(); },
  });
} else {
  refresh();
}
```

### Gap 4: Payment receipt — auto-open SendSheet when marked paid (Critical)

**Current:** `handleMarkDone` and `handleMarkAsPaid` both set status to `paid` but don't auto-open a receipt SendSheet. The "Send receipt" button exists on the paid screen (line 1387) but requires Dave to find it and tap it.

**Fix for `handleMarkDone` (line 575, after `fullyPaidNow` block):** When the job becomes `paid`, instead of just showing a review prompt or recurring prompt, open the receipt SendSheet FIRST:

```typescript
if (fullyPaidNow) {
  hapticSuccess();
  showSuccess('Job marked as paid');
  setContextualFlag();
  captureJobMarkedPaid();
  resolveChases(job.id).catch(() => {});

  // Auto-open receipt SendSheet
  if (customer && profile && userId) {
    const fallback = `Hi ${customer.name.split(' ')[0]}, payment of £${total.toFixed(2)} for ${job.title} has been confirmed. Thanks for your business!\n— ${profile.business_name || profile.full_name}`;
    const receiptMsg = await getFilledTemplateMessage(userId, 'receipt', job, customer, profile, total, fallback);
    setSheet(null);
    setSendSheetConfig({
      title: `Send receipt to ${customer.name}?`,
      messageText: receiptMsg,
      onSend: () => {
        setSendSheetConfig(null);
        // Chain to review prompt if applicable
        if (profile?.google_business_url && profile?.reviews_enabled !== false && can('google_reviews')) {
          setTimeout(() => {
            setSheet('review_prompt');
            captureReviewRequestShown({ jobId: job.id });
          }, 500);
        } else if (job.title !== 'Callout charge') {
          setTimeout(() => setSheet('recurring_prompt'), 500);
        }
      },
    });
  } else {
    setSheet(null);
    // Existing review/recurring prompt logic
  }
}
```

**Fix for `handleMarkAsPaid` (line 672, same pattern):** Same approach — auto-open receipt SendSheet, then chain to review/recurring prompt in `onSend`.

**Important:** The `onSend` callback chains to the existing review prompt / recurring prompt flow. If Dave closes the SendSheet without sending, `onClose` fires (which calls `setSendSheetConfig(null); setSheet(null)`) — the review/recurring prompt is skipped. This is acceptable — Dave chose not to send a receipt, he can still find the review request later.

### Gap 5: Job complete + awaiting payment (Critical)

**Current:** `handleMarkDone('not_yet')` (line 529) marks the job `awaiting_payment`, creates payment chases, and closes the sheet. No SendSheet.

**Fix:** After the existing code, before `setSheet(null)`:

```typescript
// After existing addToSyncQueue calls
createPaymentChases(job.id, userId!, n).catch(() => {});

// Open SendSheet to inform customer the job is done + invoice is due
if (customer && profile && userId) {
  const fallback = `Hi ${customer.name.split(' ')[0]}, the ${job.title} is all done. The invoice of £${total.toFixed(2)} is now due. Let me know if you need the payment link.\n— ${profile.business_name || profile.full_name}`;
  const msg = await getFilledTemplateMessage(userId, 'invoice', job, customer, profile, total, fallback);
  setSheet(null);
  setSendSheetConfig({
    title: `Send invoice to ${customer.name}?`,
    messageText: msg,
    pdfOptions: {
      label: 'Attach PDF invoice',
      generatePdf: async () => generateInvoicePDF({ profile, customer, job, lineItems, total, payments, amountDue: total }),
      fileName: `invoice-${job.job_number || job.id.slice(0,8)}.pdf`,
    },
    onSend: () => { setSendSheetConfig(null); refresh(); },
  });
} else {
  setSheet(null);
}
```

**Template category:** `invoice` (uses the invoice reminder template which includes `{amount}`).

**PDF attachment:** This is the perfect place to offer the PDF invoice attachment — Dave sends the completion message WITH the invoice PDF attached. The `pdfOptions` pattern already exists in SendSheet and is used by the quote send flow.

### Gap 6: Start job (Medium)

**Current:** `doStartJob` (line 981) marks the job `in_progress`, shows a toast, and navigates to home. No SendSheet.

**Fix:** This is medium priority because Dave is likely on-site and starting work — he may not want to send a message. But for some trades (plumber arriving at a property), an "I've arrived" message is useful.

**Approach:** Don't auto-open the SendSheet. Instead, show a toast with a "Tell customer" action:

```typescript
showToast("Job started — tap to tell customer", 'success', 4000, {
  actionLabel: 'Tell customer',
  onAction: () => {
    if (customer && profile && userId) {
      const fallback = `Hi ${customer.name.split(' ')[0]}, I've arrived and started the ${job.title}. I'll update you when I'm done.\n— ${profile.business_name || profile.full_name}`;
      getFilledTemplateMessage(userId, 'update', job, customer, profile, total, fallback).then(msg => {
        setSendSheetConfig({
          title: `Tell ${customer.name} you've started?`,
          messageText: msg,
          onSend: () => { setSendSheetConfig(null); },
        });
      });
    }
  },
});
```

**Note:** This requires checking if `showToast` supports an action callback. If not, skip this gap for now — it's medium priority and the auto-open approach would be too aggressive when Dave is rushing to start a job.

### Gap 7: £0.00 job completion (Medium)

**Current:** Both `handleMarkDone` and `handleMarkAsPaid` have a `total === 0` path that marks the job paid without any SendSheet.

**Fix:** After the existing code for £0.00 jobs, open a SendSheet:

```typescript
if (customer && profile && userId) {
  const fallback = `Hi ${customer.name.split(' ')[0]}, the ${job.title} is all done — no charge. Thanks for having me!\n— ${profile.business_name || profile.full_name}`;
  const msg = await getFilledTemplateMessage(userId, 'receipt', job, customer, profile, 0, fallback);
  setSheet(null);
  setSendSheetConfig({
    title: `Tell ${customer.name} it's all done?`,
    messageText: msg,
    onSend: () => { setSendSheetConfig(null); refresh(); },
  });
}
```

### Gap 8: Manual status revert (Medium)

**Current:** `handleChangeStatus` (line 1073) reverts the status but doesn't notify.

**Fix:** Low priority — this is an admin correction. Skip for now. If Dave is reverting a status, something went wrong and he probably doesn't want to send a confusing message to Sophie. He can manually send an update if needed.

---

## New Template Categories

Two new template categories would improve the experience:

| Category | Name | Default body | Used by |
|---|---|---|---|
| `reschedule` | Reschedule notice | `Hi {firstName}, I've rescheduled your {jobTitle} to {date} at {time}. Does that still work for you?\n— {businessName}` | Gap 1 |
| `cancellation` | Cancellation notice | `Hi {firstName}, sorry but I need to cancel the {jobTitle}. Let me know when works to reschedule.\n— {businessName}` | Gap 2 |

**Why:** Currently reschedule uses `booking` category (which says "is confirmed for" — wrong tone for a reschedule) and cancellation uses `update` (too generic). Dedicated categories let Dave customise the message.

**Implementation:**
1. Add `'reschedule'` and `'cancellation'` to `TemplateCategory` in `db.ts`
2. Add seed templates in `seedMessageTemplates.ts`
3. Add a Supabase migration to extend the `message_templates_category_check` constraint
4. Use the new categories in the fallback code above

**However:** Adding new template categories requires a Supabase migration (ALTER TABLE constraint) and re-seeding. This adds complexity. **Alternative: use existing categories** (`booking` for reschedule, `update` for cancellation) and let Dave edit the message in the SendSheet. This is simpler and can be done without any migration.

**Recommendation:** Use existing categories for now. Add dedicated categories in a future sprint when template management is more mature.

---

## File Changes Summary

| File | Change | Gaps addressed |
|---|---|---|
| `src/screens/JobDetail/index.tsx` | Add SendSheet calls after state changes in: `handleReschedule`, `handleCancelJob`, `handleNotHome`, `handleMarkDone` (3 paths: paid, not_yet, £0), `handleMarkAsPaid` (2 paths: paid, £0) | 1, 2, 3, 4, 5, 7 |

**No other files need changes.** The SendSheet, template engine, and all supporting infrastructure already exist.

---

## Edge Cases

| # | Case | Handling |
|---|---|---|
| EC-1 | Customer has no phone | SendSheet opens but WhatsApp/SMS buttons are disabled (existing behaviour). Dave can copy the message. |
| EC-2 | Dave closes SendSheet without sending | `onClose` fires, `setSendSheetConfig(null)` clears the config. State change already happened — no rollback. |
| EC-3 | Review prompt / recurring prompt chain | Gap 4 chains: receipt SendSheet → onSend → review prompt → recurring prompt. If Dave skips receipt, the chain is broken — he can still find review request on the paid screen. |
| EC-4 | Job has no customer (deleted customer) | `if (customer && ...)` guard prevents SendSheet from opening. State change proceeds normally. |
| EC-5 | Offline mode | SendSheet opens normally. WhatsApp/SMS deep links work offline (they queue in the messaging app). PDF generation works offline (uses jsPDF). |
| EC-6 | Payment marked as deposit (not fully paid) | `fullyPaidNow` is false — receipt SendSheet doesn't open. Dave sees "Deposit recorded — balance still due" toast (existing). Receipt only opens when fully paid. |
| EC-7 | Reschedule to same date | `handleReschedule` checks `rescheduleDate` is set. If Dave picks the same date, the job is updated (no-op) and SendSheet opens with the same date — harmless. |
| EC-8 | Rapid double-tap on payment button | `paymentProcessing` guard prevents double execution (existing). |

---

## Implementation Order

1. **Gap 1 (Reschedule)** — highest impact, most requested
2. **Gap 2 (Cancellation)** — high impact
3. **Gap 3 (No-show)** — high impact
4. **Gap 5 (Job complete + invoice)** — high impact, includes PDF attachment
5. **Gap 4 (Payment receipt auto-open)** — chains with review/recurring prompts
6. **Gap 7 (£0.00 job)** — quick win
7. **Gap 6 (Start job)** — medium, needs toast action support check
8. **Gap 8 (Status revert)** — skip

Each gap is independent — they can be implemented and committed one at a time.
