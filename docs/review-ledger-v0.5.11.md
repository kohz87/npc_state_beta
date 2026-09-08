# v0.5.11 implementation review ledger

`docs/core-contract.md` remains authoritative. This development-only ledger is excluded from the installable package. Tests use controlled host/storage/model fixtures and never access or rebuild a user NPC State database.

## Implementation candidate

Candidate: `5bf6f91f4da2ef67c500b03d3f966ddf589e399a`.

Scope implemented: replace embedded foreground extraction/fallback/completeness with one dedicated post-response Scan; continuity-only foreground injection; awaited next-generation synchronization through SillyTavern `generate_interceptor`; exact source ownership captured before async waits; bounded current-exchange scanner context; retained 0.7.10 collection/field-accounting/Current-Dynamic fixes; settings migration; release presentation reset to 0.5.11 without changing storage identity/schema.

Validation before review: `npm run validate`, `npm test`, `npm run package`, and ZIP integrity passed with 282/282 tests, 81 JavaScript files, and 55 packaged files. Same 60-NPC/Bessa fixture: foreground extraction instruction overhead changed from 4,702 chars / ~1,350 local-estimate tokens to 621 chars / ~178 while selected dossiers increased from 1 to 6 under the same 1,800-token budget; routine Scan changed from 133,394 chars / ~38,125 local-estimate tokens to 31,832 chars / ~9,108.

## Post-implementation review

Reviewed SHA: `5bf6f91f4da2ef67c500b03d3f966ddf589e399a`.

Inspected: automatic extraction and scan context (`src/scan-prompts.js`, scanner/application/evidence boundaries); asynchronous lifecycle (`src/index.js`, `src/post-response-coordinator.js`, `src/engine.js`, `src/shared-generation-queue.js`); rollback/recovery and manual ownership; settings/data compatibility; legacy transport canonicalization; public diagnostics/API compatibility; package reachability and retired-path references.

Concrete hypotheses/probes: delayed duplicate completion for an older source after a newer assistant boundary; same-position revised/swiped source while the older provider request is in flight; chat switch/clear while a scan is in flight; next-turn synchronization, timeout/retry and scanner-recursion behavior; exact-checkpoint deletion, manual-correction rollback and recovery persistence; schema-1/settings migration, alternate routing, parser/semantic contract and package loading; source search for retired embedded/completeness runtime consumers.

Confirmed finding: the coordinator retained every completed job indefinitely, and source descriptors retained host context/message references. `clearChat()` removed status but did not abort/retire those jobs, so switched-away scans could continue consuming provider work until engine ownership eventually discarded them. Retaining old completed jobs also served as accidental replay suppression rather than an explicit bounded policy.

Fix commit: `28d1caa8fb7a3c5e27eeb389f68840bf579afba1`. Keep compact immutable source descriptors; track the newest assistant boundary per chat; ignore delayed older completion events; abort superseded same-position revisions through the existing per-job `AbortController`; retire non-current settled jobs; abort/delete all jobs for a cleared chat; preserve the newest completed result for duplicate events. No second cancellation system was added.

Focused verification after the fix: 14/14 post-response rework tests, 42/42 asynchronous/rollback/recovery tests, and 52/52 contract/settings/package-consumer tests passed locally before publication. The exact reviewed tree also passes the full repository validation/test/package gates.

Remaining limitation: no authorized live SillyTavern/provider setup or exact configured provider/model identifier corresponding to the user label “Gemini 3.8 Flash” was available, so live sample count is 0. Deterministic tests do not measure provider output reliability.
