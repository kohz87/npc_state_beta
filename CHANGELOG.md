# Changelog

## 0.7.9

- Reject malformed `appearanceForms` selectors before semantic dedupe/normalization. `scope.form`, `targetForm`, `expected`, and `ref` must be textual when supplied; valid string selectors and documented `{name,appearance}` form values remain supported.
- Tighten collection-object validation so every recognized text property consumed by normalization must actually be a string. A valid sibling property can no longer hide malformed nested `keyRelationships`, memories, mannerisms, or behavioral-profile values; defensive normalization also stops object/array text coercion for recognized object aliases.
- Harden manual relationship scores at the shared manual-ownership boundary. Finite numbers and nonempty finite numeric strings remain compatible; nulls, booleans, arrays, objects, empty strings, and nonfinite values are rejected before persistence or correction-history creation. Persisted manual overrides use the same rule.
- Post-fix input/lifecycle reviews extend that same numeric boundary to manual `importance` and persisted per-axis relationship-correction values, preventing coercive legacy values from becoming durable user ownership during rollback.
- Five post-fix review cycles covered input boundaries, state lifecycle, asynchronous ownership, model/user-visible contracts, and integration/leanness. Ownership and contract cycles were clean; the final leanness pass removed the now-unused `supportedCollectionObject()` wrapper after verifying no callers or package references.
- Preserve semantic/model contract 5, foreground contract 6, storage identity `npc_state_beta.v3`, persisted/settings schema 1, first-pass behavior, fallback ownership, relationship mechanics, rollback/recovery, optional completeness, and alternate routing. No database rebuild or storage migration is required.

## 0.7.8

- Final compatibility review sanitizes malformed legacy `manualOverrides` during state normalization using the same owned-field value rules as current manual writes. Invalid old override values are dropped before rollback can replay them as JavaScript object text; valid manual overrides remain authoritative.
- Round 6 manual-ownership review closed a latent rollback path: malformed values inside explicit `manualOverrides` are now validated before storage, so a later full-state rollback cannot reapply an object value and turn it into `[object Object]`. Empty override clearing, legacy relationship-override compatibility, portrait objects, and existing user-owned rollback semantics remain supported.

- Independent public-API review applies the same fail-closed value-shape policy to manual `NPCState.updateNpc()` and `addNpc()` entry points. Malformed ordinary/manual scalar values or non-string manual identities are rejected before normalization, preserving valid stored data and manual diagnostics while numeric age/relationship compatibility and supported collection objects remain accepted.

- A later independent value-boundary review extended the same no-coercion rule to focused social/family/lifecycle proposals and relationship metadata. Object-valued graph/lifecycle scalars or family members are rejected once at the scanner coordination boundary, malformed Current Dynamic is rejected, and non-string relationship reason/evidence metadata can no longer enter durable relationship history as JavaScript object text. Valid sibling graph proposals and evidence-grounded numeric relationship movement remain independent.

- Independent contract/validation review fixed two adjacent coercion/accounting holes: named-preferred role compatibility now preserves the raw proposal until registry validation (so invalid roles cannot become `[object Object]` or be counted twice), and legacy direct-live/form adapters validate raw shapes before compaction. Refresh and structured import share the same canonical semantic validator.

- Bind optional malformed/missing-capture fallback scans to the originating capture attempt and canonical source history. A newer capture now invalidates queued/in-flight fallback work before it can consume the newer first-pass boundary; the existing guarded commit path still blocks saved-but-unowned writes. Manual Scan keeps its established non-capture-bound ownership policy.
- Validate ordinary dossier input shapes before bootstrap or semantic coercion. Scalar fields reject objects/arrays/booleans instead of storing JavaScript string artifacts, while numeric chronological/apparent ages remain compatible. Invalid values are field-level rejections with concrete bounded diagnostics and do not overwrite valid stored values.
- Centralize field-shape rules under the dossier registry and preserve supported collection/form compatibility. Mixed invalid collection values reject the affected field atomically; supported object-shaped collection entries continue through existing normalization rather than becoming `[object Object]`.
- Preserve the v0.7.7 output envelope, identity handoff, neutral zero-delta Current Dynamic, random birthday fill, relationship mechanics/replay protection, branch rollback/recovery, optional completeness, alternate routing, storage identity, and persisted/settings schema 1. Model contract remains 5 and foreground contract remains 6.

## 0.7.7

