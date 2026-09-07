# Changelog

## 0.5.10

### Single dossier semantic pipeline

- Added one canonical ordinary-dossier field registry in `src/model/dossier-fields.js`; semantic and foreground contracts now derive from the same field list/group metadata.
- Existing-dossier ordinary fields now mutate through `semanticUpdates` exactly once. Legacy profile/canon/age/form/key-relationship response shapes are boundary-only compatibility inputs and are stripped before deterministic core application.
- Added `currentForm` to the live semantic field set so one-pass/Scan/Refresh no longer depend on a separate direct-field path for physical-form state.
- Bumped model semantic contract to `3` and foreground embedded-capture contract to `4`; persisted state schema/settings schema remain `1`.

### Scan completeness and evidence alignment

- Full Scan now appends a compact semantic edit index with collection/form refs and manual locks instead of duplicating the full dossier roster in a second semantic serialization.
- Full Scan, completeness and historical recovery validate semantic evidence against the same bounded history window supplied to the model, fixing valid older-window updates being rejected as out-of-scope.
- Added `evaluatedGroups` coverage reporting for deliberate Scan/Refresh/recovery so a missing NPC patch or omitted canon/profile/live/memory/NPC-relationship evaluation group is observable instead of looking like a successful no-op.
- Scan/Refresh callers now receive semantic and coverage diagnostics; foreground embedded capture remains budget-bounded and does not require full-dossier coverage.
- Removed the superseded scanner-core profile/canon/age/form decision engine for existing dossiers; core now owns only identity plus one-time new-NPC bootstrap before canonical semantic application.
- Structured evidence is field-scoped inside that same semantic validator: World_State may support Location/Status and NPC_Inner_Chatter may support Mood/Goal, without granting either source durable profile/canon authority.

### Compatibility

- Storage keys, persisted state schema `1`, settings schema `1`, relationship scoring/replay/milestones, Current Dynamic safeguards, lifecycle transitions, branch/recovery behavior, alternate scan routing, and new-NPC bootstrap remain compatible. No dossier rebuild is required.

## 0.5.8

### Scan prompt scaling

- Full Scan now serializes stored `relationshipSummary` only for NPCs who are already present or explicitly referenced in the current exchange, instead of attaching Current Dynamic prose to every stored dossier.
- Existing dossier rows that are outside that scope remain in the continuity roster but omit `relationshipSummary`, and the prompt explicitly tells the model not to perform Current Dynamic reconciliation for those rows.
- Targeted Refresh and explicit `Scan current cast` Current Dynamic repair retain their full relationship-summary context.
- Added large-roster regression coverage proving that Current Dynamic payload count follows relevant NPC count rather than total cast size while the full continuity roster remains available.

### Compatibility

- Persisted state schema remains `1`; settings schema remains `1`; model semantic contract remains `2`; foreground contract remains `3`. No migration or dossier rebuild is required.

## 0.5.7

### Current Dynamic evolution

- Decoupled `relationshipSummary` persistence from actual numeric Trust/Affection/Desire/Tension movement. A grounded current-exchange relationship proposal can now update Current Dynamic even when replay protection, caps, gates, or inertia suppress score movement.
- Regular Full Scan and targeted Refresh prompts now receive the stored Current Dynamic so the model can evolve it instead of rewriting blind.
- Replay-protected embedded processing may still update the descriptive Current Dynamic while leaving all relationship meters, fractional progress, milestones, evidence history, and last-change history untouched.
- `impact:none` / ungrounded turns cannot stylistically rewrite an existing Current Dynamic.
- Targeted Refresh may explicitly reconcile a missing or materially stale Current Dynamic from its supplied chat history without changing relationship scores.

### Compatibility

- Persisted state schema remains `1`; settings schema remains `1`; model semantic contract remains `2`; foreground contract remains `3`. No migration or dossier rebuild is required.

## 0.5.6

### Current Dynamic repair

- `Scan current cast` can now reconstruct a missing/normalized-away `relationshipSummary` (Current Dynamic) from the NPC's already accepted relationship meters, fractional progress, unlocked milestones, accepted relationship evidence, and recent relationship history.
- Summary repair is independent from relationship scoring and replay protection: rescanning an already processed exchange can fill Current Dynamic while leaving Trust/Affection/Desire/Tension, fractional progress, milestones, evidence history, visible relationship history, and last-change data unchanged.
- Repair is intentionally conservative: it only fills a blank Current Dynamic, never rephrases an existing real summary, requires established relationship state/history, and still passes the existing relationship-depth/milestone wording safety checks.
- The extra relationship repair context is included only for explicit manual current-cast reconciliation; normal automatic/foreground paths do not inherit the added history context.

### Compatibility

- Persisted state schema remains `1`; settings schema remains `1`; model semantic contract remains `2`; foreground contract remains `3`. No migration or dossier rebuild is required.

