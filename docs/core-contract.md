# NPC State core contract

This document is the authoritative maintenance specification for NPC State Beta. `DEVELOPMENT.md` explains how to work on the repository and points here instead of duplicating runtime rules. Historical release notes are evidence of past behavior, not competing specifications.

## Authority and invariants

NPC State maintains continuity for one SillyTavern chat sidecar. The language model interprets narrative meaning. The extension owns structure, field permissions, source validation, deterministic mechanics, history ownership, replay protection, persistence, restoration, and failure state.

The normal automatic workflow is:

`compact continuity -> visible roleplay response -> dedicated scan of completed exchange -> validate/apply -> revalidate ownership -> persist/checkpoint -> refresh continuity/UI`

Dedicated post-response scanning is the only automatic extraction mode. Normal roleplay generation receives continuity context only and never has to emit newly generated NPC JSON. Embedded first-pass extraction, automatic embedded fallback, and supplemental completeness requests are retired workflows. Manual Scan, targeted Refresh, and historical reconstruction keep their distinct scopes. Rollback enters the same commit boundary after a valid restored state has been selected.

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

All model-facing extraction modes use the shared dossier field definitions and canonical semantic update contract. Compatibility shapes are normalized once at the scanner boundary and cannot bypass validation.

Context is purpose-specific:

- roleplay foreground injection is continuity only: a budget-bounded selection of relevant saved NPC state, locks, and compact context coverage, with no extraction schema, output tag, repair rubric, or automatic-extraction history duplicate;
- automatic post-response Scan and manual Scan current cast use the completed assistant response plus its immediately preceding user message when one exists; up to two earlier non-system messages may be supplied only as bounded reference context for antecedents or continuity; relevant stored identity context accepts exact names/aliases and only unique unambiguous short-name mentions, and an explicitly mentioned archived/deceased dossier remains eligible for compact identity/state context so lifecycle resurrection can bind to the established record;
- targeted Refresh receives one dossier plus bounded historical evidence governed by its explicit history-depth setting;
- historical reconstruction receives history only through the exchange being reconstructed, never future evidence.

Routine Scan evaluates applicable fields of relevant NPCs, not the entire database. Current-exchange evidence owns new live changes, memories, relationship movement, lifecycle events, and development. Earlier raw dialogue is reference context, not new-event evidence. Saved bounded development observations may contribute to a grounded synthesis only under the existing semantic evidence rules and new supporting current evidence.

Omission is not deletion. Missing output is not proof that a field was evaluated. Modern payloads account for each applicable ordinary field through a proposal or compact field-level outcome for explicitly unchanged, insufficient-evidence, or context-unavailable work. Older evaluatedGroups-only payloads remain accepted group metadata, but group labels never count as field-level unchanged and coverage reports bounded unaccounted field ids honestly. Coverage diagnostics distinguish proposed/applied, rejected, unchanged, insufficient, unavailable, and unaccounted work; persistence success remains separate from semantic completeness.

### Model output structure and rejection

`src/scan-contract.js` owns the dedicated scanner envelope, canonical identity classifications, and parser-tested examples; ordinary field types/groups derive from `src/model/dossier-fields.js`. Scan, Refresh, structured import, and reconstruction use this structural contract. Every literal example advertised as valid JSON is tested through the production strict parser. Examples demonstrate shape, not facts to copy into the story.

New NPCs use an empty `id`, canonical `name`, and `identityKind` `named` or `role-label` with current-visible identity/activity evidence; the extension assigns stored IDs locally. New-dossier bootstrap fields are flat and should include every supported current-exchange fact actually evidenced. Existing, including name-only, dossiers retain supplied stable IDs and update through `semanticUpdates`. Unsupported age, backstory, habits, relationships, memories, or other facts remain unknown. Intentional birthday generation remains a separate extension feature.