- Replaced separate output templates with one compact response envelope and parser-tested new/existing NPC examples shared by foreground, Scan, Refresh, and recovery. Corrected the structured-import example and kept the v1 transport tag independent of contract versions.
- Reject incompatible schema drift and conflicting presence aliases before application. Report missing arrays, invalid structure, syntax errors, duplicate blocks, and truncation precisely; do not salvage arbitrary brace substrings or map foreign relationship axes.
- Bind capture diagnostics and completion deduplication to individual attempts, complete source history, chat, and swipe. Guard delayed transport cleanup against replacement content and chat switches, and capture first-pass ownership before asynchronous hydration.
- Independent review closed same-narrative capture supersession during saves and the first-pass-to-completeness history gap. Duplicate host events preserve malformed-tag diagnostics; known legacy identity spelling normalization and sparse swipe metadata remain compatible.
- Missing or rejected captures leave NPC sidecar state unchanged and generate no fallback request unless explicitly enabled. Failure metadata remains bounded without storing failed raw output.
- Reserve selected dossier context before optional rubrics; fix zero-entry profile-evidence compaction. Preserve prior completeness, identity handoff, relationship mechanics, birthday filling, correction/rollback/recovery, storage identity, and schemas.

## 0.7.6

- Consolidated first-pass and Scan extraction requirements around the shared dossier registry, including same-generation completeness review and compact foreground unavailable/partial context markers.
- Added optional compact per-field evaluation metadata so explicit unchanged, insufficient evidence, unavailable context, runtime rejection, accepted application, and genuine omission remain distinguishable without full dossier echoes.
- Decoupled grounded Current Dynamic evidence from numeric relationship movement, allowing neutral professional/other descriptive relationship summaries at zero scores and zero deltas without fabricating score history.
- Accounted for direct new-dossier bootstrap and Current Dynamic decisions in the bounded operation ledger, and added on-demand active message/swipe capture inspection/copy APIs over already-retained metadata.
- Preserved identity handoff, rollback/correction remediation, replay protection, random birthday fill, storage identity, persisted schema 1, settings schema 1, and optional completeness behavior.

## 0.7.5

- Carries the deterministic identity/admission decision through first-pass semantic application, role restoration, and coverage diagnostics. A newly admitted patch with an unexpected model transport id now targets the locally allocated stable dossier id, while a rejected id/name conflict cannot mutate either candidate through downstream ordinary fields.
- Makes identity failure observable instead of silent: bounded diagnostics now distinguish identity rejection/unresolved binding, validation rejection, applied updates, explicit evaluated-unchanged groups, no field proposal, and incomplete or absent dossier coverage.
- Shares one compact identity/bootstrap instruction between foreground capture and Scan: existing dossiers use stable ids, new dossiers leave id empty and use canonical names in activity references, grounded current-exchange facts should be captured, unsupported facts remain Unknown, and existing name-only dossiers are enriched rather than duplicated. Mandatory foreground rules remain present under budget compaction.
- Consolidates new-NPC admission to one authoritative pass by removing the duplicate create-on-reference fallback. Persisted state/settings schema remain 1; semantic contract remains 3; foreground contract remains 4. No NPC database rebuild is required.

## 0.7.4

- Preserves surviving story movement across the legacy-to-modern relationship correction transition. Migrated legacy axes carry a compact provenance identity, so a valid pre-migration checkpoint that already contains the same correction keeps later story gains; checkpoints before the correction still receive its absolute target, and a genuinely newer same-axis edit still supersedes it.
- Makes legacy correction uncertainty durable per axis instead of re-deriving it from bounded display history. Current-format confirmation events are excluded from legacy evidence, partial confirmation survives reload/history trimming, and confirming an unchanged value still resolves that explicitly selected axis.
- Completing all unresolved axes now retains the confirmed modern corrections, retires obsolete legacy whole-relationship metadata, and immediately revalidates the verified rollback boundary. Other NPC uncertainty and surviving suffix recovery remain blocked until independently resolved; explicit clear-all correction ownership remains a separate action.
- Persistence conflicts and in-flight history changes remain fail-safe through the existing guarded user commit path. Persisted state/settings schema remain 1; semantic contract remains 3; foreground contract remains 4. No NPC database rebuild is required.

## 0.7.3

