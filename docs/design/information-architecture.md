# asafe-ai Information Architecture

**Governing rule: sidebar slots are for objects users return to — never configuration.** Anything configurable lives at a URL (`/settings/*` or `/admin/*`). Calm by default; power revealed by role.

## 1. Sidebar (final contents, top to bottom, with role gates)

1. **A-SAFE logo** → `/` (everyone)
2. **New Chat** (Cmd+Shift+O chip) — everyone
3. **Search** — opens Cmd-K palette (new item in `app-sidebar-menus.tsx`) — everyone
4. **Inbox** → `/inbox` (renamed `/triage`, redirect kept) with pending-approvals badge — everyone, **always rendered**. Fixes the unreachable-triage trap: today the only entry is the runs-rail icon (`app-sidebar-runs.tsx:142`), hidden for users with zero runs.
5. **Agents** — **pinned agents only** (pin-to-earn-a-slot replaces "first 5 + show more"); click still injects an @mention. Everyone. Discovery for basic users happens via Cmd-K and mentions, not an auto-list.
6. **Studio** → `/studio` — the single role-gated builder home (gated `canCreateAgent(role)` or workflow-edit permission). **Basic users never see it** — no empty chrome.
7. **Runs rail (ephemeral)** — rendered **only while runs are active**; polling runs only during active runs (the idle 5s/30s loop is deleted). Completed runs live in Inbox › Runs. A subtle pulsing is-running dot on **Inbox** signals background activity when the rail is collapsed. Triage icon dropped from this header.
8. **Folders** (teamspaces) — everyone, unchanged
9. **Recents** — everyone; hover-⋯ loses "Delete all chats", **gains "View archive"** — giving non-admin archive owners a nav path to `/archive/[id]`
10. **Footer avatar** → **slim dropdown: Settings (`/settings`), theme toggle, Sign out** — plus **Admin console** (`/admin`) for `getIsUserAdmin` only. Everything else lives at a URL.

Deleted from sidebar: Admin 8-item sub-tree, Archive group, Workflow item, unpinned-agents auto-list.

## 2. Settings surface

`/settings` becomes a **single full-page hub with its own left nav**, every tab deep-linkable (`/settings/<tab>`), reached via footer → Settings and Cmd+,. It absorbs **all three competing surfaces**: the orphan `/settings` page, the ChatPreferences popup, and the UserSettings drawer.

- **General** — theme (light/dark + `BASE_THEMES`), language, keyboard-shortcuts reference (absorbs footer submenus; footer keeps quick theme toggle)
- **Personalization** — display name, bot name, profession, response styles (from `chat-preferences-content.tsx` pane 1)
- **Connectors** — personal MCP home. `/mcp`, `/mcp/create`, `/mcp/modify/[id]`, `/mcp/test/[id]` move to `/settings/connectors/*` **with redirects from `/mcp*` kept** (preserves inbound links from `tool-select-dropdown.tsx` and `mcp-editor.tsx`). **Per-server instructions** (from Chat Preferences) and the globally mounted **`McpCustomizationPopup`** both migrate onto each connector's row. Shows **only the org/team-enabled subset**; "Add custom" gated by admin policy.
- **Account** — profile/avatar, password or "OAuth only", sessions (from `user-settings-popup.tsx` `view="user"`)
- **Usage** — one card set; merge `MyUsageSection` + `UserStatsCardLoader` (kills duplication)
- **Data controls** — GDPR export, My Exports, **Archives** (list + create; `/archive/[id]` keeps working), bulk "delete all chats" with confirm
- **Settings footer** — "Report an issue" link relocates here (every old footer item accounted for).

## 3. Admin console

Keep all `/admin/*` URLs — zero churn. New dedicated **`admin-sidebar.tsx`** rendered by `(admin)/layout.tsx` (hard mode-swap; no admin items in the daily sidebar). Nav: Dashboard (`/admin`), **Users (`/admin/users` — fixes the lying label)**, Teams, Usage, MCP Catalog, Knowledge, Quality, Guardrails, Feature Flags, **Audit (`/admin/audit`, de-orphaned)**. Add BackButton coverage for `/admin/teams/[id]` and `/admin/knowledge/[id]`. Later: MCP Catalog adopts forward posture — per-server action control (allow-all/read-only/custom) + default policy for newly added tools.

