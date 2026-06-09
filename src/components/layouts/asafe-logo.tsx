import Image from "next/image";

/**
 * A-SAFE brand lockup, theme-adaptive.
 * - light theme: color lockup (yellow mark + dark wordmark)
 * - dark theme:  all-yellow lockup
 * Height is controlled by the caller via `className` (e.g. "h-10").
 */
export function AsafeLogo({ className = "h-9" }: { className?: string }) {
  return (
    <>
      <Image
        src="/brand/logo.png"
        alt="A-SAFE"
        width={970}
        height={276}
        priority
        className={`w-auto dark:hidden ${className}`}
      />
      <Image
        src="/brand/logo-dark.png"
        alt="A-SAFE"
        width={980}
        height={246}
        priority
        className={`hidden w-auto dark:block ${className}`}
      />
    </>
  );
}
