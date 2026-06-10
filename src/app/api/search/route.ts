import { source } from "@/app/docs/source";
import { createFromSource } from "fumadocs-core/search/server";

// Docs search index for the /docs surface (fumadocs default Orama search).
export const { GET } = createFromSource(source, {
  language: "english",
});
