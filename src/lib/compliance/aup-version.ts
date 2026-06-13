// AUP version constant, kept in its own module (NO "server-only") so plain-Node
// contexts — the e2e seed script under tsx, tests — can import it without
// pulling in the server-only aup.ts (which touches the DB/session layer).
export const CURRENT_AUP_VERSION = "1.0";
