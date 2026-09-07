# NPC State core contract

This document is the authoritative maintenance specification for NPC State Beta. `DEVELOPMENT.md` explains how to work on the repository and points here instead of duplicating runtime rules. Historical release notes are evidence of past behavior, not competing specifications.

## Authority and invariants

NPC State maintains continuity for one SillyTavern chat sidecar. The language model interprets narrative meaning. The extension owns structure, field permissions, source validation, deterministic mechanics, history ownership, replay protection, persistence, restoration, and failure state.

The normal logical workflow is:

`identify source history -> select context -> obtain proposals -> validate -> apply to working state -> revalidate ownership -> commit -> refresh consumers`

Foreground capture follows the host generation lifecycle: its proposal is embedded in the completed roleplay response and is applied afterward. It must never add a pre-generation model request. Rollback enters the same commit boundary after a valid restored state has been selected.

A durable commit is not successful until persistence succeeds. A proposal whose source history is no longer owned is discarded. If history changes while a save is in flight, the completed write is not accepted as current; the timeline is blocked for reconciliation instead of being reported as successful.

## A. State and ownership

### Story-derived state

Story-derived state includes NPC admission/existence, narrative lifecycle, memories and provenance, live mood/location/status/goal/current form, narrative profile/canon/appearance, NPC-to-player relationship state and audit data, NPC-to-NPC/family graph state, presence/observation state, narrative counters, and story replay/application bookkeeping.

A complete story snapshot restores these together. A newer story value is not preserved merely because it is newer.

### User-owned state

User-owned state includes settings, portraits, explicit manual corrections, explicit automatic-update locks, importance, and manual NPC deletion/suppression tombstones. Manual relationship corrections use a compact per-axis ownership record containing an absolute target and monotonic correction revision; visible relationship history remains bounded display/audit context and is never the durable correction authority.

Manual correction metadata and automatic-update locking are separate concerns. A relationship correction applies only to axes the user actually changed. Supported legacy relationship ownership is inspected and migrated at the manual-edit boundary before a new per-axis edit can overwrite the metadata that proves the old intent. New relationship edits use only compact per-axis correction records; whole-relationship overrides are legacy compatibility input, not a second write authority. A migrated legacy axis keeps one compact legacy-origin identity derived from the proven override provenance, so a checkpoint written before the representation transition can prove it already contains that same correction without replaying the absolute target over later surviving story movement. When rollback selects a snapshot before the correction, the absolute target for that axis is restored before any surviving suffix is reconstructed. Ambiguous legacy ownership is normalized into a bounded unresolved-axis set, independent of visible relationship history; that unresolved set remains authoritative until explicit axis confirmation or clear-all remediation removes it, including when legacy compatibility metadata is otherwise absent. Explicit confirmation removes only the selected axis, including when the confirmed numeric value is unchanged. Once all unresolved axes are confirmed, obsolete legacy override metadata is retired while the confirmed modern corrections remain. Clearing all correction ownership is a separate explicit action. Automatic semantic evolution remains allowed after a correction and is blocked only by the existing explicit locks where applicable.

### Operational state

Operational state includes storage revision/CAS tokens, sidecar pointers, writer locks, operation epochs, in-flight work, recovery ownership/leases, caches, and diagnostic buffers. Narrative snapshots do not restore obsolete storage revisions, pointers, locks, or in-flight ownership.

### Ordinary dossier field registry

`src/model/dossier-fields.js` is the authoritative registry for ordinary semantic dossier fields. It defines field kind, durability, evaluation group, normalization contract, permitted semantic operations, evidence class, structured-evidence scope, first-pass requirements, and manual-ownership behavior. Relationship mechanics, lifecycle/admission, presence, and graph transitions remain focused deterministic domains and are not forced through the ordinary field validator.

## B. Chat and history identity

A message ID is a position, not sufficient narrative identity.

History ownership combines:

- the sidecar/chat identity;
- canonical source-message fingerprint;
- role-ordered canonical lineage through the source boundary;
- source position for addressing the current host message;
- swipe identity where the host exposes it.

Canonical fingerprints exclude NPC State transport-only control blocks and other defined machine transport so bookkeeping does not create false branches. Timestamps are diagnostic/retention metadata only.

Deletion and renumbering, edits, continuation changes, swipes/regeneration at reused IDs, chat switches, and changed preceding context invalidate later ownership even when a later response retains the same position or text.

## C. Context and model contract

All model-facing modes use the shared dossier field definitions and canonical semantic update contract. Compatibility shapes are normalized once at the scanner boundary and cannot bypass validation.

Context is purpose-specific:

- foreground first pass receives a budget-bounded selection and always retains the four required first-pass live comparison fields for selected existing NPCs;
- Scan current cast receives the current exchange plus bounded continuity context;
- Refresh receives one dossier plus bounded historical evidence;
- completeness receives supplemental context for the already committed exchange;
- historical reconstruction receives history only through the exchange being reconstructed, never future evidence.

Omission is not deletion. Missing output is not proof that a field was evaluated. Modern payloads may add compact field-level evaluation lists for explicitly unchanged, insufficient-evidence, or context-unavailable fields; older evaluatedGroups-only payloads remain valid group-level declarations and never gain fabricated per-field certainty. Foreground compact context identifies fields that were unavailable or only partially supplied so compaction cannot masquerade as an empty stored field. Coverage diagnostics distinguish explicitly evaluated, missing, unavailable, insufficient, and incomplete work.

### Model output structure and rejection

`src/scan-contract.js` owns the shared envelope and canonical identity classifications; ordinary field types/groups continue to derive from `src/model/dossier-fields.js`. Foreground, Scan, Refresh, structured import, and reconstruction use the same compact structural instructions and serialized fictional examples. Every example labeled valid JSON is tested through the production strict parser. Explanatory row notation is explicitly not JSON. Examples demonstrate shape, not facts or identities to copy into the story. New NPCs use an empty `id`, canonical `name`, and `identityKind` `named` or `role-label` with current-visible identity/activity evidence; the extension assigns stored IDs locally. Their ordinary bootstrap fields are flat. Existing, including name-only, dossiers keep supplied IDs and update through `semanticUpdates`.

New live responses must contain all seven arrays, including empty arrays: `exchangeActiveNpcIds`, `inChatNpcIds`, `worldActiveNpcIds`, `npcs`, `socialEdges`, `familyFacts`, and `lifeStateUpdates`. Relationship deltas use only trust/affection/desire/tension; zero values do not require a scoring event. A changed Current Dynamic needs its own bounded evidence as specified below. The v1 transport tag is independent of release/model/foreground contract versions.

Parsing and compatibility validation occur at the scanner boundary before identity preparation, not in a parallel application path. Retained compatibility is narrow: the older `finalPresentNpcIds` envelope alias must agree with `inChatNpcIds` if both are supplied; existing classification aliases proper-name/proper and role/unnamed normalize to named and role-label without conferring admission. Older direct callers may omit supplemental arrays under their established non-live parser options; the strict live path requires all seven. A complete surrounding JSON fence remains supported for older separate scanners. Supported legacy semantic shapes still pass through the existing adapter. No canonicalName/activityRefs/nested-live/relationshipToPlayer dialect is added, and no respect/attraction axis conversion is performed.

Reject incompatible/ambiguous structure as a whole, including conflicting aliases and over-cap arrays, before mutating NPC state. Ordinary per-proposal evidence and permission rejections remain explicit validator outcomes, not structural repair. Syntax errors, missing required members, invalid structures, duplicate transport blocks, unmatched tags, and truncated JSON/blocks have bounded concrete diagnostics. Do not extract an arbitrary brace substring, reconstruct incomplete JSON, or invent missing facts. A rejected capture can retain bounded error codes/messages and hashed source metadata in the host message, but does not write the NPC sidecar. Missing and invalid captures trigger a separate recovery scan only if the existing fallback option is explicitly enabled. Successful first-pass capture never requires a second model call.

