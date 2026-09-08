# Changelog

This file tracks the current public 0.5.x line. Older 0.4.x material is archived under `docs/history/`; superseded 0.6.x/0.7.x development-line details remain available in Git history and are not repeated here as competing current release notes.

## 0.5.22

- Repair descriptive Current Dynamic target grounding so a small coherent exact-source evidence set can reuse the scanner's already accepted NPC identity/activity resolution from the same owned exchange; canonical NPC name and player address no longer need to appear in one excerpt when that accepted binding proves the interaction. Unrelated passages, ambiguous roles, competing speakers, quoted second-person misattribution, fabricated/wrong-message evidence, and stale/out-of-scope sources remain rejected.
- Stop applying lexical/token-overlap grounding to the descriptive relationship-summary explanation. It remains a concise model interpretation of source-owned evidence, while nonzero numeric relationship scoring keeps its existing stricter axis-evidence path, replay protection, gates, inertia, fractional progress, milestones, and history rules.
- Correct the compact fictional examples against explicit synthetic scenes: Nia's appearance/profile claims are actually supported; Ivo is an evaluated non-active existing candidate with honest candidate/field accounting rather than silently participating. Full examples are parser- and application-tested.
- Add focused regressions for split/contiguous Current Dynamic evidence, natural paraphrases, HTML-wrapped dialogue, competing speakers/ambiguous roles, fabricated/wrong-message excerpts, numeric-scoring separation/replay, example presence/coverage, and diagnostic separation of explicit insufficient evidence, omitted field coverage, and rejected proposals. The single post-implementation review found and fixed one shared-role edge: an activity excerpt claimed by multiple NPC patches is ambiguous and cannot provide contextual summary binding. Mannerism guidance remains unchanged.
- Keep v0.5.20-v0.5.21 first-pass calibration, Phase 1 observation/source ownership, one automatic post-response scanner request, compact continuity-only foreground injection, schemas/storage identity, and scanner output allowance unchanged. Phase 2 historical enrichment and roleplay-prompt characterization injection remain deferred.
- Using the same local estimator/system wrapper, stable fixtures measure 6,343 minimal, 6,346 rich first encounter, 7,411 three active plus one mentioned, 6,670 observation development, 8,012 dense collections/locks/forms, 6,548 large DB/one relevant, 7,071 structured/custom, and 4,745 targeted Refresh estimated input tokens. This is +204 to +205 over v0.5.21 routine fixtures and +141 for Refresh; the dense stress fixture is reported honestly above the approximate 7,500 target rather than truncated.

## 0.5.21

- Fix compact first-pass Background calibration: Role and Background may both be populated from the same grounded employment/workplace evidence when they express current function versus durable affiliation.
- Correct the parser-tested Nia example so an explicitly affiliated harbor clerk populates Background instead of contradictorily marking it insufficient.
- Add regressions proving new-NPC Background persists through the real application path and that Scan/Refresh advertise the same Role-vs-Background rule. Stable prompt fixtures add only about +37 to +69 estimated input tokens versus 0.5.20.

## 0.5.20

- Strengthen compact first-pass sufficiency after a real provider scan under-filled Apparent Age, Behavioral Profile, and Mannerisms despite direct life-stage wording, explicit recurrence, and repeated same-scene behavior. One scene may contain multiple distinct observations without making same-source facts independent longitudinal support; supported narrow values are preferred over reflexive `insufficient`, while isolated gestures/actions remain insufficient for broad habitual claims.
- Treat direct visible life-stage wording as positive Apparent Age evidence for a model-led `~N-M` range without adding a phrase-to-range dictionary or weakening chronological Actual Age.
- Make the existing Current Dynamic target-binding requirement explicit in the compact output contract: a new/changed summary needs at least one exact excerpt that visibly binds the NPC to the player; dialogue-only quotes without speaker identity are supplementary rather than sufficient. Backend target validation remains strict.
- Add a Vrena-style first-encounter regression proving the intended output can persist Apparent Age, narrow Behavioral Profile, narrow Mannerisms, and a zero-score transactional Current Dynamic together.
- Keep one automatic post-response scanner request, Phase 1 ownership/observation semantics, v0.5.19 lifecycle/collection/form corrections, schemas/storage identity, and scanner output allowance unchanged. Using the same local estimator/system wrapper, stable fixtures are 6,070 minimal, 6,073 rich first encounter, 7,137 three active plus one mentioned, 6,397 observation development, 7,739 dense collections/locks/forms, 6,275 large DB/one relevant, 6,798 structured/custom, and 4,567 targeted Refresh estimated input tokens; this is +239 to +260 versus v0.5.19 and does not truncate current narrative.

## 0.5.19

