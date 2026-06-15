import { Hammer, WifiOff, MessageCircle, Wallet, MapPin } from 'lucide-react';

interface AuthDesktopLayoutProps {
  children: React.ReactNode;
  variant?: 'auth' | 'onboarding';
}

export default function AuthDesktopLayout({ children, variant = 'auth' }: AuthDesktopLayoutProps) {
  const isAuth = variant === 'auth';

  return (
    <div className="grid h-full min-h-full lg:grid-cols-2">
      {/* Left panel — brand context, desktop only */}
      <div className="relative hidden lg:flex flex-col justify-between auth-left-panel p-6 md:p-10 overflow-y-auto">
        <div>
          {/* Wordmark */}
          <div className="inline-flex items-center gap-2.5 mb-10">
            <span className="w-9 h-9 rounded-lg bg-[#111827] text-white dark:bg-[#ffffff] dark:text-[#111827] grid place-items-center">
              <Hammer size={20} strokeWidth={2.2} />
            </span>
            <span className="text-[22px] font-extrabold tracking-[-0.03em] text-brand-black">
              Buildlogg
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl lg:text-4xl xl:text-5xl font-semibold text-brand-black tracking-[-0.03em] leading-[1.08] mb-6">
            Quotes, jobs, and payments from your van.
          </h1>
          <p className="text-base lg:text-lg font-normal text-brand-dark max-w-md mb-10">
            Built for UK tradespeople who work alone. Send professional quotes, track jobs and get paid faster — even with no signal.
          </p>

          {/* Value bullets */}
          <ul className="space-y-4 max-w-md">
            <li className="flex items-start gap-3">
              <span className="w-8 h-8 flex items-center justify-center shrink-0">
                <WifiOff size={24} className="text-brand-black" />
              </span>
              <div>
                <p className="text-sm font-semibold text-brand-black">Offline-first</p>
                <p className="text-sm text-brand-mid">Basements, lofts and rural sites — no signal needed.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-8 h-8 flex items-center justify-center shrink-0">
                <MessageCircle size={24} className="text-brand-black" />
              </span>
              <div>
                <p className="text-sm font-semibold text-brand-black">WhatsApp quotes</p>
                <p className="text-sm text-brand-mid">Send tidy quotes before you’ve started the van.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-8 h-8 flex items-center justify-center shrink-0">
                <Wallet size={24} className="text-brand-black" />
              </span>
              <div>
                <p className="text-sm font-semibold text-brand-black">Payment tracking</p>
                <p className="text-sm text-brand-mid">See what you’re owed and chase it without the awkwardness.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-8 h-8 flex items-center justify-center shrink-0">
                <MapPin size={24} className="text-brand-black" />
              </span>
              <div>
                <p className="text-sm font-semibold text-brand-black">One-tap navigation</p>
                <p className="text-sm text-brand-mid">Every job address opens Maps, ready to go.</p>
              </div>
            </li>
          </ul>
        </div>

        {/* Mobile disclaimer + illustration */}
        <div className="mt-8">
          <div className="p-4 mb-6">
            <p className="text-sm text-brand-dark leading-relaxed">
              <span className="font-semibold text-brand-black">Built for mobile.</span>{' '}
              Install the app on your phone for the best experience. A full desktop dashboard is coming soon.
            </p>
          </div>
          <img
            src="/images/auth-illustration.png"
            alt="Buildlogg app preview"
            className="w-full max-w-[420px] rounded-xl object-cover"
          />
        </div>
      </div>

      {/* Right panel — form / app experience */}
      <div className="flex flex-col h-full min-h-0 overflow-y-auto">
        <div
          className={`flex-1 min-h-0 p-6 md:p-8 lg:p-10 ${
            isAuth ? 'flex items-center justify-center' : 'flex flex-col'
          }`}
        >
          {isAuth ? (
            <div className="w-full max-w-sm">{children}</div>
          ) : (
            <div className="w-full flex-1 min-h-0 lg:max-w-xl lg:mx-auto">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}
