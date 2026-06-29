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
const BOOKED_STATUSES = ['booked', 'in_progress'];
const QUOTED_STATUSES = ['quoted', 'enquiry'];
const MIN_WEEK_OFFSET = -4;
const MAX_WEEK_OFFSET = 2;

function formatTime(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m > 0 ? `${displayH}:${String(m).padStart(2, '0')}${period}` : `${displayH}${period}`;
}

/** Check if a job falls on a given day (handles multi-day spanning). */
function jobOnDay(job: Job, date: Date): boolean {
  if (!job.scheduled_start) return false;
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const jobStart = new Date(job.scheduled_start);

  // Multi-day job: appears on each day from scheduled_start to scheduled_end
  if (job.is_multi_day && job.scheduled_end) {
    const jobEnd = new Date(job.scheduled_end);
    return jobStart <= dayEnd && jobEnd >= dayStart;
  }

  // Single-day job: only on its scheduled_start date
  return jobStart.toDateString() === date.toDateString();
}

export function WeekView({ jobs, customers, lineItems, onDayTap }: WeekViewProps) {
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
        const statusMatch = BOOKED_STATUSES.includes(j.status) || QUOTED_STATUSES.includes(j.status);
        if (!statusMatch) return false;
        return jobOnDay(j, date);
      });

      // Sort chronologically by scheduled_start
      dayJobs.sort((a, b) => {
        const aTime = a.scheduled_start ? new Date(a.scheduled_start).getTime() : 0;
        const bTime = b.scheduled_start ? new Date(b.scheduled_start).getTime() : 0;
        return aTime - bTime;
      });

      const bookedCount = dayJobs.filter((j) => BOOKED_STATUSES.includes(j.status)).length;
      const quotedCount = dayJobs.filter((j) => QUOTED_STATUSES.includes(j.status)).length;

      const totalRevenue = dayJobs
        .filter((j) => BOOKED_STATUSES.includes(j.status))
        .reduce((sum, j) => {
          const items = lineItems[j.id] || [];
          return sum + items.reduce((s, i) => s + i.amount, 0);
        }, 0);

      return {
        date,
        jobs: dayJobs,
        bookedCount,
        quotedCount,
        totalRevenue,
      };
    });
  }, [weekDays, jobs, lineItems]);

  const todayStr = new Date().toDateString();
  const weekLabel = weekOffset === 0 ? 'This week'
    : weekOffset === 1 ? 'Next week'
    : weekOffset === -1 ? 'Last week'
    : `${weekOffset > 0 ? '+' : ''}${weekOffset} weeks`;

  const canGoBack = weekOffset > MIN_WEEK_OFFSET;
  const canGoForward = weekOffset < MAX_WEEK_OFFSET;

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => { if (canGoBack) { haptic('light'); setWeekOffset(prev => prev - 1); } }}
          className={`w-9 h-9 flex items-center justify-center rounded-lg border border-brand-border bg-brand-surface ${
            canGoBack ? 'cursor-pointer active:bg-brand-borderLight' : 'opacity-30 cursor-not-allowed'
          }`}
          disabled={!canGoBack}
        >
          <ChevronLeft size={18} className="text-brand-dark" />
        </button>
        <span className="text-sm font-bold text-brand-black">{weekLabel}</span>
        <button
          onClick={() => { if (canGoForward) { haptic('light'); setWeekOffset(prev => prev + 1); } }}
          className={`w-9 h-9 flex items-center justify-center rounded-lg border border-brand-border bg-brand-surface ${
            canGoForward ? 'cursor-pointer active:bg-brand-borderLight' : 'opacity-30 cursor-not-allowed'
          }`}
          disabled={!canGoForward}
        >
          <ChevronRight size={18} className="text-brand-dark" />
        </button>
      </div>

      {/* 7-day strip */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {dayData.map(({ date, jobs: dayJobs, bookedCount, quotedCount, totalRevenue }) => {
          const isToday = date.toDateString() === todayStr;
          const isEmpty = dayJobs.length === 0;
          const visibleJobs = dayJobs.slice(0, 3);
          const moreCount = dayJobs.length - visibleJobs.length;

          return (
            <button
              key={date.toISOString()}
              onClick={() => { haptic('light'); onDayTap(date); }}
              className={`flex-shrink-0 w-[120px] rounded-xl border-2 p-3 text-left cursor-pointer transition-all active:scale-[0.97] ${
                isToday
                  ? 'border-brand-black bg-brand-surface'
                  : isEmpty
                  ? 'border-dashed border-brand-border bg-transparent'
                  : 'border-brand-border bg-white'
              }`}
            >
              {/* Day header */}
              <div className="text-center mb-2">
                <p className={`text-xs ${isToday ? 'font-bold text-brand-black' : 'text-brand-mid'}`}>
                  {DAY_NAMES[(date.getDay() + 6) % 7]}
                </p>
                <p className={`text-lg font-extrabold mt-0.5 ${isToday ? 'text-brand-black' : 'text-brand-dark'}`}>
                  {date.getDate()}
                </p>
              </div>

              {/* Count badge: stacked booked vs quoted */}
              {isEmpty ? (
                <p className="text-xs text-brand-muted text-center">No jobs</p>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-1 mb-2">
                    {bookedCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-black" />
                        <span className="text-xs font-bold text-brand-black">{bookedCount} booked</span>
                      </div>
                    )}
                    {quotedCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full border border-brand-mid" />
                        <span className="text-xs font-medium text-brand-mid">{quotedCount} quoted</span>
                      </div>
                    )}
                  </div>
                  {totalRevenue > 0 && (
                    <p className="text-xs text-brand-muted text-center mb-2">£{totalRevenue.toFixed(0)}</p>
                  )}

                  {/* Job details (up to 3) */}
                  <div className="space-y-1.5">
                    {visibleJobs.map((j) => {
                      const isQuoted = QUOTED_STATUSES.includes(j.status);
                      const customer = j.customer_id ? customers[j.customer_id] : null;
                      const time = j.scheduled_start ? formatTime(new Date(j.scheduled_start)) : '';
                      return (
                        <div
                          key={j.id}
                          className={`rounded-md px-1.5 py-1 ${
                            isQuoted
                              ? 'border border-dashed border-brand-border bg-transparent'
                              : 'bg-brand-surface'
                          }`}
                        >
                          <p className={`text-[10px] font-medium ${isQuoted ? 'text-brand-muted' : 'text-brand-dark'} truncate`}>
                            {time && <span className="text-brand-mid">{time} </span>}
                            {customer?.name || j.title || 'Job'}
                          </p>
                          {j.title && customer && (
                            <p className="text-[10px] text-brand-muted truncate">{j.title}</p>
                          )}
                        </div>
                      );
                    })}
                    {moreCount > 0 && (
                      <p className="text-[10px] text-brand-muted text-center pt-0.5">+{moreCount} more</p>
                    )}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default WeekView;
