# docs/ — source documents

> **Looking for the readable documentation?** The platform docs are served **in-app at
> [`/docs`](http://localhost:3000/docs)** (Fumadocs; authored under `content/docs/`,
> route in `src/app/docs/`). The pages there are synthesized from the documents below and
> verified against the code — start there.

This directory holds the *source* planning and design documents:

| Path | What it is |
|---|---|
| `CLAUDE.md` | Operating manual for AI-assisted work on this repo — fork rules, seams, the Server Actions vs routes rule. |
| `00-overview-and-roadmap.md` | Original vision, goals, and wave roadmap. |
| `next-gen-platform-blueprint.md` | The post-GA platform blueprint (Runs, routines, governance floors, Electric, desktop bridge). |
| `design/` | Design docs: `agent-platform.md`, `visibility-model.md`, `ui-language.md` (Calm Industrial). |
| `adr/` | Architecture Decision Records (0000–0012) — see `adr/README.md`. |
| `wave-01…12*.md` | The twelve delivery-wave specs; `w12-ga-signoff.md` is the GA sign-off record. |
| `runbooks/`, `grafana/`, `storage/`, `tips-guides/` | Operational material. |

When the in-app docs and these sources disagree, the **code wins**, then the in-app docs
(they are kept verified), then these planning documents.
