/**
 * Generate an ICS (iCalendar) file for a booked job and trigger download/open.
 * Works on both iOS and Android — iOS Safari opens the Calendar app import dialog
 * when a .ics file is opened.
 */

interface CalendarJobData {
  title: string;
  scheduled_start?: string;
  scheduled_end?: string;
  customerName: string;
  customerPhone?: string;
  address?: string;
  notes?: string;
  jobId?: string;
}

/** Format a Date as UTC ICS datetime: YYYYMMDDTHHMMSSZ */
function formatICSDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

/** Escape text for ICS per RFC 5545: escape backslash, semicolon, comma, newline */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Generate ICS file content string */
export function generateICS(job: CalendarJobData): string {
  const now = new Date();
  const dtstamp = formatICSDate(now);

  let dtstart: string;
  let dtend: string;

  if (job.scheduled_start) {
    const start = new Date(job.scheduled_start);
    dtstart = formatICSDate(start);

    if (job.scheduled_end) {
      const end = new Date(job.scheduled_end);
      dtend = formatICSDate(end);
    } else {
      // Default 2-hour duration
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      dtend = formatICSDate(end);
    }
  } else {
    // No date set — use now + 2 hours as fallback
    const start = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow
    start.setHours(10, 0, 0, 0);
    dtstart = formatICSDate(start);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    dtend = formatICSDate(end);
  }

  const summary = job.title || `Job - ${job.customerName}`;
  const uid = job.jobId
    ? `${job.jobId}@buildlogg.com`
    : `${Date.now()}@buildlogg.com`;

  // Build description
  const descParts: string[] = [];
  descParts.push(`Customer: ${job.customerName}`);
  if (job.customerPhone) descParts.push(`Phone: ${job.customerPhone}`);
  if (job.notes) descParts.push(`Notes: ${job.notes}`);
  const description = descParts.join('\\n');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Buildlogg//Job Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${description}`,
  ];

  if (job.address) {
    lines.push(`LOCATION:${escapeICS(job.address)}`);
  }

  lines.push('BEGIN:VALARM');
  lines.push('TRIGGER:-PT30M');
  lines.push('ACTION:DISPLAY');
  lines.push(`DESCRIPTION:${escapeICS(summary)}`);
  lines.push('END:VALARM');

  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  // ICS requires CRLF line endings
  return lines.join('\r\n') + '\r\n';
}

/** Download/open the ICS file — triggers iOS Calendar import or Android download */
export function addToCalendar(job: CalendarJobData): void {
  const icsContent = generateICS(job);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Create a temporary link and click it to trigger download/open
  const a = document.createElement('a');
  a.href = url;
  const slug = (job.title || 'job')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  a.download = `buildlogg-${slug}.ics`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Clean up the object URL after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