- Migrates supported legacy relationship correction axes into the compact per-axis correction representation before a new manual relationship edit can overwrite the legacy evidence that proves them. Modern and still-supported legacy ownership are preserved independently during rollback, so editing Affection cannot silently discard an older Trust correction.
- New relationship edits no longer create whole-relationship manual overrides. Whole-object relationship overrides remain bounded legacy compatibility input only; ambiguous residual legacy axes are reported as unresolved instead of being treated as fully migrated.
- Adds a narrowly scoped remediation path for `manual-relationship-correction-uncertain`: the editor/API can confirm one relationship axis at a time or explicitly clear that NPC relationship correction ownership while unrelated mutations and automatic story updates remain blocked. Remediation does not create a narrative checkpoint and immediately revalidates the verified rollback boundary. The warning routes to the dossier flow rather than offering generic timeline acceptance, and remediation persistence failures return a structured blocked result.
- Resolving one NPC/axis does not approve others. If correction uncertainty is gone but surviving history still needs reconstruction, the state transitions to the existing suffix-recovery requirement. Persistence conflicts/history changes remain blocked and reload-safe.
- Persisted state/settings schema remain 1; semantic contract remains 3; foreground contract remains 4. No NPC database rebuild is required.

## 0.7.2

- Replaced trimmed relationship-history events as manual rollback authority with a compact durable per-axis correction record. Editor relationship inputs are absolute corrections only for axes actually changed; later story movement remains free to evolve from those values, and checkpoints that already contain a correction revision retain their surviving story gains.
- Explicit override clearing now clears durable relationship correction ownership and advances its revision so stale manual display-history events cannot silently reassert ownership. Repeated rollback is idempotent and visible relationship history remains bounded by the existing setting.
- Added conservative v0.7.1 compatibility: a legacy relationship override is restored absolutely only when its surviving manual event and override metadata identify the edited axes. Missing/partial legacy axis provenance is retained as recoverable data and reported as `manual-relationship-correction-uncertain` instead of fabricated into an exact restoration.
- A recovery commit rejected after an in-flight history change now marks recovery `stale` together with `branchSafety: rebase-required`. Resume revalidates completed recovery ownership before reporting success, preventing a superseded `complete` flag from clearing the block.
- Persisted state/settings schema remain 1; semantic contract remains 3; foreground contract remains 4. No NPC database rebuild is required.

## 0.7.1

- Separated manual correction provenance from automatic-update locking. Unchanged editor submissions no longer create blanket overrides, explicit override clearing works, stable-field unlocks are effective, and older corrections do not overwrite newer story state already present in a restored checkpoint.
- Preserved relationship corrections through explicit manual relationship events instead of replaying a stale whole-relationship override over a surviving snapshot.
- Retargeted branch-base/checkpoint/rebase-backup ownership, including embedded snapshot chat keys, when a chat is renamed.
- Routed historical-recovery finalization through the shared guarded commit boundary and publish committed state only after post-save ownership validation, preventing transient stale-safe UI state.
- Classified structurally/semantically rejected dossier proposals separately from genuine no-change results, with bounded rejection reasons in operation diagnostics.
- Consolidated semantic operation names under the canonical dossier field registry. Persisted state/settings schema remain 1; semantic contract remains 3; foreground contract remains 4. No NPC database rebuild is required.

## 0.7.0

- Added `docs/core-contract.md` as the single authoritative feature/ownership/history/commit/rollback/diagnostics specification; `DEVELOPMENT.md` now delegates behavior to it instead of carrying stale competing rules.
- Extended the ordinary dossier field registry with explicit normalization, evidence, operation and manual-ownership contracts. Explicit manual overrides now block later automatic semantic rewrites just like manual locks.
- Added one shared story commit boundary for first-pass capture, Scan, completeness, Refresh, structured import, historical recovery and branch restoration. It verifies source/history ownership before and after asynchronous persistence and blocks an unowned completed write instead of reporting stale state as current.
- Added bounded runtime-only operation diagnostics with hashed history ownership, selected NPC ids, local prompt estimates, explicit proposal outcomes/reasons, persistence revisions, checkpoint/recovery details and failures. Detailed records are opt-in through `NPCState.operationDiagnostics()`.
- Consolidated the duplicated latest-assistant history helper and removed the unused engine `ensureBranchBase` import. Existing snapshot rollback, first-pass live updates, relationship mechanics, explicit rebase modes, alternate routing and sidecar CAS/locks remain authoritative.
- Persisted state/settings schema remain 1; semantic contract remains 3; foreground contract remains 4. No database rebuild is required.

## 0.6.3