Essential shape/examples stay in the mandatory foreground contract. Reserve minimum selected dossier context before optional rubrics, then enrich within the existing budget. A zero-entry compact evidence tier is empty, not an accidental slice of all historical evidence.

## D. Update application

`src/scanner.js` is the application coordinator for model results. The supported order is:

1. parse the structured response;
2. adapt supported legacy response shapes once;
3. prepare deterministic identity/admission input;
4. apply focused deterministic identity, relationship, lifecycle/presence, and graph mechanics;
5. apply ordinary `semanticUpdates` through the field registry;
6. reconcile model-led family facts where permitted;
7. report semantic and coverage diagnostics.

Ordinary semantic operations are `establish`, `refine`, `replace`, and `remove`. The model decides narrative meaning. The validator owns permitted fields, source provenance, target identity, manual ownership, durability, collection/form targeting, and structural rules. English keyword lists or arbitrary repetition counts must not become general semantic authority.

Identity/admission produces one authoritative per-operation patch-to-NPC outcome before ordinary semantic application. Accepted patches carry the resolved stored NPC id, including a locally allocated id for a newly admitted dossier; rejected or unresolved patches carry a bounded reason. Role restoration, ordinary semantic updates, coverage, and patch-bound reference fallback must consume that same outcome rather than independently resolving the model's original transport id/name. An unknown model id is never accepted as a stored id merely because it was emitted, and a rejected id/name conflict cannot mutate either candidate through downstream ordinary fields. Independent focused channels keep their own established target rules.

Relationship scoring remains deterministic and separate: caps, gates, inertia, fractional progress, milestones, replay protection, evidence history, and descriptive Current Dynamic safeguards are extension-owned. Current Dynamic evidence is also separate from numeric scoring eligibility: a source-owned, correctly targeted descriptive relationshipSummary may establish or materially update at zero scores/zero deltas without creating relationship-change history, while intensity/milestone safeguards still reject unsupported depth. Normal current-evidence proposals carry bounded exact summary evidence; explicit repair/reconciliation keeps its established accepted-history authority.

## E. Commit and persistence

Story-derived and explicit user-owned mutation paths share one commit responsibility, parameterized only by ownership policy:

1. capture operation/history ownership before asynchronous work;
2. apply accepted proposals to working state;
3. associate the candidate with the correct message/history checkpoint boundary;
4. revalidate ownership immediately before persistence;
5. persist through the existing sidecar writer/CAS/lock path;
6. revalidate ownership after the asynchronous save;
7. only then report the operation as current and refresh consumers.

If the source becomes stale before saving, nothing is committed. If history changes during the save, the write is treated as unowned, the timeline is blocked, and ordinary branch reconciliation must select a verified boundary. Cross-writer conflicts and missing/retired sidecars remain hard failures, not blank-state fallbacks.

UI and injected continuity update from the committed cache callback. A UI repaint is never evidence of durable persistence.

## F. Rollback and reconstruction

The checkpoint/branch system is the only automatic rollback authority.

Before the first tracked story mutation, NPC State keeps a trustworthy pre-update baseline when one can actually be established. Post-update checkpoints carry chat identity, source position, source fingerprint, preceding lineage, resulting lineage, and a complete restorable story snapshot. Portrait payloads are excluded from duplicated snapshots and restored from current user-owned state.

Tail deletion restores the latest full checkpoint that exactly owns the surviving lineage. If that checkpoint already represents the surviving boundary, no model request is needed.

Middle-history divergence restores the latest verified prefix and reconstructs every surviving assistant suffix exchange in order through historical recovery. Later checkpoints are not reusable when their preceding context changed.

Checkpoint retention stays bounded. If a valid earlier baseline exists, reconstruction may rebuild forward under the existing recovery controls. If no trustworthy baseline/history exists, NPC State retains recoverable data and explicitly requires recovery/rebase. It never calls relationship-ledger subtraction a complete rollback, invents lost state, or silently replaces the sidecar with empty state.

