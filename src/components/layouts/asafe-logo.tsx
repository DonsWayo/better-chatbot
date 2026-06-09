import Image from "next/image";

/**
 * A-SAFE brand lockup, theme-adaptive.
 *
 * Renders the crisp yellow "A" mark (SVG) next to a hand-typeset "A-SAFE"
 * wordmark. The wordmark uses the foreground color so it adapts to the
 * light/dark theme automatically. The tagline-bearing PNG is intentionally
 * not used here — it is illegible at sidebar size.
 *
 * Height is controlled by the caller via `className` (e.g. "h-6"); the mark
 * scales to match.
 */
export function AsafeLogo({ className = "h-7" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <Image
        src="/brand/mark.svg"
        alt="A-SAFE"
        width={1080}
        height={1080}
        priority
        className="h-full w-auto"
      />
      <span className="text-xl font-extrabold tracking-tight text-foreground leading-none">
        A-SAFE
      </span>
    </span>
  );
}
