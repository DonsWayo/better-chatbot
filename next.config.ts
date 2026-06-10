import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const BUILD_OUTPUT = process.env.NEXT_STANDALONE_OUTPUT
  ? "standalone"
  : undefined;

export default () => {
  const nextConfig: NextConfig = {
    output: BUILD_OUTPUT,
    cleanDistDir: true,
    devIndicators: {
      position: "bottom-right",
    },
    env: {
      NO_HTTPS: process.env.NO_HTTPS,
    },
    experimental: {
      taint: true,
      authInterrupts: true,
    },
  };
  const withNextIntl = createNextIntlPlugin();
  // Fumadocs MDX (docs at /docs) — compiles content/docs/** into the
  // generated .source folder. Minimal wrapper per the manual install guide.
  const withMDX = createMDX();
  return withMDX(withNextIntl(nextConfig));
};
