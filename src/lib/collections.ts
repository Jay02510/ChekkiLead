// Firestore collection names in one place. Importable from both client and
// server code — plain constants, no SDK imports.
//
// v2 split: `leads` was filled by several pipeline versions (some of which
// guessed emails and ages), so it can't be trusted as a lead list or used as
// the "after" in an eval comparison. It stays as read-only history: it holds
// the gold set, and it remembers which academies must never be contacted
// again (see src/lib/blocklist.ts). Everything the final pipeline produces
// goes to `leads_v2`.
export const LEGACY_LEADS = "leads";
export const LEADS = "leads_v2";
export const DEV_LEADS = "leads_v2_dev";