Apparent Age is a visual estimate and is never chronological Actual Age. If narrative evidence supports a reasonably specific visible age, the model may propose `~N`. If evidence supports only a defensible visible age band, the model may semantically propose `~N-M` without relying on a fixed phrase-to-range dictionary. The deterministic backend validates the range and, once the NPC's stable identity is known, chooses one reproducible inclusive integer from that range and persists only `~N`; retries and reloads therefore do not reroll the same estimate. Legacy/manual descriptive Apparent Age values remain compatible. Apparent Age must never be copied into Actual Age, and insufficient visual evidence remains unknown rather than forcing an estimate.

Scanner responses contain the required envelope arrays, including empty arrays. Relationship deltas use only trust/affection/desire/tension; zero is valid and does not require a scoring event. A changed Current Dynamic needs its own bounded exact-source evidence and may be descriptive at zero numeric movement when correctly targeted.

Parsing and compatibility validation occur at the scanner boundary before identity preparation, not in a parallel application path. Retained legacy response aliases normalize once and cannot confer admission or bypass evidence. Legacy `<npc_state_v1>` transport may still be stripped from historical message canonicalization so old chats do not create false divergence, but new roleplay responses neither request nor consume embedded NPC payloads.

Reject incompatible or ambiguous scanner structure before mutation. Ordinary per-proposal evidence/permission rejections remain validator outcomes, not structural repair. Do not reconstruct truncated JSON, invent facts, flatten arbitrary objects, or silently apply an ambiguous dialect. A failed automatic scan leaves story state unchanged and reports a bounded failure/partial status with Retry available.

The scanner must receive the complete current exchange within its supported context limit. If that limit is exceeded, the operation reports an explicit context limitation rather than silently discarding the relevant scene ending and claiming complete evaluation.

## D. Update application

`src/scanner.js` is the application coordinator for model results. The supported order is:

1. parse the structured response;
2. adapt supported legacy response shapes once;
3. prepare deterministic identity/admission input;
4. apply focused deterministic identity, relationship, lifecycle/presence, and graph mechanics;
5. apply ordinary `semanticUpdates` through the field registry;
6. reconcile model-led family facts where permitted;
7. report semantic and coverage diagnostics.

Ordinary semantic operations are `establish`, `refine`, `replace`, and `remove`. The model decides narrative meaning. The validator owns permitted fields, source provenance, target identity, manual ownership, durability, collection/form targeting, and structural rules. Applied personality, behavioral-profile, speech, and mannerism changes append bounded normalized `profileEvolutionEvidence` carrying source-message/turn ownership; the same source/concept retry is not a second development observation, while grounded observations from later exchanges may accumulate. English keyword lists or arbitrary repetition counts must not become general semantic authority.

Incoming ordinary dossier values are shape-validated from the canonical field registry before any string coercion or state application. Text scalar fields require strings; chronological and apparent age retain finite non-negative numeric compatibility before normal age normalization. Collections require arrays whose members are strings or the existing explicitly supported object forms. For a supported collection object, every recognized text property that normalization may consume must itself be textual; one valid alias never licenses a malformed sibling alias. New-NPC bootstrap, semantic application, manual/import validation, and persisted dossier normalization use the same field-specific member semantics; a property recognized for one collection field is not an alternate value source for another. Defensive normalization also ignores non-text recognized aliases rather than stringifying them. Appearance forms retain their supported object/list normalization only when form names and descriptions are textual, and semantic form selectors (`scope.form`, `targetForm`, `expected`, `ref`) must be strings when supplied before target lookup/dedupe. Invalid values are rejected at the affected field/update with bounded diagnostics and preserve the existing stored value; they are never flattened or converted through generic JavaScript object stringification. Structurally valid sibling proposals retain the established per-proposal application policy. Compatibility adapters must preserve raw candidate values until this validation occurs: the named-preferred role bridge and legacy direct-live/form adapters may not stringify malformed objects to satisfy an older shape. One effective invalid field proposal is diagnosed once rather than by both bootstrap and compatibility restoration.

