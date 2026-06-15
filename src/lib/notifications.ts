import { db } from './db';

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
}
