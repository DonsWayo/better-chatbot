import { defineConfig, defineDocs } from "fumadocs-mdx/config";

// Fumadocs MDX collection — the platform documentation under /docs.
// Pages live in content/docs/**; sidebar grouping via meta.json files.
export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig();