- Message deletion/edit/swipe rollback now restores complete story-state snapshots selected by canonical message lineage, not partial relationship ledgers.
- The first story mutation records a trustworthy pre-update baseline; post-update checkpoints record source fingerprint and preceding lineage. Legacy baselines without this provenance remain loadable but are not fabricated into exact rollback history.
- Middle-history divergence restores the latest verified prefix and rebuilds surviving assistant exchanges in order through the existing historical recovery engine. Normal scanning remains blocked until that suffix is complete.
- Manual locks, portraits, importance, manual deletions/suppressions, explicit manual field overrides, and legacy manual relationship events are preserved as user-owned state during story rollback.
- Removed the automatic relationship-only deletion fallback and the one-latest-message branch rescan/stored-payload replay layer.
- Persistence conflicts/failures leave the reconciled timeline blocked rather than claiming success.

## 0.6.2

- Fixed normal first-pass embedded capture leaving existing NPC Mood, Location, Goal, or Status stale. The minimum selected foreground dossier now retains all four comparison values, and the foreground contract requires the model to evaluate them through the existing `semanticUpdates` channel.
- Replaced the legacy blanket `activityEvidence` live-field bridge with bounded boundary normalization: a direct compatibility value is translated only when the NPC identity and proposed value co-occur in a permitted visible or field-scoped structured evidence span. Unsupported direct proposals are preserved as no-ops with diagnostics instead of disappearing silently.
- Enabled dossier coverage diagnostics on embedded first-pass application, so an omitted NPC/live-group evaluation is distinguishable from an explicitly evaluated unchanged state. Completeness remains optional and disabled by default.
- Forwarded completed-response swipe identity into embedded application and reject a changed swipe before or during commit. Existing edit/deletion/branch stale guards remain in place.
- Added behavioral regressions covering one-pass live updates, compatibility normalization/rejection, unchanged/omitted/unknown/remove semantics, locks/provenance, structured evidence authority, relationship replay, stale edit/delete/swipe handling, persistence/reload, completeness-disabled operation, and foreground budget compaction. Tests use simulated host/storage adapters; no live SillyTavern/provider smoke test was performed.


## 0.6.1

- Fixed message deletion beyond the oldest usable checkpoint leaving known discarded relationship scores, progress, history, evidence, and reasons active. Reused the relationship rollback ledger with manual-anchor protection; incomplete timeline recovery still requires rebase/rebuild.
- Clear stale Current Dynamic when only a discarded last-change record survives in older data.
- Fixed the deletion handler treating its absent target as message zero and unnecessarily rescanning an already-restored surviving response.
- Added seven behavioral regressions covering persisted/reloaded rollback, checkpoint exhaustion, middle/all-message deletion, manual corrections, preserve rebase, the installed deletion handler, and missing older score history. Verified with local host/persistence adapters; no live SillyTavern smoke test was performed.

## 0.6.0

### Consolidation and cleanup

- Centralized settings access, numeric defaults/bounds, and settings-control validation. Existing storage namespace, sidecar pointers, custom criteria, portrait templates, and supported migrations remain intact.
- Aligned the Injection budget control with the existing 1600-token runtime floor. Preserved an explicit injection depth of zero instead of replacing it with the default.
- Centralized relationship numeric policy and generated cap/gate instructions from the values used by scoring. Preserved scoring, inertia, milestone and replay behavior.
- Moved field-scoped structured-evidence permissions into the dossier field registry.
- Replaced scanner prompt wrappers with focused prompt builders emitting one semantic contract. Removed obsolete age/form revision examples and contradictory collection replacement instructions while retaining legacy response adaptation.
- Split scanner application, relationship, lifecycle, payload, and shared helper responsibilities; extracted engine state projections.
- Removed the unused age-progression module and schema override facade. Integrated editor top-layer promotion directly into mounting and moved its layout CSS out of JavaScript.
- Removed an unused activity-scope helper and obsolete relationship-rubric alias.
- Package only reachable runtime dependencies plus manifest, LICENSE, and README. Added dependency validation and standard ZIP compression; preserve tests/tooling/history in the repository.

### Verification and compatibility

- Added regression coverage for fresh/upgraded settings and package loading, legacy age payloads, manual locks, policy consistency, short-name lifecycle binding, editor mounting, and complete compressed release contents.
- Release version is 0.6.0; persisted schema/settings schema stay 1; semantic contract stays 3 and foreground contract stays 4. No dossier rebuild is required.

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
