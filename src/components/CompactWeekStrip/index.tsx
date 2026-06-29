import { useMemo } from 'react';
import type { Job } from '../../lib/db';
import { haptic } from '../../lib/haptics';

export interface CompactWeekStripProps {
  jobs: Job[];
  selectedDate?: string;
  onDayTap: (date: Date) => void;
}

const DAY_NAMES = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const BOOKED_STATUSES = ['booked', 'in_progress'];
const QUOTED_STATUSES = ['quoted', 'enquiry'];

function jobOnDay(job: Job, date: Date): boolean {
  if (!job.scheduled_start) return false;
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  const jobStart = new Date(job.scheduled_start);
  if (job.is_multi_day && job.scheduled_end) {
    const jobEnd = new Date(job.scheduled_end);
    return jobStart <= dayEnd && jobEnd >= dayStart;
  }
  return jobStart.toDateString() === date.toDateString();
}

export function CompactWeekStrip({ jobs, selectedDate, onDayTap }: CompactWeekStripProps) {
  const weekDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return date;
    });
  }, []);

  const todayStr = new Date().toDateString();

  return (
    <div className="flex items-center gap-1.5 px-4 pb-2">
      {weekDays.map((date, i) => {
        const isToday = date.toDateString() === todayStr;
        // Use local date (not toISOString) to match the URL param format
        const dateStr = date.toLocaleDateString('en-CA');
        const isSelected = selectedDate === dateStr;
        const dayJobs = jobs.filter(j => {
          const statusMatch = BOOKED_STATUSES.includes(j.status) || QUOTED_STATUSES.includes(j.status);
          if (!statusMatch) return false;
          return jobOnDay(j, date);
        });
        const hasBooked = dayJobs.some(j => BOOKED_STATUSES.includes(j.status));
        const isEmpty = dayJobs.length === 0;

        return (
          <button
            key={i}
            onClick={() => { haptic('light'); onDayTap(date); }}
            className={`flex-1 min-w-[36px] max-w-[80px] rounded-lg py-1.5 px-1 flex flex-col items-center cursor-pointer transition-all active:scale-95 ${
              isToday
                ? 'bg-brand-black text-brand-surface'
                : isSelected
                ? 'bg-brand-surface border-2 border-brand-black'
                : 'bg-transparent'
            }`}
          >
            <span className={`text-[10px] font-medium ${isToday ? 'text-brand-surface/70' : 'text-brand-muted'}`}>
              {DAY_NAMES[i]}
            </span>
            <span className={`text-sm font-bold mt-0.5 ${isToday ? 'text-brand-surface' : 'text-brand-dark'}`}>
              {date.getDate()}
            </span>
            <span className={`w-1.5 h-1.5 rounded-full mt-1 ${
              isEmpty ? 'bg-brand-border'
              : hasBooked ? 'bg-status-blue'
              : 'bg-purple-500'
            }`} />
          </button>
        );
      })}
    </div>
  );
}

export default CompactWeekStrip;