**Three-tier connector flow:** admin installs in MCP Catalog → team scopes via `/admin/teams/[id]` entitlements (exists) → user sees only the enabled subset in Settings → Connectors.

## 4. Builder surfaces

- **/studio** — tabs: **Agents** (current `/agents` gallery) and **Workflows** (current `/workflow` list). `/agents` and `/workflow` redirect into the matching tab. Editors stay at `/agent/[id]`, `/workflow/[id]` with BackButtons to Studio.
- **NL generation** — primary empty-state CTA in Studio › Workflows and `/agent/new` ("describe it" first), plus Cmd-K action. No new nav slots.
- **Configure at point of use** (Raycast): agent mention-chip ⋯ → "Edit in Studio" (builders only); MCP tool row in `tool-select-dropdown.tsx` → `/settings/connectors/[id]`.
- Basic users meet agents/workflows via @mention, composer Tools, pins, and Cmd-K.

## 5. Triage/Runs/Inbox placement

One **Inbox** (`/inbox`), always in the sidebar with badge. Tabs: **Approvals** (pending; badge source), **Runs** (history with cost/cancel — replaces needing the rail for old runs), **Routines** (scheduled workflows, from current triage). `/triage` → `/inbox` as a **redirect**, protecting deep links. `/runs/[id]` gains a back-link to Inbox. Live runs keep the slim ephemeral rail only while running; idle polling dies.

## 6. Command palette & search (Cmd-K)

New `command-palette.tsx` mounted in `app-popup-provider.tsx`:

- **Search**: threads, folders, agents, workflows, archives, docs
- **Go-to**: Inbox, Studio, Settings tabs (deep-linked), admin pages — **role-filtered**
- **Actions via `>` prefix** (role-gate aware): New chat, Temporary chat, Voice, Toggle theme, Pin agent, Schedule routine, Create agent from description
- **Fallback**: no match → **"Ask A-SAFE AI: '<query>'"** starts a chat with the query — failed search becomes a conversation, forgiving for non-technical staff
- Registered in shortcuts store + `KeyboardShortcutsPopup`; Cmd+, settings; G-chords (G I, G S) later.

## 7. Migration map

