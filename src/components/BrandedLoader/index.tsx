interface BrandedLoaderProps {
  size?: number;
  fullscreen?: boolean;
}

/**
 * Branded loading indicator using the Buildlogg icon.
 * Shows the logo with a gentle pulse animation.
 * Used for app startup, no-network states, and screen loading.
 */
export default function BrandedLoader({ size = 48, fullscreen = true }: BrandedLoaderProps) {
  const content = (
    <div className="flex flex-col items-center gap-3">
      <img
        src="/brand/icon-transparent-v2.svg"
        alt="Buildlogg"
        style={{ width: size, height: 'auto' }}
        className="animate-[pulse_2s_ease-in-out_infinite] opacity-80"
      />
    </div>
  );

  if (!fullscreen) return content;

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[var(--app-shell-bg)]">
      {content}
    </div>
  );
}