Focused top-level social, family, and lifecycle proposals apply the same fail-closed value-shape principle at the scanner coordination boundary before their deterministic handlers. Textual graph/lifecycle members must actually be strings and family member lists must contain strings; malformed rows are rejected as individual focused proposals with bounded diagnostics, while valid sibling rows remain eligible. Relationship text metadata is likewise type-checked before persistence: malformed Current Dynamic is rejected, and non-string relationship reason/evidence or evidence explanations cannot be converted into durable `[object Object]` history/diagnostic text. Valid axis evidence continues to own numeric relationship scoring independently of optional descriptive reason text.

Identity/admission produces one authoritative per-operation patch-to-NPC outcome before ordinary semantic application. Accepted patches carry the resolved stored NPC id, including a locally allocated id for a newly admitted dossier; rejected or unresolved patches carry a bounded reason. Role restoration, ordinary semantic updates, coverage, and patch-bound reference fallback must consume that same outcome rather than independently resolving the model's original transport id/name. An unknown model id is never accepted as a stored id merely because it was emitted, and a rejected id/name conflict cannot mutate either candidate through downstream ordinary fields. Independent focused channels keep their own established target rules.

Relationship scoring remains deterministic and separate: caps, gates, inertia, fractional progress, milestones, replay protection, evidence history, and descriptive Current Dynamic safeguards are extension-owned. Current Dynamic evidence is also separate from numeric scoring eligibility: a source-owned, correctly targeted descriptive relationshipSummary may establish or materially update at zero scores/zero deltas without creating relationship-change history, while intensity/milestone safeguards still reject unsupported depth. Target binding accepts canonical names, unambiguous short identity references, and narrator-addressed second person outside quoted dialogue. Each exact excerpt is resolved against its original permitted source before quote/addressee classification, so a shortened fragment from another character's quoted dialogue cannot reclassify quoted “you” as the player; an ambiguous shared short name is likewise never sufficient. Normal current-evidence proposals carry bounded exact summary evidence; explicit repair/reconciliation keeps its established accepted-history authority.

## E. Commit, post-response scheduling, and persistence

Story-derived and explicit user-owned mutation paths share one commit responsibility, parameterized only by ownership policy:

1. capture immutable chat/source ownership before asynchronous waiting for an automatic post-response scan;
2. revalidate before model dispatch;
3. apply accepted proposals to working state;
4. revalidate after generation and immediately before persistence;
5. persist through the existing sidecar writer/CAS/lock path;
6. revalidate ownership after the asynchronous save;
7. only then report the operation as current, checkpoint the owned story boundary, and refresh continuity/UI.

Automatic source ownership contains chat identity, source position, canonical fingerprint and lineage through that source, swipe/revision where available, and operation generation. A newly appended user message after the owned assistant source does not by itself invalidate that source because ownership is measured through the source boundary. Edits, deletion/renumbering, changed preceding history, replacement swipes/regeneration, chat switches, and explicit invalidation do invalidate stale work.

One completed assistant revision creates one logical post-response scan job. Duplicate completion/render events share its in-flight or completed result. The coordinator retains only the newest completed revision for the active chat plus genuinely in-flight earlier work; delayed completion events older than the newest seen assistant boundary are ignored rather than replayed. A revised/swiped response at the same message boundary has different ownership and aborts the superseded provider request. Chat clear/switch aborts and retires that chat’s coordinator jobs. Historical recovery and scanner-generated quiet responses never recursively enqueue live scans. Manual Scan keeps its explicit-user ownership/replay policy and may intentionally repair the same exchange.