## 0.5.5

### Player-relationship summary safety

- Removed the instructional `NPC relationship with PLAYER only` value from Full Scan and targeted Refresh output examples; `relationshipSummary` now uses an empty schema value plus explicit natural-language guidance.
- Added backend normalization that rejects known relationship-summary schema placeholders before they can overwrite a real NPC-to-player dynamic during an accepted relationship change.
- Existing dossiers already polluted with the old placeholder self-repair to an empty relationship summary on normalization/reload instead of preserving the template text.
- Added regression coverage proving placeholder cleanup, prompt hygiene, preservation of an existing real summary, and continued application of grounded natural-language relationship summaries.

### Compatibility

- Persisted state schema remains `1`; settings schema remains `1`; model semantic contract remains `2`; foreground contract remains `3`. No migration or dossier rebuild is required.

## 0.5.4

### One-pass live-state semantics

- Foreground embedded capture now treats `mood`, `location`, `goal`, and `status` as first-class model-led semantic scalars for existing dossiers.
- Current-state values can be established, refined, replaced, or explicitly removed when the current exchange proves an old value ended without a replacement, preventing completed goals and obsolete locations/statuses from lingering until a Full Scan or Refresh.
- When both a semantic live-state operation and legacy top-level current field are returned, the semantic operation is authoritative and the compatibility field is suppressed before deterministic patch application.
- Full Scan/Refresh and legacy top-level current-field patches remain compatible fallbacks; persisted state schema, settings schema, routing, lifecycle, and relationship mechanics are unchanged.

### Contract versions

- Model semantic update contract: `2` (unchanged).
- Foreground embedded-capture contract: `3` (unchanged).

## 0.5.3

### Semantic update safety

- Empty collection `replace` operations no longer erase behavior, mannerisms, key relationships, or memories unless `clear:true` explicitly authorizes a whole-collection clear.
- Semantic-operation deduplication now includes normalized targeted `changes`, refs/expected targets, scope, clear intent, age/durability metadata, and grounded sources so distinct same-evidence edits are not discarded.

### Foreground priority and freshness

- Foreground budgeting now reserves the smallest complete dossiers in strict salience order before enriching them, so lower-priority NPCs cannot displace higher-priority NPCs under a tight total budget.
- `MESSAGE_SENT` now refreshes the lightweight extension injection after invalidating pending work, allowing NPCs named in the just-sent user message to affect selection for that response.
- The engine hot-path projection now preserves manual profile locks and recent profile-evolution evidence that the foreground compactor already consumes.

### Compatibility

- Persisted dossier schema, settings schema, model semantic contract, foreground contract, storage identity, routing behavior, and relationship mechanics remain unchanged.

## 0.5.2

### Foreground prompt consolidation

- Replaced the layered legacy foreground builder plus appended semantic contract with one authoritative foreground pipeline rooted in `src/injection.js` with focused contract/context/budget modules; removed obsolete `src/injection-core.js`.
- Unified dossier selection for all foreground context under `injectLimit`; removed the independent 12-NPC semantic selection and duplicate full dossier serialization.
- Kept model-led `semanticUpdates` for personality, behavioral profile, speech, mannerisms, canon, age, forms, and targeted collections, including stable entry/source references and manual-lock enforcement.
- Bounded memories, relationships, forms, and new-NPC history with complete compact entries instead of slicing serialized JSON.

### Budgets and diagnostics

- Changed the existing generic `injectBudgetTokens` setting from a content-only allowance to the **total foreground injection budget**. Its key and default (`1800`) are unchanged; no settings migration is required.
- The total budget now covers fixed instructions plus dynamic context. Effective minimum is `1600` estimated tokens; older saved values below it are explicitly reported and raised rather than silently exceeded.
- Added a local conservative token estimate and content-aware prompt cache; no tokenizer/network request is added to the send path.
- Expanded the existing opt-in `NPCState.debugStatus()` diagnostics with instruction/context/total size, selected NPC count, configured/effective budget, construction time, cache status, configured background scan route, and explicit unavailable request-dispatch/first-data/first-visible phases.

### Routing and regression coverage

- Preserved main-connection foreground roleplay, alternate-profile separate scans, optional post-response completeness, nonblocking `MESSAGE_RECEIVED` completion processing, and stale-result rejection.
- Added focused behavioral coverage for one-contract output, selection limits, small/large/oversized budgets, below-minimum handling, valid compact refs, capture/continuity setting combinations, persisted profile evolution, locks/temporary states, pending completeness, alternate routing, and prompt-cache invalidation.
- Settings schema remains `1`; no new settings keys are required. Persisted dossier schema remains `1`; model semantic contract remains `2`.

### Synthetic prompt-size measurement

Using the same local fixtures before/after, `injectLimit=2`, total injection budget `1800`:

