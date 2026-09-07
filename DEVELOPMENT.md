# Development

## Authoritative source

`src/` is the checked-in source of truth. Do not reconstruct the runtime from an older repository, version-numbered source folder, or historical patch chain.

Foreground capture has one pipeline rooted in `src/injection.js`, with `foreground-contract.js`, `foreground-context.js`, and `foreground-budget.js` as focused components. Do not restore an `injection-core.js` plus append-only facade or a second dossier-selection path: fixed instructions, NPC selection, compaction, total budgeting, cache keys, and diagnostics must describe the one prompt actually injected.

The public `scanner.js` API coordinates response adaptation and application once. `scan-prompts.js` builds scan/Refresh/import/completeness prompts; `scan-application.js` owns identity/admission, bootstrap, activity and graph reconciliation; `scan-relationships.js`, `scan-lifecycle.js`, and `scan-payload.js` own their named responsibilities. Shared evidence/identity helpers live in `scan-helpers.js`. No module rebuilds an older prompt and replaces its release label.

## Version boundaries

Versions serve different compatibility purposes:

- Release version: `0.6.1` in `manifest.json` and `NPC_STATE_VERSION`.
- Persisted state schema: `1`. Prompt/behavior changes that remain load-compatible do not require a data-schema bump.
- Settings schema: `1` (unchanged). No new settings keys are required for 0.6.0.
- Model semantic update contract: `3` in `src/model/semantic-updates.js`.
- Foreground embedded-capture contract: `4` in `src/foreground-contract.js`.

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

The existing `injectBudgetTokens` key is the complete foreground extension-prompt budget in 0.6.0. Its stored key/default remain compatible (`1800`), while settings normalization, UI controls, and the builder share a minimum of `1600` estimated tokens so the fixed contract is never silently emitted above a claimed smaller cap. If the fixed contract grows later, diagnostics report the actual floor.

Token counts are explicitly estimates. The foreground send path must not add a remote tokenizer request or an expensive repeated tokenization pass. If SillyTavern later exposes a stable synchronous compatible tokenizer through the extension API, it may replace the estimator behind the same diagnostics contract.

Compaction must preserve valid serialization. Prefer fewer complete entries, shorter bounded scalar summaries, and progressively smaller complete dossier shapes. Never slice serialized JSON or schema instructions into invalid fragments. Stable `semanticEntryRef()` identifiers must survive whenever an existing collection/form item is included.

## Semantic architecture

`src/model/dossier-fields.js` is the canonical ordinary-dossier field registry. Existing-dossier ordinary mutations have exactly one runtime path: response compatibility is normalized at the boundary, `prepareModelLedPayload()` removes parallel direct/legacy fields, and `applyModelLedSemanticUpdates()` validates/applies the resulting semantic operations once. Do not add a second profile/canon/live application path. Identity/admission, player-relationship mechanics, lifecycle, activity/presence, and graph reconciliation remain deliberately separate because they have different deterministic safety invariants.

Existing-dossier ordinary changes use one `semanticUpdates` pipeline. `scan-application.js` has no parallel profile/canon/age/form decision engine; it keeps deterministic identity/admission, one-time new-NPC bootstrap, relationship/lifecycle/family safety, presence, and persistence mechanics.

Structured evidence authority is field-scoped in the semantic validator: World_State may support live `location`/`status`; NPC_Inner_Chatter may support private `mood`/`goal`; neither may rewrite durable canon/profile/memory/key relationships/current form.

Foreground invariant: every selected existing dossier retains the four first-pass comparison values `mood`, `location`, `goal`, and `status` even at minimum compaction. Listing the `live` evaluation group means those supplied values were checked against the completed response. Compatibility direct live values may only be normalized at the response boundary from field-scoped grounded evidence; they never become a second write path.

Existing-dossier durable changes use `semanticUpdates`:

- `establish`: populate a genuinely unestablished field;
- `refine`: add compatible precision while the existing characterization remains true;
- `replace`: correct an outdated value or represent genuine development/change;
- `remove`: explicitly retire obsolete/abandoned information.

The model judges narrative meaning. Backend validation owns permitted fields/targets, source windows, manual locks, exact collection refs, deterministic normalization, replay/idempotence, relationship mechanics, lifecycle safety, persistence, and branch ownership. Do not add English keyword lists or arbitrary repeat-count gates as semantic authority.

Manual `Scan current cast` may enable `relationshipSummaryRepair`. That mode may fill only a blank `relationshipSummary` using bounded stored relationship state, milestones, accepted evidence, and recent relationship history. Keep it independent from `applyRelationship`: replay-protected rescans must be able to repair Current Dynamic without changing meters, fractional progress, milestones, evidence history, or last-change history. Do not enable the extra repair-history prompt context for normal automatic scans or foreground capture.