- Correct the compact lifecycle contract to advertise the canonical `lifeState`, `lifeStateCertainty`, and `lifeStateReason` keys. Abbreviated `state`/`certainty`/`reason` lifecycle rows are rejected at the focused proposal boundary with bounded diagnostics instead of silently becoming no-ops; valid sibling proposals still apply.
- Restore compact nested semantic-update guidance for collection `changes:[{action,ref?,expected?,value?}]` operations and `appearanceForms` targeting through `scope.form`, with parser/application-tested literal examples that preserve unrelated entries, other forms, shared appearance, current form, manual locks, and source validation.
- Keep v0.5.18 prompt compaction and the one-request workflow. Using the same local conservative estimator and scanner system wrapper, the corrected stable matrix is 5,831 minimal, 5,834 rich first encounter, 6,898 three active plus one mentioned, 6,157 observation development, 7,500 dense collections/locks/forms, 6,036 large DB/one relevant, 6,559 structured/custom, and 4,307 targeted Refresh estimated input tokens. This is roughly +140 to +141 fixed tokens versus v0.5.18 and does not truncate current narrative or reduce scanner output limits.
- Persisted/settings schemas remain 1, model semantic contract remains 6, foreground contract remains 8, and storage identity remains `npc_state_beta.v3`.

## 0.5.18

- Compact repeated scanner instructions across identity/activity, dossier extraction, relationships, lifecycle/graph, output examples, and semantic-update guidance while keeping one canonical wire shape and one ordinary semantic mutation pipeline.
- Preserve full current user/assistant evidence, bounded older reference-only context, candidate accounting, field coverage, manual locks, collection/form refs, profile observations, exact claimed-message ownership, structured-evidence authority, custom relationship/memory criteria, and all existing deterministic relationship/recovery behavior.
- Centralize the scanner system wrapper so actual dispatch and developer measurement use the same fixed system instruction. Add `npm run measure:scan-prompts` and stable prompt-budget regressions; no tokenizer dependency or runtime token-count network call is added.
- Using the existing local conservative estimator (`ASCII/3.5 + non-ASCII*1.1`) including the scanner system wrapper, the stable minimal fixture falls from 10,123 to 5,690 estimated input tokens; three active plus one mentioned falls from 11,191 to 6,757; dense collections/locks/forms from 11,793 to 7,359; targeted Refresh from 6,301 to 4,166. A deliberately long current response remains over the target because current evidence is not truncated.
- Keep scanner response-token settings unchanged. Persisted/settings schema, model semantic contract, foreground contract, storage identity, database format, and one-request automatic architecture remain unchanged. Phase 2 historical enrichment/backfill remains deferred and unnumbered.

## 0.5.17

- Correct the Phase 1 observation contract so every prompt and parser-tested literal example advertises `profileObservations` as an array; an object container now fails at the structural boundary instead of reaching the per-observation validator.
- Use one source-owned profile-evidence identity rule: exact normalized concept distinguishes independent observations within one owned source, while applying a related profile change over an already observed source excerpt does not create a second evidence record.
- Validate every semantic/observation excerpt against the specific claimed permitted message before deriving source-event ownership; `messageId:null` means the owned current message when per-message source contexts are available.
- Preserve distinct facts that share one excerpt, independent support from later exchanges, candidate accounting, manual locks, one automatic post-response scanner request, guarded persistence/checkpoints, and existing rollback/recovery behavior.
- Keep historical enrichment/backfill deferred and unnumbered. Persisted/settings schema, model semantic contract, foreground contract, storage identity, and database format remain unchanged.

## 0.5.16

- Audit the same bounded existing-NPC candidate set supplied to routine Scan independently of model-returned activity arrays; candidate accounting is model-judged and remains separate from physical presence and ordinary field completeness.
- Treat missing, unresolved, conflicting, or legacy-omitted candidate accounting as honest partial semantic coverage while still applying valid compatible sibling proposals.
- Allow grounded personality, Behavioral Profile, Speech, and Mannerisms observations to persist without forcing a field mutation, using the existing bounded `profileEvolutionEvidence` store and accepted patch/source ownership.
- Keep observation-only evidence and related applied profile changes from double-counting the same owned source fact; independent later exchanges may accumulate support while edits/swipes/deletions restore evidence through existing checkpoints.
- Clarify model-led refinement/development semantics and compact substantially overlapping Behavioral Profile/Mannerism entries through existing targeted collection operations without hardcoded phrase dictionaries.
- Preserve one normal automatic post-response scanner request, bounded current-exchange authority, deterministic relationship mechanics, manual locks, guarded persistence, rollback/recovery, and portrait-ready appearance behavior.
- Historical enrichment/recent-history backfill remains intentionally deferred. No database reset, persisted/settings schema change, storage migration, full-cast Refresh loop, supplemental completeness request, or embedded extraction is introduced.

## 0.5.15

