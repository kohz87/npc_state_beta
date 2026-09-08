# Changelog

This file tracks the current public 0.5.x line. Older 0.4.x material is archived under `docs/history/`; superseded 0.6.x/0.7.x development-line details remain available in Git history and are not repeated here as competing current release notes.

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
