# Development

## Authoritative source

`src/` is the checked-in source of truth. Do not reconstruct the runtime from an older repository, version-numbered source folder, or historical patch chain.

Foreground capture has one pipeline rooted in `src/injection.js`, with `foreground-contract.js`, `foreground-context.js`, and `foreground-budget.js` as focused components. Do not restore an `injection-core.js` plus append-only facade or a second dossier-selection path: fixed instructions, NPC selection, compaction, total budgeting, cache keys, and diagnostics must describe the one prompt actually injected.

The deterministic scan/application implementation remains in `scanner-core.js`; `scanner.js` adds current model-led semantic response handling without duplicating persistence, relationship, lifecycle, or branch mechanics.

## Version boundaries

Versions serve different compatibility purposes:

- Release version: `0.5.7` in `manifest.json` and `NPC_STATE_VERSION`.
- Persisted state schema: `1`. Prompt/behavior changes that remain load-compatible do not require a data-schema bump.
- Settings schema: `1` (unchanged). No new settings keys are required for 0.5.7.
- Model semantic update contract: `2` in `src/model/semantic-updates.js`.
- Foreground embedded-capture contract: `3` in `src/foreground-contract.js`.

Do not rename existing storage keys, sidecar identity, or supported import formats as part of prompt cleanup.

## Foreground architecture

`buildForegroundInjection()` performs, in order:

1. capture/continuity/branch-safety gating;
2. one salience selection bounded by `injectLimit`;
3. one fixed foreground contract;
4. compact complete dossier JSON with stable collection/form refs;
5. whole-entry history selection;
6. enforcement of the total budget, with the remaining allowance assigned to dynamic context;
7. local diagnostics and content-aware prompt caching.

The existing `injectBudgetTokens` key is the complete foreground extension-prompt budget in 0.5.7. Its stored key/default remain compatible (`1800`), while the builder enforces an effective minimum of `1600` estimated tokens so the fixed contract is never silently emitted above a claimed smaller cap. If the fixed contract grows later, diagnostics report the actual floor.

Token counts are explicitly estimates. The foreground send path must not add a remote tokenizer request or an expensive repeated tokenization pass. If SillyTavern later exposes a stable synchronous compatible tokenizer through the extension API, it may replace the estimator behind the same diagnostics contract.

Compaction must preserve valid serialization. Prefer fewer complete entries, shorter bounded scalar summaries, and progressively smaller complete dossier shapes. Never slice serialized JSON or schema instructions into invalid fragments. Stable `semanticEntryRef()` identifiers must survive whenever an existing collection/form item is included.

## Semantic architecture

Existing-dossier durable changes use `semanticUpdates`:

- `establish`: populate a genuinely unestablished field;
- `refine`: add compatible precision while the existing characterization remains true;
- `replace`: correct an outdated value or represent genuine development/change;
- `remove`: explicitly retire obsolete/abandoned information.

The model judges narrative meaning. Backend validation owns permitted fields/targets, source windows, manual locks, exact collection refs, deterministic normalization, replay/idempotence, relationship mechanics, lifecycle safety, persistence, and branch ownership. Do not add English keyword lists or arbitrary repeat-count gates as semantic authority.

Manual `Scan current cast` may enable `relationshipSummaryRepair`. That mode may fill only a blank `relationshipSummary` using bounded stored relationship state, milestones, accepted evidence, and recent relationship history. Keep it independent from `applyRelationship`: replay-protected rescans must be able to repair Current Dynamic without changing meters, fractional progress, milestones, evidence history, or last-change history. Do not enable the extra repair-history prompt context for normal automatic scans or foreground capture.

Treat `relationshipSummary` as a descriptive projection, not as a side effect of score mutation. Exchange-active scans may update it from a grounded current relationship proposal even when numeric movement is duplicate/replay-protected, capped, gated, or absorbed by inertia. This projection must still pass relationship-depth/milestone wording safety and must not change on `impact:none` or ungrounded turns. Targeted Refresh may opt into explicit summary reconciliation from its bounded supplied history while keeping `applyRelationship:false`.

Temporary state, newly revealed enduring traits, genuine development, correction, and form-specific traits remain distinct. Omission preserves state. Empty arrays are not destructive authorization.

`src/model/legacy-semantic-adapter.js` remains for older structured scan response shapes. It translates already-structured legacy proposals into model-contract v2 for scan/recovery compatibility; it is not part of the foreground prompt contract.

## Routing and nonblocking generation

Foreground capture stays on SillyTavern's normal main roleplay request via the extension prompt. It must never enqueue a separate scan before dispatching normal roleplay.

Separate scan/Refresh/recovery/historical/completeness requests use `generateJson()` and may route through the configured Connection Profile. The profile request service must not mutate the user's active main connection or silently fall back after a profile error/change.

`MESSAGE_RECEIVED` starts completion processing with `void processCompletedAssistantResponse(...)`; do not make the event callback await background scan completion. Completeness is optional and runs only after embedded processing of the completed assistant message. Engine fingerprint, swipe, chat-key, operation-epoch, and completeness-epoch guards reject stale results before persistence.

The shared quiet-generation queue serializes hidden extension generations only. Do not place main foreground roleplay on that queue. Remove serialization only when a demonstrated race is understood; do not trade latency for cross-extension/profile corruption.

## Diagnostics

Diagnostics remain opt-in through the existing `NPCState.debugStatus()` API and local. They may record prompt character/estimated-token sizes, selected NPCs, budgets, construction time, cache hits, configured scan route identifiers, engine/completeness background status, and cache state. Never log credentials, provider secrets, full prompts, or per-token events.

Only report lifecycle phases backed by real hooks. At 0.5.7 NPC State does not have reliable cross-provider hooks for browser dispatch, first provider data, or first visible paint, so those phases are explicitly unavailable. Do not attribute unmeasured delay to SillyTavern, a proxy, a provider, or model reasoning.

## Context and history safety

Full scan/recovery/Refresh may use their bounded supplied history window but never future messages during historical reconstruction. Foreground embedded semantic sources use `messageId:null` because the assistant response is not committed while generation is in progress; application validates exact excerpts against the committed current exchange.

Completeness is supplemental. It must not replay relationship scoring, lifecycle transitions, narrative-turn advancement, aging, memories, or development evidence already committed for the response.

## SillyTavern integration

Preserve the established relative import depth to `extensions.js` and `script.js`; `scripts/validate.mjs` checks these paths. Listener registration must remain idempotent. Do not add polling loops or global observers when existing lifecycle hooks suffice.

## Verification

Run from a clean checkout:

```sh
npm run validate
npm test
npm run package
```

CI runs the same sequence on Node 22 and uploads the release ZIP.

Before release, review:

- manifest/bootstrap/release/schema/contract/settings version separation;
- foreground one-contract invariant and absence of obsolete foreground builder;
- injection limit and total budget enforcement;
- compact JSON and semantic entry/source refs;
- model-led profile evolution and manual locks;
- main/alternate route separation and nonblocking `MESSAGE_RECEIVED` handling;
- completeness/stale-operation guards;
- branch preserve/rollback behavior;
- package contents and clean-checkout CI.

Synthetic prompt-size fixtures and local construction timings are useful regression measurements, not end-to-end latency measurements. Report them separately from any live provider/browser observation.
