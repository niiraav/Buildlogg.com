import { AlertCircle, TrendingUp, Info, X, ChevronRight } from 'lucide-react';
import type { Insight, InsightSeverity } from '../../lib/insights';
import { haptic } from '../../lib/haptics';

export interface InsightCardProps {
  insight: Insight;
  onDismiss: (id: string) => void;
  onCta: (insight: Insight) => void;
}

const SEVERITY_CONFIG: Record<
  InsightSeverity,
  { icon: typeof AlertCircle; color: string; borderColor: string }
> = {
  warning: { icon: AlertCircle, color: 'text-status-amber', borderColor: '#B45309' },
  positive: { icon: TrendingUp, color: 'text-status-green', borderColor: '#15803D' },
  info: { icon: Info, color: 'text-status-blue', borderColor: '#1D4ED8' },
};

export function InsightCard({ insight, onDismiss, onCta }: InsightCardProps) {
  const config = SEVERITY_CONFIG[insight.severity];
  const Icon = config.icon;

  return (
    <div
      className="bg-white border border-brand-border rounded-xl p-4"
      style={{ borderLeft: `3px solid ${config.borderColor}` }}
    >
      <div className="flex items-start gap-2.5">
        <Icon size={18} className={`${config.color} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${config.color}`}>{insight.title}</p>
          <p className="text-sm text-brand-dark leading-relaxed mt-1">{insight.body}</p>
          {insight.ctaLabel && insight.ctaRoute && (
            <button
              onClick={() => { haptic('light'); onCta(insight); }}
              className={`flex items-center gap-1 mt-2.5 text-xs font-semibold ${config.color} cursor-pointer active:opacity-70`}
            >
              {insight.ctaLabel}
              <ChevronRight size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => { haptic('light'); onDismiss(insight.id); }}
          className="shrink-0 text-brand-muted/60 cursor-pointer"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export default InsightCard;
