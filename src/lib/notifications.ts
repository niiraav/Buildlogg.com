import { db } from './db';
import { getStaleInProgressJobs } from './jobStaleness';

function isToday(dateStr: string): boolean {
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

export async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

export async function checkEndOfDay() {
  const now = new Date();
  if (now.getHours() < 18) return; // only run after 6pm

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartStr = todayStart.toISOString();

  /* ── Existing: awaiting_payment nudges ── */
  const unpaidToday = await db.jobs
    .where('status')
    .equals('awaiting_payment')
    .filter((j) => {
      if (!j.actual_end) return false;
      return j.actual_end >= todayStartStr;
    })
    .count();

  if (unpaidToday > 0 && Notification.permission === 'granted') {
    new Notification('Buildlogg', {
      body: `${unpaidToday} job${unpaidToday > 1 ? 's' : ''} done today. Did you get paid?`,
      icon: '/icons/icon-192.png',
      tag: 'end-of-day-nudge',
    });
  }

  /* ── New: stale in_progress nudges ── */
  if (Notification.permission !== 'granted') return;

  // Get the userId from the app store (checkEndOfDay is called from App.tsx
  // which has access to the store). We need to query all stale jobs regardless
  // of user — but in practice there's only one user per device.
  // We query all in_progress jobs and let getStaleInProgressJobs handle filtering.
  const allInProgress = await db.jobs.where('status').equals('in_progress').toArray();
  const userIds = [...new Set(allInProgress.map((j) => j.user_id))];

  for (const uid of userIds) {
    const staleJobs = await getStaleInProgressJobs(uid);
    // Only notify for same_day and crossed_midnight — NOT multi_day
    const notifiable = staleJobs.filter((j) => j.staleType !== 'multi_day');
    if (notifiable.length === 0) continue;

    const mostStale = notifiable[0];
    const c = mostStale.customer;
    const jobLabel = `${c?.name || 'Job'} · ${mostStale.title}`;

    let body: string;
    if (mostStale.staleType === 'crossed_midnight') {
      body = `${jobLabel} started yesterday. Still working?`;
    } else {
      body = `${jobLabel} still in progress. Done for the day?`;
    }

    if (notifiable.length > 1) {
      body = `${notifiable.length} jobs still in progress. Done for the day?`;
    }

    const notification = new Notification('Buildlogg', {
      body,
      icon: '/icons/icon-192.png',
      tag: 'in-progress-nudge',
      data: { url: `/app/jobs/${mostStale.id}` },
    });

    notification.onclick = function () {
      window.focus();
      window.location.href = `/app/jobs/${mostStale.id}`;
    };
  }

  /* ── W1-2: End-of-day review for today's in-progress jobs ── */
  const todaysInProgress = await db.jobs
    .where('status')
    .equals('in_progress')
    .filter((j) => {
      if (!j.actual_start) return false;
      if (j.is_multi_day) return false;
      if (j.is_sample) return false;
      return isToday(j.actual_start);
    })
    .toArray();

  if (todaysInProgress.length > 0 && Notification.permission === 'granted') {
    const eodNotification = new Notification('Buildlogg', {
      body: `${todaysInProgress.length} job${todaysInProgress.length > 1 ? 's' : ''} still in progress. Done for the day?`,
      icon: '/icons/icon-192.png',
      tag: 'eod-review',
      data: { url: '/app' },
    });
    eodNotification.onclick = function () {
      window.focus();
      localStorage.removeItem('buildlogg_eod_review');
      window.location.href = '/app';
    };
  }
}