Post-response status is per chat and bounded: `idle`, `queued`, `scanning`, `saving`, `complete`, `partial`, `failed`, or `blocked`. Only the newest owned job may publish status. Partial semantic coverage is distinct from persistence success; a skipped `already-scanned` result never upgrades a known partial/failed boundary. Retry of a settled partial/failed current source performs a forced semantic rescan while existing replay protection prevents duplicate relationship scoring. A successful manual Scan of that exact current source boundary is adopted as the coordinator's settled result so stale automatic failure state cannot keep blocking the next generation. A failed save cannot be presented as complete.

Before the user's next normal generation prompt is assembled, the supported awaited generation interceptor settles the preceding assistant response's owning automatic scan when Auto scan is enabled. This wait occurs outside the shared quiet-generation queue used by the scanner itself. Scanner-owned generation bypasses its own interceptor wait only during the synchronous invocation that starts that scanner generation; the bypass is released as soon as the provider promise is obtained and is never held for the lifetime of the pending request. Ordinary roleplay generation and real assistant-completion processing therefore still synchronize while a scanner request is pending. On bounded wait/scan failure the interceptor aborts the attempted generation cleanly, preserves the user's input, and exposes Retry rather than hanging or silently using stale continuity. `autoScan=false` is an explicit opt-out from this synchronization.

No story checkpoint is created from unpersisted output. If a source becomes stale before saving, nothing is committed. If ownership changes during the save, preserve the established saved-but-unowned block/reconciliation behavior. Cross-writer conflicts and missing/retired sidecars remain hard failures, not blank-state fallbacks.

UI and injected continuity refresh from committed state. A UI repaint or scanner response is never evidence of durable persistence.

## F. Rollback and reconstruction

The checkpoint/branch system is the only automatic rollback authority.

Before the first tracked story mutation, NPC State keeps a trustworthy pre-update baseline when one can actually be established. Post-update checkpoints carry chat identity, source position, source fingerprint, preceding lineage, resulting lineage, and a complete restorable story snapshot. Portrait payloads are excluded from duplicated snapshots and restored from current user-owned state.

Tail deletion restores the latest full checkpoint that exactly owns the surviving lineage. If that checkpoint already represents the surviving boundary, no model request is needed.

Middle-history divergence restores the latest verified prefix and reconstructs every surviving assistant suffix exchange in order through historical recovery. Later checkpoints are not reusable when their preceding context changed.

Checkpoint retention stays bounded. If a valid earlier baseline exists, reconstruction may rebuild forward under the existing recovery controls. If no trustworthy baseline/history exists, NPC State retains recoverable data and explicitly requires recovery/rebase. It never calls relationship-ledger subtraction a complete rollback, invents lost state, or silently replaces the sidecar with empty state.

Automatic history reconciliation is distinct from explicit user rebase. Explicit rebase keeps the established `preserve` versus `rollback` relationship choice and its pre-rebase backup.

## G. Diagnostics

Diagnostics observe authoritative paths and never decide state.

The runtime keeps a bounded in-memory operation ledger per chat. Records may contain operation id/type/status/timestamps; source chat/position/fingerprint/swipe/lineage; selected/target NPC ids; prompt character count/local token estimate/response-token limit; bounded proposal and field-coverage outcomes; persistence result/revision; checkpoint/recovery status; and failure reason. Full prompts/chat content and credentials are not retained by default.

`unchanged` is recorded only by an authoritative validator or explicit field outcome. Legacy evaluatedGroups are group-level compatibility metadata only. Modern field outcomes report unchanged, insufficient, unavailable, and unaccounted field ids separately. Direct bootstrap, semantic, relationship-summary, identity, validation, and coverage outcomes are merged without double-counting one effective update.

Automatic scan status is separate from operation history and from durable persistence. A discarded old job cannot overwrite a newer job's status. `NPCState.debugStatus()` remains concise; detailed records are opt-in through `NPCState.operationDiagnostics()`. Embedded-capture inspection APIs are compatibility shims only and report that embedded capture is retired; they do not retain the old capture subsystem or a payload archive.

## Feature contracts

### Automatic post-response Scan