Treat `relationshipSummary` as a descriptive projection, not as a side effect of score mutation. Exchange-active scans may update it from a grounded current relationship proposal even when numeric movement is duplicate/replay-protected, capped, gated, or absorbed by inertia. This projection must still pass relationship-depth/milestone wording safety and must not change on `impact:none` or ungrounded turns. Targeted Refresh may opt into explicit summary reconciliation from its bounded supplied history while keeping `applyRelationship:false`.

Full Scan must not serialize or ask the model to reconcile stored `relationshipSummary` for the entire NPC roster. Scope stored Current Dynamic context to NPCs already present or explicitly referenced in the current exchange; keep the remaining roster intact for other continuity duties. Manual current-cast repair and targeted Refresh are explicit exceptions because they deliberately target relationship-summary reconciliation.

Temporary state, newly revealed enduring traits, genuine development, correction, and form-specific traits remain distinct. Omission preserves state. Empty arrays are not destructive authorization.

`src/model/legacy-semantic-adapter.js` remains for older structured scan response shapes. It translates already-structured legacy proposals into model-contract v3 for scan/recovery compatibility; it is not part of the foreground prompt contract.

## Routing and nonblocking generation

Foreground capture stays on SillyTavern's normal main roleplay request via the extension prompt. It must never enqueue a separate scan before dispatching normal roleplay.

Separate scan/Refresh/recovery/historical/completeness requests use `generateJson()` and may route through the configured Connection Profile. The profile request service must not mutate the user's active main connection or silently fall back after a profile error/change.

`MESSAGE_RECEIVED` starts completion processing with `void processCompletedAssistantResponse(...)`; do not make the event callback await background scan completion. Completeness is optional and runs only after embedded processing of the completed assistant message. Engine fingerprint, swipe, chat-key, operation-epoch, and completeness-epoch guards reject stale results before persistence.

The shared quiet-generation queue serializes hidden extension generations only. Do not place main foreground roleplay on that queue. Remove serialization only when a demonstrated race is understood; do not trade latency for cross-extension/profile corruption.

## Diagnostics

Diagnostics remain opt-in through the existing `NPCState.debugStatus()` API and local. They may record prompt character/estimated-token sizes, selected NPCs, budgets, construction time, cache hits, configured scan route identifiers, engine/completeness background status, and cache state. Never log credentials, provider secrets, full prompts, or per-token events.

Only report lifecycle phases backed by real hooks. At 0.6.0 NPC State does not have reliable cross-provider hooks for browser dispatch, first provider data, or first visible paint, so those phases are explicitly unavailable. Do not attribute unmeasured delay to SillyTavern, a proxy, a provider, or model reasoning.

## Context and history safety

Message deletion passes `rollbackDiscardedRelationships:true` through branch reconciliation. A matching checkpoint still restores the full timeline. When none matches, reuse `rollbackRebasedRelationship()` to retire known discarded relationship events while retaining `rebase-required`; do not invent scores beyond bounded ledger coverage or treat partial relationship rollback as full dossier recovery. General branch reconciliation retains the user's explicit preserve/rollback choice. A missing deletion target must resolve to the latest surviving assistant, never `Number(null)` (message zero), to avoid redundant recovery scans.

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

## Shared settings, rules, and release contents

`settings.js` is the authoritative settings entrypoint. `settings-contract.js` owns numeric defaults/bounds/UI attributes without browser or schema dependencies. Domain normalizers remain in the schema and portrait modules and are called by the settings entrypoint. `settings-migrations.js` contains only compatibility transforms; exact historical shipped criteria may migrate, but custom user criteria and unknown settings survive. Keep the `npc_state_beta.v3` namespace and pointer object identity.

`relationship-rules.js` supplies scoring caps, axis limits, milestones, and inertia. Generate numeric model instructions from those values. `model/dossier-fields.js` owns field kind/durability/group and structured-evidence context permissions. Release version lives in `schema.js` and must match the manifest; persisted schema and model contracts remain independently versioned.

`runtime-files.mjs` traces manifest JS/CSS, static imports/reexports, literal dynamic imports, URL assets, and CSS dependencies. Validation rejects missing dependencies and unused source files. Keep runtime imports literal; new host imports need explicit review in that script. Release packaging uses that dependency set plus manifest, LICENSE, and README; development/history documents and tests are repository-only. ZIP compression is deterministic DEFLATE with fixed timestamps and UTF-8 names.

See `docs/cleanup-v0.6.0.md` for the deletion inventory, size comparison, and verification scope. The package-install tests use a local SillyTavern host-API stub; they do not replace a live SillyTavern/provider smoke test.
