import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Job, Customer, LineItem } from '../../lib/db';
import { haptic } from '../../lib/haptics';

export interface WeekViewProps {
  jobs: Job[];
  customers: Record<string, Customer>;
  lineItems: Record<string, LineItem[]>;
  onDayTap: (date: Date) => void;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VISIBLE_STATUSES = ['booked', 'in_progress'];

export function WeekView({ jobs, lineItems, onDayTap }: WeekViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return date;
    });
  }, [weekOffset]);

  const dayData = useMemo(() => {
    return weekDays.map((date) => {
      const dayJobs = jobs.filter((j) => {
        if (!j.scheduled_start) return false;
        if (!VISIBLE_STATUSES.includes(j.status)) return false;
        if (j.is_sample) return false;
        return new Date(j.scheduled_start).toDateString() === date.toDateString();
      });

      const totalRevenue = dayJobs.reduce((sum, j) => {
        const items = lineItems[j.id] || [];
        return sum + items.reduce((s, i) => s + i.amount, 0);
      }, 0);

      return {
        date,
        jobCount: dayJobs.length,
        totalRevenue,
        jobs: dayJobs,
      };
    });
  }, [weekDays, jobs, lineItems]);

  const todayStr = new Date().toDateString();
  const weekLabel = weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : `${weekOffset > 0 ? '+' : ''}${weekOffset} weeks`;

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => { haptic('light'); setWeekOffset(prev => prev - 1); }}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-brand-border bg-brand-surface cursor-pointer active:bg-brand-borderLight"
        >
          <ChevronLeft size={18} className="text-brand-dark" />
        </button>
        <span className="text-sm font-bold text-brand-black">{weekLabel}</span>
        <button
          onClick={() => { haptic('light'); setWeekOffset(prev => prev + 1); }}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-brand-border bg-brand-surface cursor-pointer active:bg-brand-borderLight"
        >
          <ChevronRight size={18} className="text-brand-dark" />
        </button>
      </div>

      {/* 7-day strip */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {dayData.map(({ date, jobCount, totalRevenue }) => {
          const isToday = date.toDateString() === todayStr;
          const isEmpty = jobCount === 0;

          return (
            <button
              key={date.toISOString()}
              onClick={() => { haptic('light'); onDayTap(date); }}
              className={`flex-shrink-0 w-[100px] rounded-xl border-2 p-3 text-center cursor-pointer transition-all active:scale-[0.97] ${
                isToday
                  ? 'border-brand-black bg-brand-surface'
                  : isEmpty
                  ? 'border-dashed border-brand-border bg-transparent'
                  : 'border-brand-border bg-white'
              }`}
            >
              <p className={`text-xs ${isToday ? 'font-bold text-brand-black' : 'text-brand-mid'}`}>
                {DAY_NAMES[(date.getDay() + 6) % 7]}
              </p>
              <p className={`text-lg font-extrabold mt-1 ${isToday ? 'text-brand-black' : 'text-brand-dark'}`}>
                {date.getDate()}
              </p>
              <div className="mt-2">
                {isEmpty ? (
                  <p className="text-xs text-brand-muted">No jobs</p>
                ) : (
                  <>
                    <p className={`text-sm font-bold ${isToday ? 'text-brand-black' : 'text-brand-dark'}`}>
                      {jobCount > 9 ? '10+' : jobCount}
                    </p>
                    <p className="text-xs text-brand-muted mt-0.5">
                      £{totalRevenue.toFixed(0)}
                    </p>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default WeekView;