Automatic history reconciliation is distinct from explicit user rebase. Explicit rebase keeps the established `preserve` versus `rollback` relationship choice and its pre-rebase backup.

## G. Diagnostics

Diagnostics observe the authoritative paths and never decide state.

The runtime keeps a bounded in-memory operation ledger per chat. Records may contain:

- operation id/type/status and timestamps;
- chat identity, source position, source fingerprint, swipe id, lineage length/hash;
- selected/target NPC ids;
- prompt character count, local token estimate and response-token limit where a prompt exists;
- counts of explicitly accepted, rejected, unchanged, or omitted proposals with bounded concrete reasons;
- persistence outcome and committed revision;
- checkpoint reason/boundary or restored checkpoint;
- reconstruction status/progress.

Diagnostics never store credentials or full prompts/chat content by default. Hashed/fingerprinted history ownership is sufficient for local diagnosis. Normal status remains concise through `NPCState.debugStatus()`. Detailed bounded records are opt-in through `NPCState.operationDiagnostics()`.

`unchanged` is recorded only when an authoritative validator explicitly reports a no-change proposal or when a legacy patch explicitly records evaluated dossier groups with no field update. Modern fieldEvaluations can separately report explicit unchanged, insufficient-evidence, and context-unavailable field ids. Output omission alone is never re-labeled as confirmed evaluation. Bounded proposal diagnostics account for direct new-dossier bootstrap writes, semantic writes, Current Dynamic decisions, identity failures, validation rejection, accepted application, and missing/incomplete evaluation without double-counting the same effective field update. A present patch whose identity was rejected/unresolved is never reported merely as `missing-npc-patch`, and full prompt/chat text is not retained for this accounting. Capture metadata contains a unique attempt id, bounded transport hash, chat identity, message position/fingerprint, active swipe, and canonical history length/hash. First-pass operations carry the same attempt id and history identity. On-demand inspection matches all of these, never position/swipe alone. A failed new attempt cannot borrow an older committed outcome. Edited/replaced content, renumbering, changed preceding history, and chat/swipe switches invalidate ownership; unprocessed replacement transport also prevents an old result from appearing current. Legacy metadata without ownership and operations lost on reload/ledger eviction report application unavailable, not committed. Parsing, application, persistence, rejected/stale state, and unavailable evidence are distinct. Only already-retained successful payloads are inspectable/copyable; failed output retains bounded reasons and a hash, not raw content. There is no second payload archive.

Completion deduplication includes the canonical history boundary and transport identity, so changing only the embedded payload cannot suppress a new parse failure. Delayed transport cleanup validates the same chat/history/capture and transport hash before stripping, and asynchronous completion bookkeeping may not write to a replaced source. First-pass application captures history ownership before waiting for hydration/exclusive access and revalidates afterward.

## Feature contracts

### First-pass capture

Uses the embedded payload from the completed roleplay response. No second model request is required. Existing NPC patches use supplied stable ids. New NPC patches leave id empty, use the canonical human-facing name (or a unique readable role label while genuinely unnamed) in activity references, and receive a locally assigned stored id. Foreground and Scan share one compact extraction map derived from the ordinary field registry. Before emitting the payload, the model silently performs a same-generation completeness review without exposing reasoning. A newly admitted relevant NPC should capture every supported current-exchange dossier fact through the established bootstrap/semantic channels, including appearance, live state, grounded profile/canon/collections, important memories, and relationship context; conversation alone never justifies invented age, species, personality, relationships, or other unsupported facts, so Unknown is correct when evidence is absent. An existing name-only dossier remains existing and is enrichable through normal semanticUpdates rather than duplicate admission. Selected existing NPCs compare only context actually supplied; compact unavailable/partial fields are never treated as empty. Unsupported or unchanged values remain. Explicit removal requires sufficient evidence. Relationship replay guards, random birthday fill, and manual ownership remain authoritative.