| Fixture | 0.5.1 layered chars | 0.5.2 chars | Reduction | 0.5.2 split / estimate |
| --- | ---: | ---: | ---: | --- |
| Two ordinary NPCs | 42,209 | 5,837 | 86.2% | 3,519 instruction + 2,318 context; ~1,668 estimated tokens; 2 selected |
| Twelve available, limit two | 60,234 | 5,837 | 90.3% | 3,519 instruction + 2,318 context; ~1,668 estimated tokens; 2 selected |
| Twelve large dossiers, limit two | 386,446 | 5,964 | 98.5% | 3,519 instruction + 2,445 context; ~1,713 estimated tokens; 2 selected |

These are synthetic character counts and a local conservative token estimate, not measured user prompt/tokenizer totals. Local construction stayed in the single-digit-millisecond range in these fixtures, so this change does not by itself prove an end-to-end latency improvement.

## 0.5.1

### Release label consistency

- Fixed the extension settings header, settings intro, roster summary, and UI error prefix still displaying `0.4.44` after the 0.5.0 release.
- Made those UI surfaces derive their version from the shared `NPC_STATE_VERSION` release constant.
- Made scanner and foreground injection facade release-label replacement use the same shared constant instead of hardcoded `0.5.0` text.
- Added regression coverage that rejects a reintroduced `0.4.44` literal in the authoritative settings UI and guards facade version replacement from drifting again.
- Persisted schema remains version `1`; model-output contract remains version `2`.

## 0.5.0

### Consolidated source and build

- Made checked-in `src/` the authoritative runtime source.
- Removed the active `v03/` runtime directory and `beta/` patch-replay build chain.
- Replaced the self-mutating seed workflow with clean-checkout validation, regression testing, packaging, and artifact upload.
- Kept SillyTavern nested import paths, storage identity, sidecar ownership, and public runtime interfaces compatible.
- Added dependency-free validation and ZIP packaging scripts.

### Model-led dossier reconciliation

- Added model-output contract v2 with explicit `establish`, `refine`, `replace`, and `remove` semantic operations.
- Included current personality and speech alongside behavior, mannerisms, canon, forms, status, and compact provenance in reconciliation context.
- Enabled Scan and Refresh to repair temporary sleeping/post-emergence placeholders without requiring a reset or dossier rebuild.
- Kept one-off reactions and temporary states from automatically becoming durable traits.
- Preserved form-specific habits unless evidence explicitly changes/removes them.
- Added targeted collection operations with stable entry references or exact expected values; replacements run before additions so full collections can still evolve.
- Made omission/no-change preservative and required explicit removal/clear authorization for destructive changes.
- Added concise semantic diagnostics for applied, no-change, manually protected, invalid source/structure, and duplicate operations.

### Reduced brittle semantic gates

- Moved durable role/species/background/appearance interpretation into the model-led semantic contract while retaining deterministic validation and manual locks.
- Moved chronological-age event classification to the model contract without mandatory English birthday/correction/elapsed-time cue phrases.
- Kept actual age separate from apparent age and retained deterministic numeric/unit normalization and calendar safety.
- Allowed grounded species-specific maturation, rejuvenation, and unusual fantasy development without relying on arbitrary minimum intervals or growth ceilings in the new contract.
- Made named-preferred admission use the model's structured identity kind rather than English role-label modifier heuristics.
- Added model-led directional/custom kinship handling while retaining identity checks, deduplication, and reciprocal application only when supplied/grounded.
- Added a compatibility adapter that maps older structured profile/canon/age/form proposals into the v2 semantic path so legacy output shapes do not reactivate English phrase gates.

### Preserved deterministic protections

- Preserved relationship caps, milestone gates, inertia, fractional progress, evidence replay protection, and preserve/rollback rebase modes.
- Preserved model-led life-state interpretation plus grounded backend death/return validation and archive/presence consistency.
- Preserved stale-operation guards for chat changes, swipes, edits, branch changes, completeness races, and manual mutation races.
- Preserved alternate NPC connection routing and the main roleplay connection/output path.
- Preserved optional completeness mode as supplemental, non-relationship-scoring reconciliation.

### Tests and compatibility

- Added deterministic fixtures for frozen profile repair, refinement/replacement/removal, insufficient evidence, manual locks, non-English updates, form scoping, full-collection replacement, age/apparent-age separation, fantasy maturation, admission, kinship, retry idempotence, and relationship non-replay.
- Added schema reload/storage identity, bounded historical context, foreground embedded behavior, branch preserve/rollback, completeness/stale guards, and connection-routing regressions.
- Persisted schema remains version `1`; extension release is `0.5.0`; model-output contract is version `2`.

## Earlier 0.4.x history

The complete pre-consolidation changelog is retained at `docs/history/CHANGELOG-v0.4.x.md` and in Git history.
