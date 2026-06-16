import { Hammer, WifiOff, MessageCircle, Wallet, MapPin, Smartphone } from 'lucide-react';

interface AuthDesktopLayoutProps {
  children: React.ReactNode;
  variant?: 'auth' | 'onboarding';
}

export default function AuthDesktopLayout({ children, variant = 'auth' }: AuthDesktopLayoutProps) {
  void variant;

  return (
    <div className="grid h-full min-h-full md:grid-cols-[2fr_3fr]">
      {/* Left panel — brand context (40%) */}
      <div className="relative hidden md:flex flex-col justify-between auth-left-panel p-8 lg:p-10 overflow-y-auto">
        <div className="max-w-md">
          {/* Wordmark */}
          <div className="inline-flex items-center gap-2.5 mb-6">
            <span className="w-9 h-9 rounded-lg bg-brand-black text-white grid place-items-center">
              <Hammer size={20} strokeWidth={2.2} />
            </span>
            <span className="text-[22px] font-extrabold tracking-[-0.03em] text-brand-black">
              Buildlogg
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl lg:text-4xl xl:text-[44px] font-semibold text-brand-black tracking-[-0.03em] leading-[1.05] mb-4">
            Quotes, jobs, and payments from your van.
          </h1>
          <p className="text-sm lg:text-base font-normal text-brand-mid max-w-sm mb-8">
            Built for UK tradespeople who work alone. Send professional quotes, track jobs and get paid faster — even with no signal.
          </p>

          {/* Value bullets */}
          <ul className="space-y-4 max-w-sm">
            <li className="flex items-start gap-3">
              <WifiOff size={24} className="text-brand-black shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-brand-black">Offline-first</p>
                <p className="text-sm text-brand-mid">Basements, lofts and rural sites — no signal needed.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <MessageCircle size={24} className="text-brand-black shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-brand-black">WhatsApp quotes</p>
                <p className="text-sm text-brand-mid">Send tidy quotes before you’ve started the van.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Wallet size={24} className="text-brand-black shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-brand-black">Payment tracking</p>
                <p className="text-sm text-brand-mid">See what you’re owed and chase it without the awkwardness.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <MapPin size={24} className="text-brand-black shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-brand-black">One-tap navigation</p>
                <p className="text-sm text-brand-mid">Every job address opens Maps, ready to go.</p>
              </div>
            </li>
          </ul>
        </div>

        {/* Mobile disclaimer + illustration */}
        <div className="mt-8 max-w-sm">
          <div className="inline-flex items-start gap-2 mb-4">
            <Smartphone size={18} className="text-brand-mid mt-0.5 shrink-0" />
            <div className="text-xs text-brand-mid leading-relaxed">
              <p className="font-medium text-brand-black">Built for mobile.</p>
              <p>Install the app on your phone for the best experience. A full desktop dashboard is coming soon.</p>
            </div>
          </div>
          <img
            src="/images/auth-illustration.png"
            alt="Buildlogg app preview"
            className="w-full max-w-[320px] rounded-xl object-cover"
          />
        </div>
      </div>

      {/* Right panel — form / app experience (60%) */}
      <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-[var(--app-shell-bg)] relative">
        {children}
      </div>
    </div>
  );
}
