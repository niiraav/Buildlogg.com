import { motion } from 'framer-motion';

function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-brand-borderLight rounded-lg animate-pulse ${className}`} />
  );
}

/** Skeleton that mimics a JobCard on the Home screen */
export function SkeletonJobCard() {
  return (
    <div className="bg-white border border-brand-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="w-2 h-2 rounded-full" />
          <SkeletonBlock className="w-20 h-3" />
        </div>
        <SkeletonBlock className="w-12 h-3" />
      </div>
      <SkeletonBlock className="w-3/4 h-5" />
      <SkeletonBlock className="w-1/2 h-4" />
      <div className="flex items-center justify-between pt-1">
        <SkeletonBlock className="w-16 h-5" />
        <SkeletonBlock className="w-20 h-4" />
      </div>
    </div>
  );
}

/** Skeleton that mimics a TaskCard on the Home screen */
export function SkeletonTaskCard() {
  return (
    <div className="bg-white border-2 border-brand-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <SkeletonBlock className="w-4 h-4 rounded-full" />
        <SkeletonBlock className="w-32 h-5" />
      </div>
      <SkeletonBlock className="w-2/3 h-4" />
      <div className="flex gap-2 pt-1">
        <SkeletonBlock className="flex-1 h-12 rounded-xl" />
        <SkeletonBlock className="flex-1 h-12 rounded-xl" />
      </div>
    </div>
  );
}

/** Skeleton that mimics a Jobs list row */
export function SkeletonJobListRow() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-brand-borderLight">
      <SkeletonBlock className="w-2 h-2 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonBlock className="w-3/4 h-4" />
        <SkeletonBlock className="w-1/2 h-3" />
      </div>
      <SkeletonBlock className="w-12 h-4 shrink-0" />
    </div>
  );
}

/** Fade-in wrapper for real content replacing skeletons */
export function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Generic app skeleton — used for AuthGuard checking state (unknown destination) */
export function SkeletonAppScreen() {
  return (
    <div className="bg-[var(--app-shell-bg)] min-h-[100dvh]">
      <div className="px-4 pt-5 pb-3 border-b border-brand-borderLight">
        <SkeletonBlock className="w-32 h-6" />
      </div>
      <div className="px-4 pt-4 space-y-3">
        <SkeletonBlock className="w-full h-20 rounded-xl" />
        <SkeletonBlock className="w-full h-20 rounded-xl" />
        <SkeletonBlock className="w-full h-20 rounded-xl" />
      </div>
    </div>
  );
}

/** Skeleton for Home screen */
export function SkeletonHomeScreen() {
  return (
    <div className="bg-[var(--app-shell-bg)] min-h-[100dvh]">
      <div className="px-4 pt-5 pb-2">
        <SkeletonBlock className="w-40 h-6" />
        <SkeletonBlock className="w-24 h-4 mt-2" />
      </div>
      <div className="px-4 pt-4 space-y-3">
        <SkeletonTaskCard />
        <SkeletonTaskCard />
      </div>
      <div className="px-4 pt-4">
        <SkeletonBlock className="w-full h-16 rounded-xl" />
      </div>
    </div>
  );
}

/** Skeleton for Settings screen */
export function SkeletonSettingsScreen() {
  return (
    <div className="bg-[var(--app-shell-bg)] min-h-[100dvh]">
      <div className="px-4 pt-5 pb-3 border-b border-brand-borderLight">
        <SkeletonBlock className="w-28 h-6" />
      </div>
      <div className="px-4 pt-4 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white border border-brand-border rounded-xl p-4 space-y-2">
            <SkeletonBlock className="w-3/4 h-4" />
            <SkeletonBlock className="w-1/2 h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for Booking settings screen */
export function SkeletonBookingScreen() {
  return (
    <div className="bg-[var(--app-shell-bg)] min-h-[100dvh]">
      <div className="px-4 pt-2 pb-2 border-b border-brand-borderLight flex items-center gap-3">
        <SkeletonBlock className="w-5 h-5 rounded" />
        <SkeletonBlock className="w-32 h-5" />
      </div>
      <div className="px-4 pt-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i}>
            <SkeletonBlock className="w-20 h-3 mb-2" />
            <div className="bg-white border border-brand-border rounded-xl p-4 space-y-2">
              <SkeletonBlock className="w-3/4 h-4" />
              <SkeletonBlock className="w-1/2 h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for Customers list */
export function SkeletonCustomerList() {
  return (
    <div className="bg-[var(--app-shell-bg)] min-h-[100dvh]">
      <div className="px-4 pt-4 pb-3 border-b border-brand-borderLight">
        <SkeletonBlock className="w-24 h-6" />
      </div>
      <div className="px-4 pt-4 space-y-2.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white border border-brand-border rounded-lg p-4 flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="w-2/3 h-4" />
              <SkeletonBlock className="w-1/3 h-3" />
            </div>
            <SkeletonBlock className="w-4 h-4 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic inline skeleton — 3 centered blocks for brief loading states */
export function SkeletonInline() {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <SkeletonBlock className="w-3/4 h-5 rounded-lg" />
      <SkeletonBlock className="w-1/2 h-4 rounded-lg" />
      <SkeletonBlock className="w-2/3 h-4 rounded-lg" />
    </div>
  );
}
