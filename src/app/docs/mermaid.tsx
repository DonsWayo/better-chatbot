"use client";

import { useTheme } from "next-themes";
import { useEffect, useId, useState } from "react";

/**
 * Mermaid diagram renderer for the docs MDX pages (fumadocs mermaid recipe).
 * Reuses the `mermaid` package already shipped for chat markdown rendering.
 */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId();
  const [svg, setSvg] = useState("");
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        fontFamily: "inherit",
        theme: resolvedTheme === "dark" ? "dark" : "default",
      });
      try {
        const { svg: rendered } = await mermaid.render(
          id.replace(/[^a-zA-Z0-9]/g, ""),
          chart.replaceAll("\\n", "\n"),
        );
        if (!cancelled) setSvg(rendered);
      } catch {
        // Leave the container empty rather than crashing the page on a
        // malformed diagram.
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  return (
    <div
      className="my-4 flex justify-center overflow-x-auto"
      // mermaid output is sanitized (securityLevel: "strict")
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