- Run a repository/runtime hygiene pass without changing NPC data semantics, persisted/settings schema, storage identity, relationship mechanics, model contract shape, or rollback/recovery behavior.
- Synchronize `README.md`, `DEVELOPMENT.md`, and release-facing documentation with the active release instead of leaving the packaged README two patches behind.
- Document the 0.5.14 Apparent Age contract in the current user/maintenance docs: the model may infer a defensible visual range, while deterministic code resolves it to one stable per-NPC `~N`; Actual Age remains separate.
- Keep conservative compatibility boundaries that are still purposeful: legacy response adaptation, historical `<npc_state_v1>` stripping for old chats, shipped-default settings migration, and tiny retired public diagnostic tombstones.
- Strengthen repository validation so release-facing documents must agree with the manifest/runtime release and unused source files remain prohibited.
- Remove stale release branding from active runtime diagnostics. No database rebuild or migration is required.

## 0.5.14

- Allow the model to infer a grounded apparent-age interval such as `~20-30` when narrative evidence supports only a visible life-stage/band.
- Keep semantic interpretation model-led: there is no deterministic English phrase-to-range dictionary.
- Deterministically choose one inclusive integer from the proposed range using the NPC's stable identity, then persist/display only `~N`; reloads and retries do not reroll it.
- Preserve explicit `~N`, legacy/manual descriptive apparent ages, and strict separation from chronological Actual Age.
- Share one apparent-age policy across Scan, targeted Refresh, and structured reconciliation.
- Add regression coverage for range normalization, per-NPC stable selection, reload stability, semantic update application, and prompt behavior.
- Persisted schema, storage identity, relationship mechanics, rollback/recovery behavior, model contract shape, and database format remain unchanged.

## 0.5.13

- Preserve grounded descriptive Apparent Age instead of discarding nonnumeric visual life-stage evidence, while keeping Actual Age strictly chronological.
- Permit concise established workplace/affiliation information to populate Background on first pass without inventing tenure, origin, family history, or prior events.
- Allow a first direct professional/transactional/other role-defined interaction to establish a descriptive Current Dynamic even when all numeric relationship scores remain zero.
- Tighten appearance fidelity so plausible but unstated uniform pieces/accessories/body features are not added.
- Tighten behavioral-profile extraction so a single isolated action is not generalized into a recurring habit without repeated or explicit generalized evidence.
- Persisted schema, storage identity, relationship mechanics, rollback/recovery behavior, model contract shape, and database format remain unchanged.

## 0.5.12

- Fix automatic-scan synchronization so the recursion bypass exists only while invoking the scanner's own host generation call, not for the lifetime of its pending provider request. Ordinary next-turn generation waits for the preceding scan, and a second real assistant completion remains eligible for its own queued scan while an earlier scanner request is pending.
- Expand routine Scan identity context with ambiguity-safe unique short-name matching. Returning inactive or archived/deceased dossiers can be supplied when current narration uniquely references them; ambiguous shared short names remain unbound.
- Make automatic recovery status authoritative. Retry of a partial/failed settled boundary performs a fresh forced semantic rescan without replaying already-applied relationship scoring; a successful manual Scan of the same source boundary can settle the coordinator state.
- Harden zero-delta Current Dynamic evidence against shortened quoted excerpts while retaining narrator-addressed second person outside dialogue.
- Restore bounded `profileEvolutionEvidence` writing inside the current semantic pipeline for applied personality, behavioral-profile, speech, and mannerism changes.
- Preserve the 0.5.11 post-response architecture, `npc_state_beta.v3` storage identity, persisted/settings schema 1, model semantic contract 6, foreground continuity contract 8, deterministic relationship mechanics, manual correction ownership, rollback/recovery, alternate routing, and guarded persistence.

## 0.5.11

- Reset the public release label from the experimental 0.7.x development line to the next unused 0.5.x patch while retaining the newer consolidated codebase. Storage identity remains `npc_state_beta.v3`; persisted/settings schemas remain 1; model contract remains 6; foreground continuity contract advances to 8.
- Replace automatic embedded foreground extraction, malformed-capture fallback, and supplemental completeness with one dedicated post-response scanner. Roleplay generation receives continuity only and emits no NPC JSON.
- Synchronize the next ordinary generation at SillyTavern's awaited generation interceptor so the previous response's scan settles and continuity refreshes before prompt assembly.
- Bound routine scan context to the completed exchange plus at most two antecedent reference messages and compact relevant dossiers.
- Retain field-level completeness accounting, field-aware collection normalization, scanner examples, and natural Current Dynamic target resolution from the superseded development line.
- Retire obsolete `scanAfterEachResponse`, `fallbackScan`, and `newNpcHistoryEnrichment` settings without changing an explicit `autoScan` choice.
- Remove obsolete capture/completeness coordinators and capture diagnostic storage/matching helpers after migrating their meaningful race, persistence, parser, rollback, and value-boundary tests to the dedicated-scan workflow.
- Preserve conservative historical transport stripping and compatibility boundaries required for existing chats/settings.

## Historical development

The long 0.6.x/0.7.x development sequence was superseded by the consolidated public 0.5.x line before/at 0.5.11. Its useful behavior and regression coverage were carried forward, while obsolete embedded-capture/completeness architecture was retired. Detailed commits remain available in repository history. Historical 0.4.x release material is retained under `docs/history/`.
