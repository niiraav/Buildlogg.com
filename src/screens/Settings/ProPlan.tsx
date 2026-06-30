import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Check, Crown, FileText, Calendar, CreditCard, Bell, BarChart3 } from 'lucide-react';
import { db, type Profile } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { useEntitlements } from '../../hooks/useEntitlements';

const FEATURE_GROUPS = [
  {
    category: 'Quotes & Documents',
    icon: FileText,
    features: [
      { name: 'PDF quotes & invoices', desc: 'Generate professional PDFs to send or print' },
      { name: 'Send PDFs via WhatsApp', desc: 'Attach documents to messages in one tap' },
      { name: 'Logo branding on PDFs', desc: 'Your logo on every quote and invoice' },
      { name: 'Bank details on invoices', desc: 'Customers can pay by bank transfer instantly' },
      { name: 'VAT on invoices', desc: 'Add VAT breakdown for registered businesses' },
    ],
  },
  {
    category: 'Booking',
    icon: Calendar,
    features: [
      { name: 'Online booking page', desc: 'Clients pick a service and time themselves' },
      { name: 'Scheduling conflict detection', desc: 'Prevents double bookings automatically' },
    ],
  },
  {
    category: 'Payments',
    icon: CreditCard,
    features: [
      { name: 'Card payments & deposits', desc: 'Accept cards via Stripe — get paid upfront' },
      { name: 'Payment chase automation', desc: 'Automatic reminders for overdue invoices' },
    ],
  },
  {
    category: 'Automation',
    icon: Bell,
    features: [
      { name: 'Auto-reminders', desc: 'Email clients about upcoming appointments' },
      { name: 'Branded reminder emails', desc: 'Your business name and logo on every email' },
      { name: 'Message templates', desc: 'Save and reuse your most common messages' },
    ],
  },
  {
    category: 'CRM & Insights',
    icon: BarChart3,
    features: [
      { name: 'Revenue dashboard', desc: 'Track income, profit, and trends over time' },
      { name: 'Customer stats', desc: 'Total spent, job history per customer' },
      { name: 'Customer dedup', desc: 'Find and merge duplicate contacts' },
      { name: 'Business insights', desc: 'Coaching tips based on your data' },
      { name: 'Google review prompts', desc: 'Automatically ask for reviews after payment' },
    ],
  },
];

export default function ProPlan() {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);
  const { isPro } = useEntitlements();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!userId) return;
    db.profiles.get(userId).then((p) => setProfile(p || null));
  }, [userId]);

  const isActive = profile?.subscription_status === 'active';

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-app-shell-bg/95 backdrop-blur-sm border-b border-brand-border">
        <div className="flex items-center gap-3 px-4 py-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: '12px' }}>
          <button onClick={() => navigate('/settings')} className="flex items-center gap-1 text-sm text-brand-muted -ml-1">
            <ChevronLeft size={20} />
          </button>
          <span className="text-base font-bold text-brand-black">Pro plan</span>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Pro status hero */}
        <div className="relative rounded-2xl overflow-hidden mb-8" style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 60%, #60a5fa 100%)' }}>
          <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 80% 20%, #ffffff 0%, transparent 50%)' }} />
          <div className="relative p-6 text-white">
            <div className="flex items-center gap-3 mb-4">
              {/* Elegant gradient crown icon — not generic AI */}
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                <Crown size={24} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">Buildlogg Pro</h1>
                <p className="text-sm text-white/80 mt-0.5">
                  {isActive ? '£14/month — active' : 'Free during beta'}
                </p>
              </div>
            </div>

            {isPro ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                  <Check size={12} className="text-blue-600" strokeWidth={3} />
                </div>
                <span className="text-sm font-semibold">
                  {isActive ? 'Pro is active — all features unlocked' : 'Pro is enabled — all features unlocked for beta'}
                </span>
              </div>
            ) : (
              <p className="text-sm text-white/90">
                Upgrade to unlock online booking, card payments, PDF quotes, auto-reminders and more.
              </p>
            )}
          </div>
        </div>

        {/* Feature groups */}
        <div className="flex flex-col gap-8">
          {FEATURE_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.category}>
                {/* Category header */}
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#EFF6FF' }}>
                    <Icon size={15} style={{ color: '#3b82f6' }} />
                  </div>
                  <h2 className="text-sm font-bold text-brand-black">{group.category}</h2>
                </div>

                {/* Feature list */}
                <div className="flex flex-col gap-0">
                  {group.features.map((feat, i) => (
                    <div
                      key={feat.name}
                      className={`flex items-start gap-3 py-3 ${i < group.features.length - 1 ? 'border-b border-brand-borderLight' : ''}`}
                    >
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'linear-gradient(135deg, #3b82f6, #60a5fa)' }}>
                        <Check size={12} className="text-white" strokeWidth={3} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-brand-black">{feat.name}</p>
                        <p className="text-xs text-brand-muted mt-0.5 leading-relaxed">{feat.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Beta note */}
        {isPro && (
          <p className="text-xs text-brand-muted text-center mt-8 leading-relaxed">
            You're on Pro for free during beta.<br />No card required, no charge.
          </p>
        )}
      </div>
    </div>
  );
}
