import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";

// Fumadocs content source adapter (manual install guide).
// `collections/server` is the generated .source folder — see tsconfig paths.
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