| Current | New home | Files | Priority |
|---|---|---|---|
| Sidebar Admin sub-tree | Admin console left nav | delete `app-sidebar-menu-admin.tsx`; new `admin-sidebar.tsx` in `(admin)/layout.tsx` | P0 |
| Admin "Users"→`/admin` lie | Users→`/admin/users`; Dashboard stays `/admin` | `admin-sidebar.tsx` | P0 |
| `/admin/audit` orphan | Admin nav item | `admin-sidebar.tsx` | P0 |
| `/triage` + Runs-header icon | `/inbox` sidebar item + redirect | rename route; `app-sidebar-runs.tsx`, `app-sidebar-menus.tsx` | P0 |
| Runs rail (5s/30s polling) | Active-only rail; history in Inbox; is-running dot | `app-sidebar-runs.tsx` | P0 |
| Composer "Upload image" | "Add files" | `prompt-input.tsx` | P0 |
| Redirects `/login`, `/auth/signin` | `/sign-in` everywhere | `aup/page.tsx`, `mcp` pages, admin home | P0 |
| `/settings` orphan | Hub layout; usage→Usage tab, GDPR→Data controls | `settings/page.tsx` → layout + tabs | P0 |
| Cmd-K palette (new) | Search/actions/fallback | new `command-palette.tsx`, `app-popup-provider.tsx` | P0 |
| Missing admin BackButtons | header coverage `/admin/teams/[id]`, `/admin/knowledge/[id]` | `app-header.tsx` | P0 |
| Chat Preferences popup | Settings › Personalization | retire popup; split `chat-preferences-content.tsx` | P1 |
| Per-MCP instructions (in prefs) | Settings › Connectors rows | same + retire `mcp-customization-popup` | P1 |
| `McpCustomizationPopup` (global) | Settings › Connectors | `app-popup-provider.tsx` | P1 |
| `/mcp*` suite | `/settings/connectors/*` + redirects | move `(chat)/mcp/*`; update `tool-select-dropdown.tsx`, `mcp-editor.tsx` | P1 |
| User Settings drawer | Settings › Account | retire `user-settings-popup.tsx`; reuse `UserDetailContent` | P1 |
| Theme/Language/Shortcuts submenus | Settings › General | `app-sidebar-user.tsx` | P1 |
| "Report an issue" | Settings footer link | `app-sidebar-user.tsx`, settings layout | P1 |
| Duplicate usage cards | merged Usage tab | `MyUsageSection`/`UserStatsCardLoader` | P1 |
| My Exports (in prefs) | Settings › Data controls | same split | P1 |
| Hover-⋯ "Delete all chats" | Settings › Data controls, with confirm | `app-sidebar-threads.tsx` | P1 |
| Sidebar Archive group (admin-only) | Settings › Data controls + Recents ⋯ "View archive" | `app-sidebar-menus.tsx`, `app-sidebar-threads.tsx` | P1 |
| Agents first-5 auto-list | Pinned-only | `app-sidebar-agents.tsx` (+ pin field/API) | P1 |
| Workflow sidebar item | Studio tab | `app-sidebar-menus.tsx`, new `/studio` | P1 |
| `/agents` gallery, `/workflow` list | Studio tabs (redirects) | new `studio/*`; BackButtons on editors | P1 |
| User footer dropdown (8 items) | Slim: Settings/theme/Sign out (+Admin, gated) | `app-sidebar-user.tsx` | P1 |
| Missing user-side back-paths | `/runs/[id]`→Inbox, `/agent/[id]`/`/workflow/[id]`→Studio, `/archive/[id]`→Data controls | `app-header.tsx`, page headers | P2 |
| Folder rename `window.prompt` | proper dialog | `sidebar-folders.tsx` | P2 |
| Duplicate `<SidebarFolders />` | single render | `app-sidebar-threads.tsx` (177/209) | P2 |
| NL generation entries | Studio empty-state CTA + Cmd-K action | studio pages, palette | P2 |
| MCP Catalog forward posture | per-server action control + default policy | `/admin/mcp` | P2 |
| Shortcuts popup | keep; register in Cmd-K + Settings › General | shortcuts store | P2 |

## 8. What we deliberately delete

- All three settings surfaces (ChatPreferences popup, UserSettings drawer, orphan page) and their store flags — URLs win
- Admin sub-tree, Archive group, Workflow item, unpinned-agents auto-list from the user sidebar
- Standalone `/mcp` IA (routes redirect; one MCP home for users, one for admins)
- Idle runs-rail polling; runs-rail-as-only-door-to-triage
- Hover-⋯ "Delete all chats"; `window.prompt` rename
- Duplicate usage card; duplicate folders render
- Inconsistent auth redirects; the lie that "Users" is the admin dashboard

## Implementation order

1. **PR1 — Inbox + runs rail** (P0): rename `/triage`→`/inbox` with redirect; always-rendered sidebar item with approvals badge; active-only ephemeral rail; kill idle polling; back-link on `/runs/[id]`.
2. **PR2 — Trust fixes batch** (P0): "Add files" label; standardize `/sign-in` redirects; Recents ⋯ "View archive"; dedupe `<SidebarFolders />`.
3. **PR3 — Admin console nav** (P0): new `admin-sidebar.tsx` in `(admin)/layout.tsx`; Users→`/admin/users`; Audit item; admin BackButtons; remove admin tree from user sidebar; footer gains gated "Admin console".
4. **PR4 — Settings hub skeleton** (P0): `/settings` layout + General/Account/Usage/Data-controls tabs; retire UserSettings drawer and footer submenus; slim footer dropdown; Archives + delete-all into Data controls.
5. **PR5 — Connectors + palette** (P1): `/mcp*`→`/settings/connectors/*` with redirects; per-server instructions + `McpCustomizationPopup` onto connector rows; Personalization tab retires ChatPreferences popup; ship `command-palette.tsx` with `>` actions and "Ask A-SAFE AI" fallback.