### Scan current cast

Evaluates the current exchange and repairs omissions through the same application pipeline. Re-scanning already accepted history must not replay relationship scoring. Its narrow Current Dynamic repair may use already accepted relationship context without fabricating a new relationship event.

### Refresh NPC

Reconciles one dossier against bounded history. It may repair ordinary semantic/canon data and Current Dynamic from supplied evidence, but historical evidence is not a new relationship-scoring event. Presence/observation is preserved unless the operation explicitly owns those domains.

### Optional completeness

Runs only when enabled, after first-pass application. It supplements the same committed exchange, does not replay relationship scoring/presence, and is invalidated by source/history changes. It stays outside the foreground send path.

### Historical reconstruction

Starts from a valid baseline and processes surviving assistant exchanges sequentially. Each step has recovery ownership, source-lineage validation, a durable checkpoint, and resumable progress. Completed history may not be silently replayed against a changed past. Recovery completion is not trusted from a stored status flag alone: Resume revalidates the completed prefix and branch safety before reporting success. If finalization loses history ownership while saving, recovery is durably marked stale/restart-required together with the branch block rather than remaining falsely complete.

### Manual edit/import

Manual editor changes express user intent and record correction provenance without implicitly freezing future semantic evolution. Relationship numeric edits are absolute per-axis corrections: editing Trust does not claim Affection, Desire, or Tension. Before a new relationship edit, any supported legacy correction whose axis intent is still provable is migrated into the per-axis representation, so editing a different axis cannot discard it. Ambiguous legacy axes are persisted as a bounded unresolved-axis set; current-format confirmation events are excluded from legacy-evidence inference and display-history trimming cannot resolve uncertainty. While the branch is blocked specifically for manual relationship correction uncertainty, the editor/API may perform only narrow remediation: confirm one relationship axis, even at its unchanged current value, or explicitly clear all relationship correction ownership for that NPC. Confirmation retains existing confirmed axes and retires legacy compatibility metadata only after every unresolved axis is accounted for. That remediation creates no narrative checkpoint and immediately reruns the existing checkpoint reconciliation. Other mutations remain blocked. The recovery banner routes this state to dossier remediation and does not offer generic timeline acceptance as a shortcut. If other NPC/axis uncertainty remains, the block remains; if uncertainty is resolved but a surviving suffix still needs reconstruction, the state moves to the established recovery requirement rather than becoming safe. Stable fields are protected from automatic updates only while their explicit lock is enabled; clearing that lock is a real unlock. Structured/manual imports use bounded validation and established persistence. Manual writes are owned by the target chat and user intent rather than by a narrative source event. If history shifts during their asynchronous save, keep the durable user edit/import but block the old narrative boundary for reconciliation instead of discarding the user action or advertising the old checkpoint as current.

### Deletion/edit/swipe reconciliation

History hooks invalidate pending work, settle the host change, restore the newest verified full boundary, and reconstruct affected surviving suffixes when necessary. Repeated reconciliation is idempotent.

## Compatibility obligations

Unless a release explicitly migrates them, preserve:

- `npc_state_beta.v3` settings/storage identity and sidecar format;
- persisted schema version 1 and settings schema version 1;
- supported public `NPCState` APIs and bundle/import formats;
- connection-profile routing behavior;
- supported legacy model response adaptation at one boundary;
- conservative loading of older sidecars without fabricated provenance.

A release version bump does not imply a persisted schema bump.

## Acceptance criteria

A release changing these responsibilities must pass repository validation, all behavioral tests, package dependency/reachability checks, and package-load tests. Acceptance tests should exercise engine/event/persistence behavior, including deferred operations for race conditions, rather than treating prompt text or source regexes as behavioral proof.

Handcrafted payload tests prove deterministic application behavior only. They do not prove live provider judgment, latency, browser event ordering, or a real SillyTavern deployment smoke test.

NPC State maintenance must never reset, rebuild, or modify a user's real database as part of repository validation.