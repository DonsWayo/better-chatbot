/**
 * Conek brand lockup, theme-adaptive.
 *
 * Renders the Conek mark — a solid teal circle carrying a white ring whose
 * lower arc is interrupted by an upward triangular peak rising into the
 * ring's center hole, with two legs extending down/outward (an abstract
 * person/peak) — next to a hand-typeset "Conek AI" wordmark. The wordmark
 * uses the foreground color so it adapts to the light/dark theme.
 *
 * Height is controlled by the caller via `className` (e.g. "h-6"); the mark
 * scales to match.
 */

const CONEK_TEAL = "#3ABFC6";

/**
 * Mark-only variant: the white glyph drawn in `currentColor`, no background
 * circle. For surfaces where the old transparent-background mark was used.
 */
export function ConekMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      fill="currentColor"
    >
      <mask id="conek-peak-gap">
        <rect width="100" height="100" fill="white" />
        {/* enlarged peak cuts a gap through the ring's lower arc */}
        <polygon points="46,32 54,32 70,70 30,70" fill="black" />
      </mask>
      <path
        fillRule="evenodd"
        mask="url(#conek-peak-gap)"
        d="M50 21a24 24 0 1 1 0 48 24 24 0 0 1 0-48Zm0 11a13 13 0 1 0 0 26 13 13 0 0 0 0-26Z"
      />
      {/* the peak itself, inset from the gap so the cut stays visible */}
      <polygon points="50,33 65,66 35,66" />
      {/* legs from the ring's bottom-left / bottom-right, down and outward */}
      <path
        d="M31 61 22 84M69 61l9 23"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function ConekLogo({ className = "h-7" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto"
        role="img"
        aria-label="Conek"
      >
        <circle cx="50" cy="50" r="50" fill={CONEK_TEAL} />
        <g fill="#fff">
          <mask id="conek-peak-gap-full">
            <rect width="100" height="100" fill="white" />
            <polygon points="46,32 54,32 70,70 30,70" fill="black" />
          </mask>
          <path
            fillRule="evenodd"
            mask="url(#conek-peak-gap-full)"
            d="M50 21a24 24 0 1 1 0 48 24 24 0 0 1 0-48Zm0 11a13 13 0 1 0 0 26 13 13 0 0 0 0-26Z"
          />
          <polygon points="50,33 65,66 35,66" />
          <path
            d="M31 61 22 84M69 61l9 23"
            stroke="#fff"
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </svg>
      <span className="text-xl font-extrabold tracking-tight text-foreground leading-none">
        Conek AI
      </span>
    </span>
  );
}
