# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 1.0.0 (2026-06-25)


### Features

* add HTTP/HTTPS proxy support ([#365](https://github.com/DonsWayo/better-chatbot/issues/365)) ([dde98ed](https://github.com/DonsWayo/better-chatbot/commit/dde98ed593b74e4cad2cb91ae10b32bd452afe78))
* admin dashboard home, budget-reset cron, KPI stats ([0d2356f](https://github.com/DonsWayo/better-chatbot/commit/0d2356f228f53e3963cc3c6cc75338da816c32ba))
* admin usage CSV export + rate-limit reset API ([29a361c](https://github.com/DonsWayo/better-chatbot/commit/29a361ce07377a567628997c439f5bc2e79fe0aa))
* admin usage CSV export button + user rate-limit reset UI ([7d064ea](https://github.com/DonsWayo/better-chatbot/commit/7d064eafa1203c26ef7404eea0f89783f2223c6a))
* **admin/mcp:** multi-team scoping, live connection test, OAuth/SSO, friendlier UI ([0e5238f](https://github.com/DonsWayo/better-chatbot/commit/0e5238f39a695a11156a0c6df21340ba60083747))
* **admin+memory:** per-team policy overrides UI + 'Memory updated' chat pill ([b8a604e](https://github.com/DonsWayo/better-chatbot/commit/b8a604ed121c00ad0043357319bccede13822599))
* **admin:** ERP-style layered model entitlements (org base + team overrides) ([5723cbf](https://github.com/DonsWayo/better-chatbot/commit/5723cbf09ade28899a161db1f46369cdf83843d7))
* **admin:** GDPR data export/erasure UI + model-grant revoke tests ([4849588](https://github.com/DonsWayo/better-chatbot/commit/48495887326022cd107458152eb859205791540e))
* **admin:** installable role packs — Sales + Manufacturing Ops starter content ([334e766](https://github.com/DonsWayo/better-chatbot/commit/334e7668881c1d8f14c284e976e170df076127c3))
* **admin:** team detail page + member add/remove (Wave 3) ([be4ccc8](https://github.com/DonsWayo/better-chatbot/commit/be4ccc8035ecc9973b2647f82f3435d37af65b9c))
* **admin:** Wave 3 teams management page + server actions ([12afdbd](https://github.com/DonsWayo/better-chatbot/commit/12afdbdcddb8c8fd4994a47330e5401d0fd21a8f))
* **admin:** Wave 3 usage cost dashboard ([a8cd086](https://github.com/DonsWayo/better-chatbot/commit/a8cd0865d7fe4eaf83e5c9d3faca422f68810e46))
* **admin:** Wave 5 company MCP catalog + admin-only org-scope restriction ([9b5cc82](https://github.com/DonsWayo/better-chatbot/commit/9b5cc82f7a9bb1b623e565eb27de1d9b4cfea4ac))
* **agent-platform:** approvals + autonomy, routines worker, compliance API (B90 [#22](https://github.com/DonsWayo/better-chatbot/issues/22)/[#23](https://github.com/DonsWayo/better-chatbot/issues/23)/[#24](https://github.com/DonsWayo/better-chatbot/issues/24)) ([d7434b0](https://github.com/DonsWayo/better-chatbot/commit/d7434b03df916b7a103844618a2f3cce90b94445))
* **agent-platform:** immutable revisions + publish lifecycle ([#19](https://github.com/DonsWayo/better-chatbot/issues/19) backend) ([c71d412](https://github.com/DonsWayo/better-chatbot/commit/c71d412f28a5c401e7737c91699426e9e570be37))
* **agent-platform:** session/step spine — every run is a governed, checkpointed session ([cfd246a](https://github.com/DonsWayo/better-chatbot/commit/cfd246a05d6e801306addc39e8b0fb9bbfb8c8dc))
* **ai:** route inference through OpenRouter only (ADR-0001) ([4ddbaff](https://github.com/DonsWayo/better-chatbot/commit/4ddbaffa1ba6e39f1fae7cd6be69aaedd4d75925))
* **asafe:** full A-SAFE rebrand + auth + Brave search ([125f39a](https://github.com/DonsWayo/better-chatbot/commit/125f39a541de6bbe8eb9e0cf8f79755cf36615f3))
* **auth:** replace login left-panel animation with background video + vignette ([37801dd](https://github.com/DonsWayo/better-chatbot/commit/37801ddff413428dc27023fc807e5b648056d3fa))
* **auth:** Wave 4 Entra group claim → role mapping (ADR-0005) ([cd66908](https://github.com/DonsWayo/better-chatbot/commit/cd669089d9de01a84266f3f139d40acf1b569109))
* **brand+polish:** Conek teal raster assets + citation click-through + direct studio link ([a5550ae](https://github.com/DonsWayo/better-chatbot/commit/a5550aeb51b3e16661d5fa35ccc9e9e65ec37a9f))
* **brand:** apply A-SAFE palette to default theme (primary safety yellow #FFC72C on black) ([66e8938](https://github.com/DonsWayo/better-chatbot/commit/66e893842c5779a45d00e71e79e05e2da46ac61c))
* **brand:** Conek AI — product rename + teal palette ([44b0c73](https://github.com/DonsWayo/better-chatbot/commit/44b0c738188b4c5f21c5190b799e3e2acff2f659))
* **brand:** rebrand to Asafe AI (Wave 1) ([c97740c](https://github.com/DonsWayo/better-chatbot/commit/c97740c72f1f53c7c8b3452417ae74cfcb3d8155))
* **budget:** Wave 3 budget enforcement + usage event recording (ADR-0003) ([c9022d0](https://github.com/DonsWayo/better-chatbot/commit/c9022d090ed01bdeb41e058ca5b2e6791d37c70b))
* cache MCP tool info in DB for lazy connection architecture ([#369](https://github.com/DonsWayo/better-chatbot/issues/369)) ([57c638e](https://github.com/DonsWayo/better-chatbot/commit/57c638e8eb72330dee8a2645886249730f969bcb))
* close API gaps + W3 budget alerts + W5 team MCP scope ([daa67c9](https://github.com/DonsWayo/better-chatbot/commit/daa67c931c0d455e1a2f7dff9e478a1a38d2dcfc))
* **compression:** Wave 11 context compression seam + stub (ADR-0011 deferred) ([af75f12](https://github.com/DonsWayo/better-chatbot/commit/af75f12b2c0838e395b83bd9d32f9b2c875e7778))
* **db:** approval_request + workflow_schedule tables; audit actor attribution ([a214205](https://github.com/DonsWayo/better-chatbot/commit/a21420519f7ec8255b38f7333338bf136fc2a549))
* **db:** migration 0039 — mcp_server.disabled_tools for per-tool entitlements ([9e1e1e8](https://github.com/DonsWayo/better-chatbot/commit/9e1e1e860d48cbf9909f67f74f7cda7b321da903))
* **db:** migration 0040 — asafe_presence.typing for typing indicators ([5063e9b](https://github.com/DonsWayo/better-chatbot/commit/5063e9b43103d714db6078482d5436600eff69ef))
* **db:** migrations 0037 (knowledge hybrid FTS + collection team_ids) + 0038 (realtime presence) ([9cd5bad](https://github.com/DonsWayo/better-chatbot/commit/9cd5bad97f6b13de45a41042382ed906ad1b16ae))
* **deploy:** agent worker bundled into the production image ([1e2be53](https://github.com/DonsWayo/better-chatbot/commit/1e2be537cc36d6cdb3d499f73f4b55d07a524a93))
* **deploy:** EKS Helm chart + manifests, standalone migration Job (ADR-0006) ([8697e2a](https://github.com/DonsWayo/better-chatbot/commit/8697e2a9cff9da42b84b802e5dcedf0fe595b885))
* **design:** Calm Industrial design language + typography upgrade ([120174f](https://github.com/DonsWayo/better-chatbot/commit/120174f3c40706091c929f2a6a4601902db41690))
* **desktop:** add placeholder app icons (A-SAFE brand yellow) ([43ec855](https://github.com/DonsWayo/better-chatbot/commit/43ec8551a0ede9b9a4f8347ad17b124cebf7a0a3))
* **desktop:** app icon, About panel, dark high-contrast splash ([e0a7a3e](https://github.com/DonsWayo/better-chatbot/commit/e0a7a3e8ac69ed81d5ae8f02e654ef6d3cb32ed3))
* **desktop:** bring scaffold to branch + CDP hook for Electron MCP testing ([95a1e3d](https://github.com/DonsWayo/better-chatbot/commit/95a1e3d8506ce39ea7627c098b1e4c3c5c9c6efb))
* **desktop:** frameless window chrome like Claude Desktop / Codex ([cc1c86e](https://github.com/DonsWayo/better-chatbot/commit/cc1c86e1cb76415e5d34c530bf57e8397396ca06))
* **desktop:** governed opencode lifecycle manager ([#25](https://github.com/DonsWayo/better-chatbot/issues/25)) ([3325aa0](https://github.com/DonsWayo/better-chatbot/commit/3325aa0ee923196a010fd98555a0a705d4964f96))
* **desktop:** scaffold Electron desktop app (thin client + local-MCP roadmap) ([91bfb5e](https://github.com/DonsWayo/better-chatbot/commit/91bfb5ed0be1c804e2afbfb8e5444b9639e38613))
* **dev:** AI-native Postgres in docker-compose (pgvector + pgvectorscale + timescaledb) ([4a4f1b0](https://github.com/DonsWayo/better-chatbot/commit/4a4f1b04844c0813d24de21bc85d616b6d866d74))
* **documents:** Confluence/Notion-style collaborative TipTap document editor ([02a86a4](https://github.com/DonsWayo/better-chatbot/commit/02a86a420f42e3b4fe491917e1bbe516b652b959))
* Entra role re-sync, RFC rate-limit headers, knowledge docs API + MCP UI tests ([05aa33d](https://github.com/DonsWayo/better-chatbot/commit/05aa33d1d3171c794b102c65a7fa881f16e326ef))
* **feedback:** Wave 9 thumbs up/down per message (ADR-0009 quality loop) ([83ed4ff](https://github.com/DonsWayo/better-chatbot/commit/83ed4ff69b0cd6fd168bad30a3a905fc95972d10))
* follow-ups, deep research mode, WebSearch node, document AI + 50-file test blitz ([#3](https://github.com/DonsWayo/better-chatbot/issues/3)) ([4ae88bf](https://github.com/DonsWayo/better-chatbot/commit/4ae88bf571d01b107b2ae649c47de0f0bd614f31))
* **gateway:** governed OpenRouter proxy for desktop coding ([#25](https://github.com/DonsWayo/better-chatbot/issues/25) contract) ([30dc607](https://github.com/DonsWayo/better-chatbot/commit/30dc607b9e722b5d0e29c1eebc135cd3a988c2ec))
* **gdpr+changelog:** Wave 8 data export + CHANGELOG all waves ([6e9a789](https://github.com/DonsWayo/better-chatbot/commit/6e9a789e3d9a6426bb0eb344c61e019484c412f8))
* **governance:** storage owner-binding, structured action results, AUP hard gate, per-tool team policy ([121665f](https://github.com/DonsWayo/better-chatbot/commit/121665f0511024a5b6799dac793d08be7a16389a))
* **guardrails:** Wave 7 GA gate — full coverage of every LLM seam ([7525853](https://github.com/DonsWayo/better-chatbot/commit/7525853ee6d4d988a3739b44450feaa51dd06e45))
* **i18n:** add translations for tool-related components ([#367](https://github.com/DonsWayo/better-chatbot/issues/367)) ([536beb2](https://github.com/DonsWayo/better-chatbot/commit/536beb204cc354a83423b1f8fc38cc6b0c444e85))
* **i18n:** complete Spanish translations — add Admin section + missing keys ([f3903f4](https://github.com/DonsWayo/better-chatbot/commit/f3903f40c61a34d290e7a200b6fad581c219e22d))
* **ia:** P0 information architecture — Inbox, Settings hub, admin console, Cmd-K ([266ff9e](https://github.com/DonsWayo/better-chatbot/commit/266ff9e40f8bfb27217898524abf69fd3b4f7d23))
* **ia:** P1 — Settings Connectors/Personalization/Account + Studio ([aa827e2](https://github.com/DonsWayo/better-chatbot/commit/aa827e22ab09944963c18a400f625735552f9f48))
* **identity:** Entra group-&gt;team auto-assignment + team-admin tier (Wave 4 gaps closed) ([1e760d1](https://github.com/DonsWayo/better-chatbot/commit/1e760d1bee22ed7f49a93fd7b766050a7f7cf03b))
* improve Tiptap JSON content processing with recursive parser ([#375](https://github.com/DonsWayo/better-chatbot/issues/375)) ([5cb318f](https://github.com/DonsWayo/better-chatbot/commit/5cb318f3533392d9cefba1c194dff659053e7a64))
* **knowledge:** hybrid retrieval (RRF vector+FTS+recency) + citation-first sources + unified collection visibility ([d826a11](https://github.com/DonsWayo/better-chatbot/commit/d826a11fc62850d847a6717b606016899bf64564))
* **knowledge:** PDF + DOCX ingestion — server-side extraction via multipart upload ([edd9c63](https://github.com/DonsWayo/better-chatbot/commit/edd9c630c6260f47cbeb198347cbcc9e020ab218))
* **knowledge:** Studio Knowledge tab + multi-collection chat mentions ([abb0c09](https://github.com/DonsWayo/better-chatbot/commit/abb0c0965f2d37de971a113ca47bab0b9f5af993))
* **mcp+ia:** per-tool entitlements + G-chord navigation ([fb1a67f](https://github.com/DonsWayo/better-chatbot/commit/fb1a67ff7c98cd3dc818cd1729230fd6b4628110))
* **mcp:** enforce remote-only MCP servers on cloud deployments ([9007034](https://github.com/DonsWayo/better-chatbot/commit/9007034d461ce9351d197ad04a2dbcd541f3e36a))
* **mcp:** local-MCP consent v2 — per-approval grants through the Inbox ([9f34d09](https://github.com/DonsWayo/better-chatbot/commit/9f34d097e5f14d81fa934602a67b841da9e8a3a5))
* **mcp:** local-MCP governance plane — default-deny policy, session arming, audit (ADR-0010 v1) ([41b90eb](https://github.com/DonsWayo/better-chatbot/commit/41b90ebd50bbea0ce1010457b1a8056ac29086f9))
* **mcp:** Wave 5 tool invocation audit logging (ADR-0005 security) ([1a50eac](https://github.com/DonsWayo/better-chatbot/commit/1a50eaccec92f6cc58af2cbd85c7eb923619ca8c))
* **memory:** user memory v1 — remember decisions, preferences, corrections ([d8eb9bf](https://github.com/DonsWayo/better-chatbot/commit/d8eb9bf1948aa3dd6531cd913fb0f3180b5ae5ff))
* **mobile:** Conek AI Capacitor app — iOS + Android remote thin client ([34a1ccc](https://github.com/DonsWayo/better-chatbot/commit/34a1cccdf362367d4ff7ccb9ff22ca2271f965e4))
* **models:** Auto routing re-tiered onto the verified cheap stack ([79c9723](https://github.com/DonsWayo/better-chatbot/commit/79c97235c092c6b4923b152895c35d5b29e4bbb4))
* **models:** budget tier — MiniMax M3, Kimi K2.5, DeepSeek V4 Flash ([9e16c1a](https://github.com/DonsWayo/better-chatbot/commit/9e16c1ad478f8fbb92344a2f018496c0bf2b7855))
* **models:** drop hy3-preview (chronic single-provider 429s); 429-retry in registry smoke; workflow-gen default -&gt; deepseek-v4-pro (reasoning models too slow for structured gen) ([9ff7cf1](https://github.com/DonsWayo/better-chatbot/commit/9ff7cf176742d7d838801fab98b530a9002275c0))
* **models:** frontier tier kimi-k2.5 -&gt; kimi-k2.6 (newest on OpenRouter; K2.7 not listed yet) ([8e6917f](https://github.com/DonsWayo/better-chatbot/commit/8e6917f0da91b93dd5e8f65a28b3ff40e3460748))
* **nav+i18n:** Teams/Usage in admin sidebar + i18n keys + CHANGELOG (Wave 3) ([48cbd28](https://github.com/DonsWayo/better-chatbot/commit/48cbd283703bf7d1984cf648fbadf6734567ec7c))
* **observability:** /health, Prometheus /metrics, Sentry wiring (ADR-0006) ([3e887e3](https://github.com/DonsWayo/better-chatbot/commit/3e887e3a474be5e61e6818c52505048e1be108a7))
* **onboarding:** NextStep product tours — welcome, Studio, admin ([88a676e](https://github.com/DonsWayo/better-chatbot/commit/88a676e8aa59e12e92c1d38f997bc1d7f46ff78e))
* **platform:** public /v1 API, conversational agent sessions, structured-results finish ([a694b92](https://github.com/DonsWayo/better-chatbot/commit/a694b925f4fe5053c2da69dcb10c637dc5922491))
* **prompts:** Wave 9 shared prompt library — schema, API, UI component ([edea5d7](https://github.com/DonsWayo/better-chatbot/commit/edea5d72b3a53ea328e5a9230adab9738d2e2074))
* **rag+guardrails:** Wave 6 retrieval injection + Wave 7 guardrails seam (ADR-0007/0008) ([8353063](https://github.com/DonsWayo/better-chatbot/commit/83530631ce4d24b70cf3af6448bb998e408d0680))
* **rag:** Wave 6 embedding utility — embedText, chunker, ingest (ADR-0007) ([288c91c](https://github.com/DonsWayo/better-chatbot/commit/288c91c99c154354ac7782c60c9c060ebebac66a))
* **rag:** Wave 6 knowledge base API (collections + ingest) + admin page ([e613f17](https://github.com/DonsWayo/better-chatbot/commit/e613f1747a7a854e98b74ee10fee49c81299962f))
* **ratelimit+metrics:** Wave 12 per-user rate limiting + latency histogram ([acdf3b9](https://github.com/DonsWayo/better-chatbot/commit/acdf3b9dd8a833434327d9c5946623167ce36dd1))
* **realtime:** ElectricSQL read-path sync — live shared threads (phase 2) ([da6fb8e](https://github.com/DonsWayo/better-chatbot/commit/da6fb8e06f34f228688424e85159b4bb0d59e3c2))
* **realtime:** live document comments + presence, network-idle-safe Electric push for Runs ([a59db59](https://github.com/DonsWayo/better-chatbot/commit/a59db594703d7f9f02d0246f4ae53e5046c9be07))
* **realtime:** near-live shared generation v1 ([6f06104](https://github.com/DonsWayo/better-chatbot/commit/6f06104ec6d3200304905a8779b4297980934927))
* **realtime:** presence heartbeats + avatar stacks (Electric phase 3) ([0ee6ca1](https://github.com/DonsWayo/better-chatbot/commit/0ee6ca13a4c530a6ac99a56b80db89b2c7ab5bde))
* **realtime:** typing indicators on the presence row (Electric phase 4) ([3c38f7e](https://github.com/DonsWayo/better-chatbot/commit/3c38f7e781e6db1bbb289fca6ba190c50d4754f4))
* **routing:** Auto in picker, entitlement-gated UI, routing-reason display + metrics (ADR-0004/0009) ([23410ef](https://github.com/DonsWayo/better-chatbot/commit/23410effdb611e43d852095092ee8b9105bea03b))
* **routing:** layered model entitlements at the chat seam (W2 [#12](https://github.com/DonsWayo/better-chatbot/issues/12)) ([5b0d06d](https://github.com/DonsWayo/better-chatbot/commit/5b0d06d144a233ddacd8c99194dcc216de6388e8))
* **routing:** task-aware model routing engine + policy (ADR-0004) ([70507dc](https://github.com/DonsWayo/better-chatbot/commit/70507dcfed0dca827c448ba4104b655896fd7bd3))
* **routing:** wire Auto routing + server-enforced entitlement gate into chat route (ADR-0004/0009) ([ba7c244](https://github.com/DonsWayo/better-chatbot/commit/ba7c244fed6acbe463b25da686fd37807e056d3f))
* **runs:** Runs rail + /runs/[id] transcript page ([150d85c](https://github.com/DonsWayo/better-chatbot/commit/150d85ce5ef0cd887e14c7590ae95b345457f600))
* **schema:** Wave 3 team/budget/usage tables (ADR-0002, ADR-0003) ([b09c2de](https://github.com/DonsWayo/better-chatbot/commit/b09c2de021f9c343b73c997dbd176d563eacef4a))
* **schema:** Wave 5 MCP audit + Wave 6 RAG embedding tables (ADR-0007, migration 0017) ([bac18ec](https://github.com/DonsWayo/better-chatbot/commit/bac18ecaa1f6e20b1695f7b1ab86144a3f702401))
* **sidebar:** pellet particles layer behind sidebar content ([6b32cd7](https://github.com/DonsWayo/better-chatbot/commit/6b32cd748cd4318c31b2a516eb1f5079f9cf3313))
* **sidebar:** remove MCP Configuration entry for everyone ([fef8a8f](https://github.com/DonsWayo/better-chatbot/commit/fef8a8fbb6d43150a542145e081cd4a66ffef0b4))
* **sidebar:** zen mode for regular users ([cf6a414](https://github.com/DonsWayo/better-chatbot/commit/cf6a414b4912871aa3a1ac4ec2662f65b4b9d50f))
* team member add/remove API routes (admin-only) ([20afb04](https://github.com/DonsWayo/better-chatbot/commit/20afb044a9ecf6de91d353693f9358a1d19e4b69))
* teams CRUD API + member list endpoint + E2E team-members spec ([94793c1](https://github.com/DonsWayo/better-chatbot/commit/94793c138cf2d6cf932f1f97d25d843a8f0d5034))
* **teams:** add delete, rename, and member role-change controls ([9cdd084](https://github.com/DonsWayo/better-chatbot/commit/9cdd084a459ac3a6252961923ca99bc0d3cb14df))
* **teamspaces:** folders + read-only shared threads (phase 1, [#17](https://github.com/DonsWayo/better-chatbot/issues/17)) ([07eddcb](https://github.com/DonsWayo/better-chatbot/commit/07eddcbbff6f4d205608ebee7ffa985a610f0a75))
* **testing:** real-LLM test tier (RUN_LLM_TESTS=1 pnpm test:llm) + title refusal fix ([d2c7e1d](https://github.com/DonsWayo/better-chatbot/commit/d2c7e1df5511dbac2e9815e38d2cb50d82e9f2b3))
* **triage:** approvals inbox, /schedule routines dialog, cost preview (B90 [#26](https://github.com/DonsWayo/better-chatbot/issues/26)) ([6f50ddc](https://github.com/DonsWayo/better-chatbot/commit/6f50ddc007f021add717d959e95f5b54346a0bb5))
* **ui:** migrate framer-motion -&gt; motion (13 files) + add nextstepjs 2.2.0 ([ab23d79](https://github.com/DonsWayo/better-chatbot/commit/ab23d79c07e582d854975c04ba336887e97cc09d))
* **ui:** Wave 9 prompt library button in chat input (Wave 9) ([0a30922](https://github.com/DonsWayo/better-chatbot/commit/0a30922c7651721decf949c95d6feede760fb2a1))
* **usage:** embedding costs metered into the ledger (Wave 6 gap closed) ([99ac7db](https://github.com/DonsWayo/better-chatbot/commit/99ac7db5403a3473e6077f67fdec4951f29e2aaa))
* **visibility:** store literal 4-level value (migration 0041) ([d837e6d](https://github.com/DonsWayo/better-chatbot/commit/d837e6d56ded2c98e1057cc1bec6145c53ddbdcb))
* **visibility:** surface shared-grant and team agents in lists + access checks; rewrite agent-visibility e2e for 4-level picker ([728b20f](https://github.com/DonsWayo/better-chatbot/commit/728b20f05be8b7a9da1b9bbbf75112054cbc7bb1))
* **visibility:** unified private/shared/team/company resolver ([#27](https://github.com/DonsWayo/better-chatbot/issues/27) backend) ([7136eaf](https://github.com/DonsWayo/better-chatbot/commit/7136eaf7a618056427b341e29eeae02a9f23222e))
* **visibility:** VisibilityPicker wired into workflow + agent editors ([#27](https://github.com/DonsWayo/better-chatbot/issues/27) UI) ([3868fff](https://github.com/DonsWayo/better-chatbot/commit/3868fff11743e5503d8bd4a2a9def72c9584541d))
* **visibility:** workflow lists + checkAccess honor shared grants and team overlap; document list wiring ([935a714](https://github.com/DonsWayo/better-chatbot/commit/935a7146c00cc871d6d2b67ec6dc49f9c309654f))
* W10 desktop — SSO deep-link, native file dialogs, notifications, MCP bridge scaffold, CI ([85048d4](https://github.com/DonsWayo/better-chatbot/commit/85048d4e0d95c56517b8467a78d36165f40a95c1))
* W11 compression — LanguageModelMiddleware context-compression, 17 tests, wired into chat route ([ca65591](https://github.com/DonsWayo/better-chatbot/commit/ca6559182d36b96061d3995d9e78c02cdaf1387f))
* W12 admin UI — feature flags panel with kill-switch toggle ([c0673d5](https://github.com/DonsWayo/better-chatbot/commit/c0673d51544ace88a12374db0dd27fc4662ee55f))
* W12 ADRs, feature-flag API, kill-switch E2E tests ([9204cc2](https://github.com/DonsWayo/better-chatbot/commit/9204cc2e512d22fcada2ae6d8007102b87e72613))
* W12 guardrail events admin page + sidebar ([e40cc65](https://github.com/DonsWayo/better-chatbot/commit/e40cc6586c035cc16d2b5dcf790cc9b177c1fb18))
* W12 load test, sidebar E2E for feature-flags, load testing runbook ([458657d](https://github.com/DonsWayo/better-chatbot/commit/458657dbf3ed198589edd1624d82d2687330b41d))
* W12 production hardening — SLO metrics, kill switch, feature flags ([d8516bc](https://github.com/DonsWayo/better-chatbot/commit/d8516bc27cf95d21bd77b061bdb0cbb50e22586e))
* W12 provider error tracking, Grafana dashboard, runbooks ([4a5b26e](https://github.com/DonsWayo/better-chatbot/commit/4a5b26ea8184c4cffa2ad374fe235a4ff0886b07))
* W12 quality monitoring dashboard — feedback ratings + satisfaction rate ([7a9e9e1](https://github.com/DonsWayo/better-chatbot/commit/7a9e9e12e24f52b75eeb45f6a473c6e1d77a7991))
* W12.1 provider fallback, DB pooling, eval harness, GA sign-off doc ([cec6dfe](https://github.com/DonsWayo/better-chatbot/commit/cec6dfe86bb2b50d0d865dad1cad7099f3d816eb))
* W3 self-service usage view — per-user cost/budget/tokens in settings ([5f7750c](https://github.com/DonsWayo/better-chatbot/commit/5f7750cd7765abc9d039e6db889d9f45a5ec7218))
* W3/W6/W12 — team budget wiring, RAG picker, Postgres rate-limit + cache ([dadae22](https://github.com/DonsWayo/better-chatbot/commit/dadae22634b3af315a9f784de540f31369ea18b5))
* W4 per-team model allow-list ([0377e36](https://github.com/DonsWayo/better-chatbot/commit/0377e36fdc85a93f96aa11b08f77f6223a9c9e06))
* W5 per-user model grants + audit log page + team usage breakdown ([4cb2233](https://github.com/DonsWayo/better-chatbot/commit/4cb223346a16a49bae54d0e2c490be4e7e74aefa))
* **W5:** company MCP server registry — admin CRUD API + functional catalog UI ([8a232bc](https://github.com/DonsWayo/better-chatbot/commit/8a232bca40a3cff02ae752d3cabd04bbc793b57b))
* **W5:** per-team email domain allow-list + policy UI cards ([b0798eb](https://github.com/DonsWayo/better-chatbot/commit/b0798eb0d64f0eced6adaa64ce63eea2f966544e))
* **w6:** complete RAG — collection detail + document upload UI, citations bar, knowledge route tests ([6c3ddaa](https://github.com/DonsWayo/better-chatbot/commit/6c3ddaa96860e59d4e8a3516816dcac3ba5ef42c))
* W7 guardrails — PII/secret/injection scanning, local-disk dev storage, guardrail event log ([604977b](https://github.com/DonsWayo/better-chatbot/commit/604977b8728c2e28478c9920aaf953a597bcd078))
* W8 compliance — audit log, AUP modal, employment-decision guardrail ([91dbe16](https://github.com/DonsWayo/better-chatbot/commit/91dbe166d012645816affcfffe084e32410a47a1))
* **W8:** GDPR/EU-AI-Act compliance — AUP versioned table, data export, erasure, guardrail metrics ([44664b8](https://github.com/DonsWayo/better-chatbot/commit/44664b8bd07ebf7e785c0a41379bb2b8a4336d72))
* W9 productivity — per-team guardrail policy, multimodal allow-list, profile context, 18 E2E + 9 unit tests ([9837db4](https://github.com/DonsWayo/better-chatbot/commit/9837db4ac8bcc248b4fc9fd19d07edfbd9129927))
* **workflows:** natural-language workflow generation in chat ([#19](https://github.com/DonsWayo/better-chatbot/issues/19)) ([96aa063](https://github.com/DonsWayo/better-chatbot/commit/96aa063d30fe8ef03f7d40c009d7eabf069e6e3f))


### Bug Fixes

* accept 'local' storage driver in checkStorageAction — fixes dev image uploads ([13e354d](https://github.com/DonsWayo/better-chatbot/commit/13e354d45de9a34ec1cd6bcceda9c5e2a097243c))
* **admin:** model allow-list save had NO visible feedback (router.refresh wiped inline state) — toast survives; spec asserts it ([9d869e3](https://github.com/DonsWayo/better-chatbot/commit/9d869e3369f685da7aae8b68f6002c1133d69ef3))
* **admin:** PATCH /api/admin/teams/[id] accepts the per-tool policy flags ([582056e](https://github.com/DonsWayo/better-chatbot/commit/582056e0c93cd20ca92a032c1641cd5301ce92fb))
* **agent-platform:** real-run executor persistence, worker approval flow, checkpoint resume, visibility-grant leak ([bdf4116](https://github.com/DonsWayo/better-chatbot/commit/bdf4116c51b1fcd0610838eeae727b2759f2e4f0))
* align chat messages with prompt input ([#366](https://github.com/DonsWayo/better-chatbot/issues/366)) ([e65be9f](https://github.com/DonsWayo/better-chatbot/commit/e65be9f584aa2dd62123431d72e1192b23ffb527))
* **auth:** DISABLE_AUTH_RATE_LIMIT=1 escape hatch for e2e (prod builds rate-limit back-to-back seeded sign-ins) ([a26d196](https://github.com/DonsWayo/better-chatbot/commit/a26d1966c9e1586a493d99e7f9e122f6da2ba7b1))
* **auth:** show Microsoft SSO button + wire real Entra credentials ([66e5c8b](https://github.com/DonsWayo/better-chatbot/commit/66e5c8bebeb9835b53bcdc160a684720cd3dabdc))
* **bookmarks:** honor the four-level visibility model — company/shared/team agents are bookmarkable (found by e2e sweep; check previously knew only legacy public/readonly) ([6b7dbf3](https://github.com/DonsWayo/better-chatbot/commit/6b7dbf3801d2e21fd631d3c1a204f58f49d9c1b9))
* **build:** exclude mobile/ from root tsconfig (own package like desktop/) — root build must not depend on mobile node_modules (would break Docker builds) ([4401048](https://github.com/DonsWayo/better-chatbot/commit/4401048a383cf4d30d64bd2df84b3e4630412462))
* **chat:** auto-follow the stream while at bottom; snap to bottom on send ([96e29c4](https://github.com/DonsWayo/better-chatbot/commit/96e29c420d8363abaa867d90617b10b3f40d4af4))
* **compliance+tours:** unify AUP dual-store writes; tour composer anchor works for basic users; e2e seed sets AUP column + completedTours ([549d451](https://github.com/DonsWayo/better-chatbot/commit/549d451b736bed38d3f5be87138f0d728fc4c9c5))
* **db:** repair migration journal (0022-0030 never applied); bigger sidebar logo ([f16a366](https://github.com/DonsWayo/better-chatbot/commit/f16a366d74af46d9fc2bac2207d7fb8a02edb034))
* derive current user in password reset ([#377](https://github.com/DonsWayo/better-chatbot/issues/377)) ([113a86d](https://github.com/DonsWayo/better-chatbot/commit/113a86dfe0a050c7a820347fa916b1641b499c30))
* **desktop:** CJS/ESM interop for electron-updater import ([9456fc0](https://github.com/DonsWayo/better-chatbot/commit/9456fc0490571cd67a66ea3c236a537a15d3d0e7))
* **docker+ci:** bundle standalone-migrate.mjs + exclude yaml from lint-staged ([9e1b1c3](https://github.com/DonsWayo/better-chatbot/commit/9e1b1c3d4ba3e6c591b90eafb0e8a0a6be0bfaf4))
* **docker:** bundle migrate script as CJS to avoid dynamic require errors ([29515df](https://github.com/DonsWayo/better-chatbot/commit/29515df8f87a86d9f8b94f457f560815d3987750))
* **docker:** use ESM + require polyfill banner for migrate bundle ([f53b5d7](https://github.com/DonsWayo/better-chatbot/commit/f53b5d71d5901c64d94149a3cd9feedf4e9b335e))
* **documents:** persist TipTap attrs (heading level, link href) across the Server-Action boundary ([a6bbd63](https://github.com/DonsWayo/better-chatbot/commit/a6bbd63d3962fa5d4547ded6565f2a1b983d3b9f))
* enter ([78573e4](https://github.com/DonsWayo/better-chatbot/commit/78573e4de8d509cf717123235e55e6d801eeb581))
* **entitlements:** fail closed — only admin/editor get model picker + tools; unknown/missing roles get zen defaults ([3750fa7](https://github.com/DonsWayo/better-chatbot/commit/3750fa705a44dacfdb82149e7bce58096ee3fa01))
* **helm:** standalone internet-facing ALB for asafe-ai (no group sharing) ([ca881d3](https://github.com/DonsWayo/better-chatbot/commit/ca881d334413f11790207e97208241e1ddfb16c8))
* **mcp:** 404 on malformed server id; stabilize e2e specs ([f582de6](https://github.com/DonsWayo/better-chatbot/commit/f582de621651307ace9e0caa9261c09a848c8a5a))
* **mcp:** fill disabledTools in file-based config storage mapper ([e306bf7](https://github.com/DonsWayo/better-chatbot/commit/e306bf7aac4589da361a7af27c63e1140d934284))
* **mcp:** improve 401 detection for OAuth flow trigger ([#362](https://github.com/DonsWayo/better-chatbot/issues/362)) ([a99dca9](https://github.com/DonsWayo/better-chatbot/commit/a99dca9a26117dec41611a1f40038b80026a675b))
* **mcp:** persistClient returns serializable server id, not the live client ([f59b6fd](https://github.com/DonsWayo/better-chatbot/commit/f59b6fd9056bd9c30900d2476540e52c9341ac45))
* persona-blitz triage — 13 real bugs from 20-persona QA run ([d9fb261](https://github.com/DonsWayo/better-chatbot/commit/d9fb2613da3aa224a2a849dbf9ee46951cc67630))
* **policy:** enforce team allowImageGen + allowSpeech server-side (default-deny like allowVision) ([173f3cc](https://github.com/DonsWayo/better-chatbot/commit/173f3ccba51d01a69b9a23af967188cba5bc5865))
* preserve whitespace in chat input during editing ([#361](https://github.com/DonsWayo/better-chatbot/issues/361)) ([e914a30](https://github.com/DonsWayo/better-chatbot/commit/e914a30f66113c49b60ff3695b52db3d8d7e3a8f))
* **prompt:** answer directly when no suitable tool is available (no needless refusals) ([03ed9b1](https://github.com/DonsWayo/better-chatbot/commit/03ed9b161ddb5304b8f4218613294983e97f2610))
* public /api/health + /api/metrics; publish dev Postgres on 5433 ([2dff60b](https://github.com/DonsWayo/better-chatbot/commit/2dff60b9c140ae3dbfc8ac6fd47ff3d62689b776))
* **rag:** wire ragCollectionId through request body instead of missing thread.metadata ([6d954e7](https://github.com/DonsWayo/better-chatbot/commit/6d954e7d39b1efe1500afcaf3a0e33bedca876d0))
* redirect authenticated users from auth pages to home ([#345](https://github.com/DonsWayo/better-chatbot/issues/345)) ([5c98ab6](https://github.com/DonsWayo/better-chatbot/commit/5c98ab67afd438982320515e65c4246ad418ac6e))
* remove invalid 'use server' directive from feature-flags page ([9cc8e05](https://github.com/DonsWayo/better-chatbot/commit/9cc8e055378792fc928559a64154b583380a5e23))
* replace UI sign-in with API sign-in in auth-states setup, fix playwright base URL to port 3001 ([62ac7aa](https://github.com/DonsWayo/better-chatbot/commit/62ac7aa17888db3758c6d106b19e00aa2e52bace))
* **security:** deep-audit triage — P0 governance bypasses, GDPR crash, IDOR, fail-open ([6d1424d](https://github.com/DonsWayo/better-chatbot/commit/6d1424d111038412285db64580d6a7d8453b5b09))
* **sidebar:** restore AsafeLogo header lost in post-merge stash restore; keep pellet particles layer ([88a6fc8](https://github.com/DonsWayo/better-chatbot/commit/88a6fc828f35e7c5443c2b83e0d305f2c318030d))
* **ux+models:** zen composer for basic users, current model lineup, robust NL workflow gen, looser remember-intent ([7c0ddce](https://github.com/DonsWayo/better-chatbot/commit/7c0ddcefec0b3737e62b7d206ecca339d8d2543d))
* **ux:** disable tour auto-start + sanitize provider billing errors ([d29cc79](https://github.com/DonsWayo/better-chatbot/commit/d29cc7925da23022b3a01197fe5d6c3a9d83beef))
* **visibility:** restore inArray import dropped in bun build commit ([58a64c4](https://github.com/DonsWayo/better-chatbot/commit/58a64c4d518ba0cb2d420b7abfd4ffa4232e01ff))

## [Unreleased]

### Wave 11 (partial) — Context Compression Seam

- **Add**: `wrapWithCompression` stub gated behind `ASAFE_COMPRESSION_ENABLED` env flag; seam is wired into the chat pipeline but compression logic is deferred to Wave 11 full implementation.

### Wave 9 — Feedback & Prompt Library

- **Add**: Thumbs up/down message feedback — schema (`asafe_message_feedback`), `POST /api/feedback`, `DELETE /api/feedback`, and inline feedback UI on assistant messages.
- **Add**: Prompt template library — schema (`asafe_prompt_template`), `GET/POST /api/prompts`, `GET/PUT/DELETE /api/prompts/[id]`, and prompt browser UI accessible from the chat input bar.

### Wave 8 (partial) — GDPR Data Export

- **Add**: `GET /api/user/export` — GDPR Art. 20 right-to-data-portability endpoint; exports profile, all chat threads + messages, usage events, message feedback, and prompt templates as a downloadable JSON file.
- **Add**: `/settings` page with "Download my data" button.

### Wave 7 — Guardrails Pass-Through Seam

- **Add**: `wrapWithGuardrails` stub; seam is wired into the chat pipeline so that content-policy enforcement can be dropped in without further plumbing changes. Controlled by `ASAFE_GUARDRAILS_ENABLED` env flag.

### Wave 6 — RAG / Knowledge Base

- **Add**: `asafe_knowledge_collection` and `asafe_document_chunk` schema tables (pgvector 1536-dim embedding column).
- **Add**: Embedding utility via OpenRouter `/api/embedding` proxy.
- **Add**: Document chunker (recursive character splitter).
- **Add**: `POST /api/knowledge/ingest` — admin-only document ingest pipeline (chunk → embed → store).
- **Add**: Admin knowledge base page (`/admin/knowledge`) — collection management and document upload.
- **Add**: Retrieval injection: top-K chunks prepended to system prompt when a knowledge collection is selected.

### Wave 5 — Company MCP Catalog

- **Add**: Company-managed MCP server catalog — admin creates org-scope entries; users see them automatically without needing to add servers manually.
- **Add**: Admin-only org-scope MCP management page (`/admin/mcp`).
- **Add**: `asafe_mcp_invocation_log` table + logging middleware that records every MCP tool invocation for audit purposes.

### Wave 4 — Entra OIDC Group→Role Mapping

- **Add**: Azure Entra ID OIDC provider configured in Better Auth; `groups` claim from the ID token is mapped to Asafe roles (`admin` / `editor` / `user`) via `ASAFE_ENTRA_GROUP_ADMIN` and `ASAFE_ENTRA_GROUP_EDITOR` env vars.

### Wave 3 (in progress) — Teams, Budget Enforcement & Usage Dashboard

- **Add**: Team schema tables (`team`, `team_member`, `usage_event`, `team_budget`)
- **Add**: Budget enforcement — pre-flight check (HTTP 402 on exhaustion) + usage event recording
- **Add**: Admin teams management page (`/admin/teams`) with create/list/detail/member assignment
- **Add**: Admin usage cost dashboard (`/admin/usage`) — cost by model, task class, period
- **Add**: Admin nav: Teams and Usage links

### Wave 2 (in progress) — Task-Aware Routing & Entitlements

- **Auto model routing**: task-aware routing contract; rules strategy + policy ADR; "Auto" option wired into model picker UI.
- **Server-enforced entitlements**: default-deny gate — normal users cannot select model or tools; privileged roles unlock picker and tool controls.
- **System prompt fix**: assistant answers directly when no tool matches, eliminating spurious tool-call loops.
- **Routing observability**: per-route metrics and fallback/retry logic (in progress).

### Wave 1 — Foundation

- **Fork & rebrand**: forked [cgoinglove/better-chatbot](https://github.com/cgoinglove/better-chatbot) and rebranded throughout as Asafe AI (MIT attribution preserved in FORK.md).
- **OpenRouter-only model registry**: trimmed registry to an approved short list of OpenRouter models; removed all other provider entries.
- **Observability baseline**: `/api/health` and `/api/metrics` endpoints; Sentry error tracking integrated.
- **EKS deployment**: Helm chart + Kubernetes manifests for production deployment on AWS EKS.
- **AI-native Postgres**: `docker-compose` stack with `pgvector`, `timescaledb`, and `pgvectorscale` extensions.
- **Environment config**: `.env.example` updated to reflect Asafe AI deployment variables.

---

## [1.26.0](https://github.com/cgoinglove/better-chatbot/compare/v1.25.0...v1.26.0) (2025-11-07)


### Features

* add LaTeX/TeX math equation rendering support ([#318](https://github.com/cgoinglove/better-chatbot/issues/318)) ([c0a8b5b](https://github.com/cgoinglove/better-chatbot/commit/c0a8b5b9b28599716013c83cac03fa5745ffd403)) by @jezweb


### Bug Fixes

* hide MCP server credentials from non-owners ([#317](https://github.com/cgoinglove/better-chatbot/issues/317)) ([#319](https://github.com/cgoinglove/better-chatbot/issues/319)) ([6e32417](https://github.com/cgoinglove/better-chatbot/commit/6e32417535c27f1215f96d68b7302dba4a1b904d)) by @jezweb

## [1.25.0](https://github.com/cgoinglove/better-chatbot/compare/v1.24.0...v1.25.0) (2025-10-30)


### Features

* s3 storage and richer file support ([#301](https://github.com/cgoinglove/better-chatbot/issues/301)) ([051a974](https://github.com/cgoinglove/better-chatbot/commit/051a9740a6ecf774bfead9ce327c376ea5b279a5)) by @mrjasonroy


### Bug Fixes

* model name for gpt-4.1-mini in staticModels ([#299](https://github.com/cgoinglove/better-chatbot/issues/299)) ([4513ac0](https://github.com/cgoinglove/better-chatbot/commit/4513ac0e842f588a24d7075af8700e3cc7a3eb39)) by @mayur9210

## [1.24.0](https://github.com/cgoinglove/better-chatbot/compare/v1.23.0...v1.24.0) (2025-10-06)


### Features

* generate image Tool (Nano Banana) ([#284](https://github.com/cgoinglove/better-chatbot/issues/284)) ([984ce66](https://github.com/cgoinglove/better-chatbot/commit/984ce665ceef7225870f4eb751afaf65bf8a2dd4)) by @cgoinglove
* openai image generate ([#287](https://github.com/cgoinglove/better-chatbot/issues/287)) ([0deef6e](https://github.com/cgoinglove/better-chatbot/commit/0deef6e8a83196afb1f44444ab2f13415de20e73)) by @cgoinglove

## [1.23.0](https://github.com/cgoinglove/better-chatbot/compare/v1.22.0...v1.23.0) (2025-10-04)


### Features

* export chat thread ([#278](https://github.com/cgoinglove/better-chatbot/issues/278)) ([23e79cd](https://github.com/cgoinglove/better-chatbot/commit/23e79cd570c24bab0abc496eca639bfffcb6060b)) by @cgoinglove
* **file-storage:** image uploads, generate profile with ai ([#257](https://github.com/cgoinglove/better-chatbot/issues/257)) ([46eb43f](https://github.com/cgoinglove/better-chatbot/commit/46eb43f84792d48c450f3853b48b24419f67c7a1)) by @brrock


### Bug Fixes

* Apply DISABLE_SIGN_UP to OAuth providers ([#282](https://github.com/cgoinglove/better-chatbot/issues/282)) ([bcc0db8](https://github.com/cgoinglove/better-chatbot/commit/bcc0db8eb81997e54e8904e64fc76229fbfc1338)) by @cgoing-bot
* ollama disable issue ([#283](https://github.com/cgoinglove/better-chatbot/issues/283)) ([5e0a690](https://github.com/cgoinglove/better-chatbot/commit/5e0a690bb6c3f074680d13e09165ca9fff139f93)) by @cgoinglove

## [1.22.0](https://github.com/cgoinglove/better-chatbot/compare/v1.21.0...v1.22.0) (2025-09-25)

### Features

- admin and roles ([#270](https://github.com/cgoinglove/better-chatbot/issues/270)) ([63bddca](https://github.com/cgoinglove/better-chatbot/commit/63bddcaa4bc62bc85204a0982a06f2bed09fc5f5)) by @mrjasonroy
- groq provider ([#268](https://github.com/cgoinglove/better-chatbot/issues/268)) ([aef213d](https://github.com/cgoinglove/better-chatbot/commit/aef213d2f9dd0255996cc4184b03425db243cd7b)) by @cgoinglove
- hide LLM providers without API keys in model selection ([#269](https://github.com/cgoinglove/better-chatbot/issues/269)) ([63c15dd](https://github.com/cgoinglove/better-chatbot/commit/63c15dd386ea99b8fa56f7b6cb1e58e5779b525d)) by @cgoinglove
- **voice-chat:** binding agent tools ([#275](https://github.com/cgoinglove/better-chatbot/issues/275)) ([ed45e82](https://github.com/cgoinglove/better-chatbot/commit/ed45e822eb36447f2a02ef3aa69eeec88009e357)) by @cgoinglove

### Bug Fixes

- ensure PKCE works for MCP Server auth ([#256](https://github.com/cgoinglove/better-chatbot/issues/256)) ([09b938f](https://github.com/cgoinglove/better-chatbot/commit/09b938f17ca78993a1c7b84c5a702b95159542b2)) by @jvg123

## [1.21.0](https://github.com/cgoinglove/better-chatbot/compare/v1.20.2...v1.21.0) (2025-08-24)

### Features

- agent sharing ([#226](https://github.com/cgoinglove/better-chatbot/issues/226)) ([090dd8f](https://github.com/cgoinglove/better-chatbot/commit/090dd8f4bf4fb82beb2cd9bfa0b427425bbbf352)) by @mrjasonroy
- ai v5 ([#230](https://github.com/cgoinglove/better-chatbot/issues/230)) ([0461879](https://github.com/cgoinglove/better-chatbot/commit/0461879740860055a278c96656328367980fa533)) by @cgoinglove
- improve markdown table styling ([#244](https://github.com/cgoinglove/better-chatbot/issues/244)) ([7338e04](https://github.com/cgoinglove/better-chatbot/commit/7338e046196f72a7cc8ec7903593d94ecabcc05e)) by @hakonharnes

### Bug Fixes

- [#111](https://github.com/cgoinglove/better-chatbot/issues/111) prevent MCP server disconnection during long-running tool calls ([#238](https://github.com/cgoinglove/better-chatbot/issues/238)) ([b5bb3dc](https://github.com/cgoinglove/better-chatbot/commit/b5bb3dc40a025648ecd78f547e0e1a2edd8681ca)) by @cgoinglove

## [1.20.2](https://github.com/cgoinglove/better-chatbot/compare/v1.20.1...v1.20.2) (2025-08-09)

### Bug Fixes

- improve error display with better UX and animation handling ([#227](https://github.com/cgoinglove/better-chatbot/issues/227)) ([35d62e0](https://github.com/cgoinglove/better-chatbot/commit/35d62e05bb21760086c184511d8062444619696c)) by @cgoinglove
- **mcp:** ensure database and memory manager sync across server instances ([#229](https://github.com/cgoinglove/better-chatbot/issues/229)) ([c4b8ebe](https://github.com/cgoinglove/better-chatbot/commit/c4b8ebe9566530986951671e36111a2e529bf592)) by @cgoinglove

## [1.20.1](https://github.com/cgoinglove/better-chatbot/compare/v1.20.0...v1.20.1) (2025-08-06)

### Bug Fixes

- **mcp:** fix MCP infinite loading issue ([#220](https://github.com/cgoinglove/better-chatbot/issues/220)) ([c25e351](https://github.com/cgoinglove/better-chatbot/commit/c25e3515867c76cc5494a67e79711e9343196078)) by @cgoing-bot

## [1.20.0](https://github.com/cgoinglove/better-chatbot/compare/v1.19.1...v1.20.0) (2025-08-04)

### Features

- add qwen3 coder to models file for openrouter ([#206](https://github.com/cgoinglove/better-chatbot/issues/206)) ([3731d00](https://github.com/cgoinglove/better-chatbot/commit/3731d007100ac36a814704f8bde8398ce1378a4e)) by @brrock
- improve authentication configuration and social login handling ([#211](https://github.com/cgoinglove/better-chatbot/issues/211)) ([cd25937](https://github.com/cgoinglove/better-chatbot/commit/cd25937020710138ab82458e70ea7f6cabfd03ca)) by @mrjasonroy
- introduce interactive table creation and enhance visualization tools ([#205](https://github.com/cgoinglove/better-chatbot/issues/205)) ([623a736](https://github.com/cgoinglove/better-chatbot/commit/623a736f6895b8737acaa06811088be2dc1d0b3c)) by @cgoing-bot
- **mcp:** oauth ([#208](https://github.com/cgoinglove/better-chatbot/issues/208)) ([136aded](https://github.com/cgoinglove/better-chatbot/commit/136aded6de716367380ff64c2452d1b4afe4aa7f)) by @cgoinglove
- **web-search:** replace Tavily API with Exa AI integration ([#204](https://github.com/cgoinglove/better-chatbot/issues/204)) ([7140487](https://github.com/cgoinglove/better-chatbot/commit/7140487dcdadb6c5cb6af08f92b06d42411f7168)) by @cgoing-bot

### Bug Fixes

- implement responsive horizontal layout for chat mention input with improved UX And generate Agent Prompt ([43ec980](https://github.com/cgoinglove/better-chatbot/commit/43ec98059e0d27ab819491518263df55fb1c9ad3)) by @cgoinglove
- **mcp:** Safe MCP manager init logic for the Vercel environment ([#202](https://github.com/cgoinglove/better-chatbot/issues/202)) ([708fdfc](https://github.com/cgoinglove/better-chatbot/commit/708fdfcfed70299044a90773d3c9a76c9a139f2f)) by @cgoing-bot

## [1.19.1](https://github.com/cgoinglove/better-chatbot/compare/v1.19.0...v1.19.1) (2025-07-29)

### Bug Fixes

- **agent:** improve agent loading logic and validation handling in EditAgent component [#198](https://github.com/cgoinglove/better-chatbot/issues/198) ([ec034ab](https://github.com/cgoinglove/better-chatbot/commit/ec034ab51dfc656d7378eca1e2b4dc94fbb67863)) by @cgoinglove
- **agent:** update description field to allow nullish values in ChatMentionSchema ([3e4532d](https://github.com/cgoinglove/better-chatbot/commit/3e4532d4c7b561ad03836c743eefb7cd35fe9e74)) by @cgoinglove
- **i18n:** update agent description fields in English, Spanish, and French JSON files to improve clarity and consistency ([f07d1c4](https://github.com/cgoinglove/better-chatbot/commit/f07d1c4dc64b96584faa7e558f981199834a5370)) by @cgoinglove
- Invalid 'tools': array too long. Expected an array with maximum length 128, but got an array with length 217 instead. [#197](https://github.com/cgoinglove/better-chatbot/issues/197) ([b967e3a](https://github.com/cgoinglove/better-chatbot/commit/b967e3a30be3a8a48f3801b916e26ac4d7dd50f4)) by @cgoinglove

## [1.19.0](https://github.com/cgoinglove/better-chatbot/compare/v1.18.0...v1.19.0) (2025-07-28)

### Features

- Add Azure OpenAI provider support with comprehensive testing ([#189](https://github.com/cgoinglove/better-chatbot/issues/189)) ([edad917](https://github.com/cgoinglove/better-chatbot/commit/edad91707d49fcb5d3bd244a77fbaae86527742a)) by @shukyr
- add bot name preference to user settings ([f4aa588](https://github.com/cgoinglove/better-chatbot/commit/f4aa5885d0be06cc21149d09e604c781e551ec4a)) by @cgoinglove
- **agent:** agent and archive ([#192](https://github.com/cgoinglove/better-chatbot/issues/192)) ([c63ae17](https://github.com/cgoinglove/better-chatbot/commit/c63ae179363b66bfa4f4b5524bdf27b71166c299)) by @cgoinglove

### Bug Fixes

- enhance event handling for keyboard shortcuts in chat components ([95dad3b](https://github.com/cgoinglove/better-chatbot/commit/95dad3bd1dac4b6e56be2df35957a849617ba056)) by @cgoinglove
- refine thinking prompt condition in chat API ([0192151](https://github.com/cgoinglove/better-chatbot/commit/0192151fec1e33f3b7bc1f08b0a9582d66650ef0)) by @cgoinglove

## [1.18.0](https://github.com/cgoinglove/better-chatbot/compare/v1.17.1...v1.18.0) (2025-07-24)

### Features

- add sequential thinking tool and enhance UI components ([#183](https://github.com/cgoinglove/better-chatbot/issues/183)) ([5bcbde2](https://github.com/cgoinglove/better-chatbot/commit/5bcbde2de776b17c3cc1f47f4968b13e22fc65b2)) by @cgoinglove

## [1.17.1](https://github.com/cgoinglove/better-chatbot/compare/v1.17.0...v1.17.1) (2025-07-23)

### Bug Fixes

- ensure thread date fallback to current date in AppSidebarThreads component ([800b504](https://github.com/cgoinglove/better-chatbot/commit/800b50498576cfe1717da4385e2a496ac33ea0ad)) by @cgoinglove
- link to the config generator correctly ([#184](https://github.com/cgoinglove/better-chatbot/issues/184)) ([1865ecc](https://github.com/cgoinglove/better-chatbot/commit/1865ecc269e567838bc391a3236fcce82c213fc0)) by @brrock
- python executor ([ea58742](https://github.com/cgoinglove/better-chatbot/commit/ea58742cccd5490844b3139a37171b1b68046f85)) by @cgoinglove

## [1.17.0](https://github.com/cgoinglove/better-chatbot/compare/v1.16.0...v1.17.0) (2025-07-18)

### Features

- add Python execution tool and integrate Pyodide support ([#176](https://github.com/cgoinglove/better-chatbot/issues/176)) ([de2cf7b](https://github.com/cgoinglove/better-chatbot/commit/de2cf7b66444fe64791ed142216277a5f2cdc551)) by @cgoinglove

### Bug Fixes

- generate title by user message ([9ee4be6](https://github.com/cgoinglove/better-chatbot/commit/9ee4be69c6b90f44134d110e90f9c3da5219c79f)) by @cgoinglove
- generate title sync ([5f3afdc](https://github.com/cgoinglove/better-chatbot/commit/5f3afdc4cb7304460606b3480f54f513ef24940c)) by @cgoinglove

## [1.16.0](https://github.com/cgoinglove/better-chatbot/compare/v1.15.0...v1.16.0) (2025-07-15)

### Features

- Lazy Chat Title Generation: Save Empty Title First, Then Generate and Upsert in Parallel ([#162](https://github.com/cgoinglove/better-chatbot/issues/162)) ([31dfd78](https://github.com/cgoinglove/better-chatbot/commit/31dfd7802e33d8d4e91aae321c3d16a07fe42552)) by @cgoinglove
- publish container to GitHub registry ([#149](https://github.com/cgoinglove/better-chatbot/issues/149)) ([9f03cbc](https://github.com/cgoinglove/better-chatbot/commit/9f03cbc1d2890746f14919ebaad60f773b0a333d)) by @codingjoe
- update mention ux ([#161](https://github.com/cgoinglove/better-chatbot/issues/161)) ([7ceb9c6](https://github.com/cgoinglove/better-chatbot/commit/7ceb9c69c32de25d523a4d14623b25a34ffb3c9d)) by @cgoinglove

### Bug Fixes

- bug(LineChart): series are incorrectly represented [#165](https://github.com/cgoinglove/better-chatbot/issues/165) ([4e4905c](https://github.com/cgoinglove/better-chatbot/commit/4e4905c0f7f6a3eca73ea2ac06f718fa29b0f821)) by @cgoinglove
- ignore tool binding on unsupported models (server-side) ([#160](https://github.com/cgoinglove/better-chatbot/issues/160)) ([277b4fe](https://github.com/cgoinglove/better-chatbot/commit/277b4fe986d5b6d9780d9ade83f294d8f34806f6)) by @cgoinglove
- js executor tool and gemini model version ([#169](https://github.com/cgoinglove/better-chatbot/issues/169)) ([e25e10a](https://github.com/cgoinglove/better-chatbot/commit/e25e10ab9fac4247774b0dee7e01d5f6a4b16191)) by @cgoinglove
- **scripts:** parse openai compatible on windows ([#164](https://github.com/cgoinglove/better-chatbot/issues/164)) ([41f5ff5](https://github.com/cgoinglove/better-chatbot/commit/41f5ff55b8d17c76a23a2abf4a6e4cb0c4d95dc5)) by @axel7083
- **workflow-panel:** fix save button width ([#168](https://github.com/cgoinglove/better-chatbot/issues/168)) ([3e66226](https://github.com/cgoinglove/better-chatbot/commit/3e6622630c9cc40ff3d4357e051c45f8c860fc10)) by @axel7083

## [1.15.0](https://github.com/cgoinglove/better-chatbot/compare/v1.14.1...v1.15.0) (2025-07-11)

### Features

- Add js-execution tool and bug fixes(tool call) ([#148](https://github.com/cgoinglove/better-chatbot/issues/148)) ([12b18a1](https://github.com/cgoinglove/better-chatbot/commit/12b18a1cf31a17e565eddc05764b5bd2d0b0edee)) by @cgoinglove

### Bug Fixes

- enhance ToolModeDropdown with tooltip updates and debounce functionality ([d06db0b](https://github.com/cgoinglove/better-chatbot/commit/d06db0b3e1db34dc4785eb31ebd888d7c2ae0d64)) by @cgoinglove

## [1.14.1](https://github.com/cgoinglove/better-chatbot/compare/v1.14.0...v1.14.1) (2025-07-09)

### Bug Fixes

- tool select ui ([#141](https://github.com/cgoinglove/better-chatbot/issues/141)) ([0795524](https://github.com/cgoinglove/better-chatbot/commit/0795524991a7aa3e17990777ca75381e32eaa547)) by @cgoinglove

## [1.14.0](https://github.com/cgoinglove/better-chatbot/compare/v1.13.0...v1.14.0) (2025-07-07)

### Features

- web-search with images ([bea76b3](https://github.com/cgoinglove/better-chatbot/commit/bea76b3a544d4cf5584fa29e5c509b0aee1d4fee)) by @cgoinglove
- **workflow:** add auto layout feature for workflow nodes and update UI messages ([0cfbffd](https://github.com/cgoinglove/better-chatbot/commit/0cfbffd631c9ae5c6ed57d47ca5f34b9acbb257d)) by @cgoinglove
- **workflow:** stable workflow ( add example workflow : baby-research ) ([#137](https://github.com/cgoinglove/better-chatbot/issues/137)) ([c38a7ea](https://github.com/cgoinglove/better-chatbot/commit/c38a7ea748cdb117a4d0f4b886e3d8257a135956)) by @cgoinglove

### Bug Fixes

- **api:** handle error case in chat route by using orElse for unwrap ([25580a2](https://github.com/cgoinglove/better-chatbot/commit/25580a2a9f6c9fbc4abc29fee362dc4b4f27f9b4)) by @cgoinglove
- **workflow:** llm structure Output ([c529292](https://github.com/cgoinglove/better-chatbot/commit/c529292ddc1a4b836a5921e25103598afd7e3ab7)) by @cgoinglove

## [1.13.0](https://github.com/cgoinglove/better-chatbot/compare/v1.12.1...v1.13.0) (2025-07-04)

### Features

- Add web search and content extraction tools using Tavily API ([#126](https://github.com/cgoinglove/better-chatbot/issues/126)) ([f7b4ea5](https://github.com/cgoinglove/better-chatbot/commit/f7b4ea5828b33756a83dd881b9afa825796bf69f)) by @cgoing-bot

### Bug Fixes

- workflow condition node issue ([78b7add](https://github.com/cgoinglove/better-chatbot/commit/78b7addbba51b4553ec5d0ce8961bf90be5d649c)) by @cgoinglove
- **workflow:** improve mention handling by ensuring empty values are represented correctly ([92ff9c3](https://github.com/cgoinglove/better-chatbot/commit/92ff9c3e14b97d9f58a22f9df2559e479f14537c)) by @cgoinglove
- **workflow:** simplify mention formatting by removing bold styling for non-empty values ([ef65fd7](https://github.com/cgoinglove/better-chatbot/commit/ef65fd713ab59c7d8464cae480df7626daeff5cd)) by @cgoinglove

## [1.12.1](https://github.com/cgoinglove/better-chatbot/compare/v1.12.0...v1.12.1) (2025-07-02)

### Bug Fixes

- **workflow:** enhance structured output handling and improve user notifications ([dd43de9](https://github.com/cgoinglove/better-chatbot/commit/dd43de99881d64ca0c557e29033e953bcd4adc0e)) by @cgoinglove

## [1.12.0](https://github.com/cgoinglove/better-chatbot/compare/v1.11.0...v1.12.0) (2025-07-01)

### Features

- **chat:** enable [@mention](https://github.com/mention) and tool click to trigger workflow execution in chat ([#122](https://github.com/cgoinglove/better-chatbot/issues/122)) ([b4e7f02](https://github.com/cgoinglove/better-chatbot/commit/b4e7f022fa155ef70be2aee9228a4d1d2643bf10)) by @cgoing-bot

### Bug Fixes

- clean changlelog and stop duplicate attributions in the changelog file ([#119](https://github.com/cgoinglove/better-chatbot/issues/119)) ([aa970b6](https://github.com/cgoinglove/better-chatbot/commit/aa970b6a2d39ac1f0ca22db761dd452e3c7a5542)) by @brrock

## [1.11.0](https://github.com/cgoinglove/better-chatbot/compare/v1.10.0...v1.11.0) (2025-06-28)

### Features

- **workflow:** Add HTTP and Template nodes with LLM structured output supportWorkflow node ([#117](https://github.com/cgoinglove/better-chatbot/issues/117)) ([10ec438](https://github.com/cgoinglove/better-chatbot/commit/10ec438f13849f0745e7fab652cdd7cef8e97ab6)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot
- **workflow:** add HTTP node configuration and execution support ([7d2f65f](https://github.com/cgoinglove/better-chatbot/commit/7d2f65fe4f0fdaae58ca2a69abb04abee3111c60)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

### Bug Fixes

- add POST endpoint for MCP client saving with session validation ([fa005aa](https://github.com/cgoinglove/better-chatbot/commit/fa005aaecbf1f8d9279f5b4ce5ba85343e18202b)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- split theme system into base themes and style variants ([61ebd07](https://github.com/cgoinglove/better-chatbot/commit/61ebd0745bcfd7a84ba3ad65c3f52b7050b5131a)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- update ToolMessagePart to use isExecuting state instead of isExpanded ([752f8f0](https://github.com/cgoinglove/better-chatbot/commit/752f8f06e319119569e9ee7c04d621ab1c43ca54)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

## [1.10.0](https://github.com/cgoinglove/better-chatbot/compare/v1.9.0...v1.10.0) (2025-06-27)

### Features

- **releases:** add debug logging to the add authors and update release step ([#105](https://github.com/cgoinglove/better-chatbot/issues/105)) ([c855a6a](https://github.com/cgoinglove/better-chatbot/commit/c855a6a94c49dfd93c9a8d1d0932aeda36bd6c7e)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock
- workflow beta ([#100](https://github.com/cgoinglove/better-chatbot/issues/100)) ([2f5ada2](https://github.com/cgoinglove/better-chatbot/commit/2f5ada2a66e8e3cd249094be9d28983e4331d3a1)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot

### Bug Fixes

- update tool selection logic in McpServerSelector to maintain current selections ([4103c1b](https://github.com/cgoinglove/better-chatbot/commit/4103c1b828c3e5b513679a3fb9d72bd37301f99d)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- **workflow:** MPC Tool Response Structure And Workflow ([#113](https://github.com/cgoinglove/better-chatbot/issues/113)) ([836ffd7](https://github.com/cgoinglove/better-chatbot/commit/836ffd7ef5858210bdce44d18ca82a1c8f0fc87f)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot

## [1.9.0](https://github.com/cgoinglove/better-chatbot/compare/v1.8.0...v1.9.0) (2025-06-16)

### Features

- credit contributors in releases and changlogs ([#104](https://github.com/cgoinglove/better-chatbot/issues/104)) ([e0e4443](https://github.com/cgoinglove/better-chatbot/commit/e0e444382209a36f03b6e898f26ebd805032c306)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock

### Bug Fixes

- increase maxTokens for title generation in chat actions issue [#102](https://github.com/cgoinglove/better-chatbot/issues/102) ([bea2588](https://github.com/cgoinglove/better-chatbot/commit/bea2588e24cf649133e8ce5f3b6391265b604f06)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- temporary chat initial model ([0393f7a](https://github.com/cgoinglove/better-chatbot/commit/0393f7a190463faf58cbfbca1c21d349a9ff05dc)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- update adding-openAI-like-providers.md ([#101](https://github.com/cgoinglove/better-chatbot/issues/101)) ([2bb94e7](https://github.com/cgoinglove/better-chatbot/commit/2bb94e7df63a105e33c1d51271751c7b89fead23)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock
- update config file path in release workflow ([7209cbe](https://github.com/cgoinglove/better-chatbot/commit/7209cbeb89bd65b14aee66a40ed1abb5c5f2e018)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

## [1.8.0](https://github.com/cgoinglove/better-chatbot/compare/v1.7.0...v1.8.0) (2025-06-11)

### Features

- add openAI compatible provider support ([#92](https://github.com/cgoinglove/better-chatbot/issues/92)) ([6682c9a](https://github.com/cgoinglove/better-chatbot/commit/6682c9a320aff9d91912489661d27ae9bb0f4440)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock

### Bug Fixes

- Enhance component styles and configurations ([a7284f1](https://github.com/cgoinglove/better-chatbot/commit/a7284f12ca02ee29f7da4d57e4fe6e8c6ecb2dfc)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

## [1.7.0](https://github.com/cgoinglove/better-chatbot/compare/v1.6.2...v1.7.0) (2025-06-06)

### Features

- Per User Custom instructions ([#86](https://github.com/cgoinglove/better-chatbot/issues/86)) ([d45c968](https://github.com/cgoinglove/better-chatbot/commit/d45c9684adfb0d9b163c83f3bb63310eef572279)) by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu

## [1.6.2](https://github.com/cgoinglove/better-chatbot/compare/v1.6.1...v1.6.2) (2025-06-04)

### Bug Fixes

- enhance error handling in chat bot component ([1519799](https://github.com/cgoinglove/better-chatbot/commit/15197996ba1f175db002b06e3eac2765cfae1518)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- improve session error handling in authentication ([eb15b55](https://github.com/cgoinglove/better-chatbot/commit/eb15b550facf5368f990d58b4b521bf15aecbf72)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- support OpenAI real-time chat project instructions ([2ebbb5e](https://github.com/cgoinglove/better-chatbot/commit/2ebbb5e68105ef6706340a6cfbcf10b4d481274a)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- unify SSE and streamable config as RemoteConfig ([#85](https://github.com/cgoinglove/better-chatbot/issues/85)) ([66524a0](https://github.com/cgoinglove/better-chatbot/commit/66524a0398bd49230fcdec73130f1eb574e97477)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot

## [1.6.1](https://github.com/cgoinglove/better-chatbot/compare/v1.6.0...v1.6.1) (2025-06-02)

### Bug Fixes

- speech ux ([baa849f](https://github.com/cgoinglove/better-chatbot/commit/baa849ff2b6b147ec685c6847834385652fc3191)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

## [1.6.0](https://github.com/cgoinglove/better-chatbot/compare/v1.5.2...v1.6.0) (2025-06-01)

### Features

- add husky for formatting and checking commits ([#71](https://github.com/cgoinglove/better-chatbot/issues/71)) ([a379cd3](https://github.com/cgoinglove/better-chatbot/commit/a379cd3e869b5caab5bcaf3b03f5607021f988ef)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- add Spanish, French, Japanese, and Chinese language support with UI improvements ([#74](https://github.com/cgoinglove/better-chatbot/issues/74)) ([e34d43d](https://github.com/cgoinglove/better-chatbot/commit/e34d43df78767518f0379a434f8ffb1808b17e17)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot
- implement cold start-like auto connection for MCP server and simplify status ([#73](https://github.com/cgoinglove/better-chatbot/issues/73)) ([987c442](https://github.com/cgoinglove/better-chatbot/commit/987c4425504d6772e0aefe08b4e1911e4cb285c1)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot

## [1.5.2](https://github.com/cgoinglove/better-chatbot/compare/v1.5.1...v1.5.2) (2025-06-01)

### Features

- Add support for Streamable HTTP Transport [#56](https://github.com/cgoinglove/better-chatbot/issues/56) ([8783943](https://github.com/cgoinglove/better-chatbot/commit/878394337e3b490ec2d17bcc302f38c695108d73)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- implement speech system prompt and update voice chat options for enhanced user interaction ([5a33626](https://github.com/cgoinglove/better-chatbot/commit/5a336260899ab542407c3c26925a147c1a9bba11)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- update MCP server UI and translations for improved user experience ([1e2fd31](https://github.com/cgoinglove/better-chatbot/commit/1e2fd31f8804669fbcf55a4c54ccf0194a7e797c)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

### Bug Fixes

- enhance mobile UI experience with responsive design adjustments ([2eee8ba](https://github.com/cgoinglove/better-chatbot/commit/2eee8bab078207841f4d30ce7708885c7268302e)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- UI improvements for mobile experience ([#66](https://github.com/cgoinglove/better-chatbot/issues/66)) ([b4349ab](https://github.com/cgoinglove/better-chatbot/commit/b4349abf75de69f65a44735de2e0988c6d9d42d8)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

### Miscellaneous Chores

- release 1.5.2 ([d185514](https://github.com/cgoinglove/better-chatbot/commit/d1855148cfa53ea99c9639f8856d0e7c58eca020)) by @cgoinglove