After each completed assistant response, when enabled and `autoScan=true`, one dedicated scanner request evaluates that completed exchange. It uses the same scanner/application pipeline as manual current-cast Scan, captures every supported evidenced new-dossier fact in that operation, enriches existing/name-only dossiers through semantic updates, and records honest missing/insufficient/unavailable field coverage. It never requires relationship movement to update profile/live/memory facts and never invents values merely for UI completeness. Relationship replay guards, birthday fill, locks, and user ownership remain authoritative.

The roleplay response itself contains no newly requested NPC JSON. Historical `<npc_state_v1>` blocks are compatibility transport only and are ignored for new automatic extraction.

### Scan current cast

Manual Scan evaluates the same current exchange under explicit-user force/retry semantics. Re-scanning accepted history must not replay relationship scoring or duplicate durable memories. Its narrow Current Dynamic repair may use already accepted relationship context without fabricating a new numeric event.

### Refresh NPC

Reconciles one dossier against bounded history controlled by the Refresh scope. It may repair ordinary semantic/canon data and Current Dynamic from supplied evidence, but historical evidence is not a new relationship-scoring event. Presence/observation is preserved unless the operation explicitly owns those domains.

### Historical reconstruction

Starts from a valid baseline and processes surviving assistant exchanges sequentially. Each step has recovery ownership, source-lineage validation, a durable checkpoint, and resumable progress. Completed history may not be silently replayed against a changed past. Recovery completion is revalidated before success; history loss during final save leaves recovery stale/restart-required and the branch blocked.

### Manual edit/import

Manual editor changes express user intent and record correction provenance without implicitly freezing future semantic evolution. Relationship numeric edits are absolute per-axis corrections: editing Trust does not claim Affection, Desire, or Tension. Before a new relationship edit, any supported legacy correction whose axis intent is still provable is migrated into the per-axis representation, so editing a different axis cannot discard it. Ambiguous legacy axes are persisted as a bounded unresolved-axis set; current-format confirmation events are excluded from legacy-evidence inference and display-history trimming cannot resolve uncertainty. While the branch is blocked specifically for manual relationship correction uncertainty, the editor/API may perform only narrow remediation: confirm one relationship axis, even at its unchanged current value, or explicitly clear all relationship correction ownership for that NPC. Confirmation retains existing confirmed axes and retires legacy compatibility metadata only after every unresolved axis is accounted for. That remediation creates no narrative checkpoint and immediately reruns the existing checkpoint reconciliation. Other mutations remain blocked. The recovery banner routes this state to dossier remediation and does not offer generic timeline acceptance as a shortcut. If other NPC/axis uncertainty remains, the block remains; if uncertainty is resolved but a surviving suffix still needs reconstruction, the state moves to the established recovery requirement rather than becoming safe. Persistence conflicts/history changes remain blocked and reload-safe. Structured/manual imports use bounded validation and established persistence. Public/manual dossier mutation validates supported field shapes before schema normalization, including explicit manual-override values that may later be replayed during full-state rollback, so arbitrary objects cannot become JavaScript object-text strings; compatible numeric age/relationship inputs and documented collection objects remain supported, manual add requires a string identity, and portrait attachment objects remain a separate supported user-owned payload. Normalization applies the same owned-field shape rules to persisted legacy manual overrides, discarding malformed override entries before they can be replayed while retaining valid ownership. Manual relationship axes and manual importance accept finite numbers and nonempty finite numeric strings only; nulls, booleans, arrays, objects, empty/whitespace strings, and nonfinite values are rejected before score normalization, correction/history creation, or persistence. Persisted per-axis manual relationship corrections apply the same value rule during normalization, so malformed legacy correction values are discarded rather than becoming durable rollback ownership. Manual writes are owned by the target chat and user intent rather than by a narrative source event. If history shifts during their asynchronous save, keep the durable user edit/import but block the old narrative boundary for reconciliation instead of discarding the user action or advertising the old checkpoint as current.

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
