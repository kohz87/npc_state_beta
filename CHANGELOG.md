# Changelog

This file tracks the current public 0.5.x line. Older 0.4.x material is archived under `docs/history/`; superseded 0.6.x/0.7.x development-line details remain available in Git history and are not repeated here as competing current release notes.

## 0.5.37

- Resolve model-supplied null-ID quotations against uniquely matching, field-authorized current USER/ASSISTANT sources. Preserve strict explicit-ID checks, historical scope, source-event ownership and ambiguity rejection.
- Label current source IDs and correct the null/numeric citation contract (model contract 8). Add captured Vrena production-path and source-ownership regressions. No new request, keyword inference or persisted schema change.

## 0.5.36

- Unify NEW/EXISTING ordinary dossier writes under source-cited semantic updates (model contract 7); remove flat bootstrap writes, lexical contamination filtering, prompt rewriting, inferred direct-live citations, and the uncited Named preferred Role bridge.
- Correct canonical NEW examples and Current Dynamic evidence guidance at their source. Keep validated participant reuse separate from numeric scoring; do not inject summary quotations or accept the experimental v0.5.35 provenance converter.
- Validate mannerism establishment inside each semantic update across admission, Scan, completion, Recheck and Refresh. Preserve one-off observations and allow source-cited birthdays to supersede generated fallback metadata.
- Use the remaining automatic request budget for narrowly scoped NEW-field contract repair; optional enrichment remains Off by default and malformed retry/repair/follow-up share the two-request ceiling. Repaired failures and conflicting field evaluations report honest outcomes.
- Preserve distinct memories using exact normalized deduplication; leave semantic event consolidation to targeted model edits. Remove unused lexical relationship interpretation helpers while keeping exact quotation/participant and numeric mechanics.
- Add captured Maren production-engine/persistence fixtures and authority, repair-budget, mannerism, source ownership and memory regressions; migrate older fixtures to explicit field citations. Persisted state/settings schemas and storage identity remain unchanged.

## 0.5.34

- Reuse accepted current identity/activity evidence for descriptive zero-delta Current Dynamic binding without requiring every quotation to repeat both participants; exact-source, ambiguity, wrong-addressee, and numeric relationship safeguards remain separate.
- Require model-led `profileEstablishment.mannerisms=explicit|reinforced` for NEW durable mannerism bootstrap. Isolated actions remain eligible for the existing bounded `profileObservations` store instead of being forced into a habit.
- NEW bootstrap now rejects field proposals containing detail found only in a structured source that lacks authority for that field, without broadening World State/Inventory authority or rejecting separately supported proposals.
- Add focused regressions and repository agent guidance. No persisted schema change or extra model request.

## 0.5.33

- Make first-contact follow-up one canonical enum setting with **Off** as the default, including absent-setting upgrades. **Missing evaluations only** targets unaccounted eligible blanks on successfully admitted NPCs; **Recheck unknown fields** may also revisit eligible blanks explicitly marked insufficient.
- Audit follow-up coverage against exact requested stable-ID/field pairs. Empty, wrong-ID, omitted, invalid, and rejected responses remain diagnostic; accepted repairs clear only the repaired first-pass omission and explicit insufficient/unavailable/unchanged are valid evaluated outcomes.
- Bound automatic scans to two provider requests total across malformed-JSON retry and optional follow-up. Operation diagnostics record request purpose/count, estimated input characters/tokens per request, aggregate estimates, and follow-up outcome without presenting estimates as billed usage.
- Add dossier **Recheck missing details**, a current-exchange-only manual action that reuses the same target construction, source validation, ordinary-field locks, persistence, and diagnostics while remaining distinct from historical Refresh.
- Consolidate grounded first-scene guidance: isolated actions remain observations rather than habits, multiple reinforcing actions can establish a narrow pattern, lasting completed registration/access may qualify as memory, and live goals describe remaining objectives.
- Remove the unconditional v0.5.32 completion dispatch and synthesized completion group coverage. Persisted suppression/rollback/replay tombstones and supported compatibility readers remain unchanged. Persisted schema remains version 1.

## 0.5.32

- Add one bounded first-contact completion request only when the automatic Scan actually admits a new NPC. The request sees the same current exchange, targets only still-unresolved ordinary fields for the newly admitted dossier, and is sanitized before application so it cannot change activity/presence, relationship state or Current Dynamic, lifecycle, family/social graph, identity, or already-populated fields. First pass and completion persist through one owned checkpoint/commit.
- If the optional completion request fails, preserve the valid admitted first pass and report an explicit partial-coverage diagnostic instead of discarding the dossier. Existing-cast turns remain one provider request; no recurring completeness scan, historical backfill, or provider-specific semantic rule is introduced.
- Keep deterministic birthday generation and internal provenance bookkeeping, but remove the user/model-facing `generated` label from dossier presentation, compact scanner context, and foreground cache identity. Generated dates behave as ordinary stable stored birthdays in normal continuity. Persisted schema remains version 1.

## 0.5.31

- Tighten shared field accounting so `insufficient` is an evidence conclusion rather than a safe default: directly supported narrow values from already permitted current sources should be proposed, including stated current private mood/goal from NPC_Inner_Chatter. Keep the existing field-scoped structured-evidence firewall; no deterministic mood/goal inference, extra scan, or provider-specific rule is added.
- Preserve generated birthday fill as a separate user-configurable feature while carrying its `generated` provenance through compact scanner context/cache identity and labeling it in the dossier UI. Synthetic calendar values remain fallback metadata rather than narrative evidence.
- Add focused prompt/provenance/UI/cache regressions. Preserve first-contact profile observations, identity admission, descriptive-versus-numeric relationship separation, one post-response scan, and continuity-only foreground injection. Persisted schema remains version 1.

## 0.5.30

- Retain tentative profile observations after successful new-NPC admission using the accepted stable ID, existing source validation, bounded evidence store, and shared persistence/rollback flow. Remove the superseded existing-only gate; observations cannot authorize admission.
- Clarify initial establishment versus longitudinal development and current-user apparent-age evidence. Update the existing compact example with grounded narrow personality/behavior and an apparent-age interval; preserve unsupported fields as unknown.
- Add first-contact admission, source rejection, deduplication, persistence failure/stale-work, deletion, and swipe regressions. Preserve numeric relationships, storage schemas, and one-request scanning; historical enrichment remains deferred.

## 0.5.29

- Fix first-contact zero-delta Current Dynamic when a new NPC is visibly grounded by exact role/description evidence but receives its canonical proper name through the current World_State enrichment path. The accepted visible identity remains identity authority for that descriptive relationship-summary bridge even when the canonical name itself is not visible.
- Carry the already validated World_State-enrichment fact into Current Dynamic context plumbing so exact summary quotations from the same permitted visible source can reuse accepted player-facing activity without repeating the identity anchor. Other identity paths retain their existing summary-linked target checks.
- Preserve known/unnamed wrong-addressee rejection, isolated quoted-second-person rejection, exact source ownership, and descriptive-versus-numeric relationship separation. Add Vrena-shaped production regressions for the accepted enrichment case and quoted-`you` negative boundary. No prompt text, extra scan, provider-specific rule, storage schema, model contract, or foreground contract change.

## 0.5.28

- Unify first-seen identity admission around one validated current-visible identity anchor. A proper/short name or unique role/description must appear inside exact current-visible identity evidence; a compatible proper canonical name may be enriched from the same current World_State placement without turning that structured-only name into the anchor.
- Remove the superseded deterministic role-head/intro-word World_State fallback instead of keeping two competing identity authorities. Preserve identity collision checks, unique-anchor ownership, structured/private firewalls, Balanced/Named preferred/Manual admission semantics, and existing activity/relationship separation.
- Add Maren-style production regressions for role-to-canonical enrichment, structured-only-anchor rejection, fabricated/disconnected evidence, ambiguous shared roles, short-name enrichment, admission policies, private/excluded rejection, prompt consistency, and retired-code absence. Persisted schema remains version 1.

## 0.5.27

- Fix intermittent first-seen NPC creation when the scanner emits a contextual canonical role label such as `Guild Receptionist` while the visible narrative grounds the same person through a shorter identity anchor such as `receptionist`.
- Treat `identityEvidence.anchor` as deterministic admission evidence only after the existing current-visible exact excerpt validation succeeds, the anchor itself occurs inside one validated identity excerpt, and that anchor is uniquely owned by the proposed NPC within the operation.
- Preserve fail-closed boundaries: fabricated identity excerpts, unrelated visible anchor words, ambiguous shared anchors, structured/private-only introductions, identity collisions, and technical/generic identities remain rejected. `named_preferred` and `manual` admission policies are unchanged and cannot be bypassed by a valid role-label anchor.
- Add production-path regressions for the captured role-label shape plus fabricated excerpt, anchor-outside-excerpt, ambiguous-anchor, and Named preferred rejection cases. Persisted schema remains version 1.

## 0.5.26

- Make descriptive Current Dynamic player binding POV-independent. Direct grounding now recognizes first-person references in the current USER source, second-person references in ASSISTANT narration, and explicit PC naming without treating quoted dialogue pronouns as direct authority.
- Add a same-operation exchange binding fallback for dialogue-only and third-person prose: when the NPC's identity, exchangeActive status, and exact activityEvidence are already accepted, relationshipSummaryEvidence may reuse that same NPC-owned evidence from one permitted source without repeating a literal PC pronoun.
- Preserve fail-closed boundaries: unowned same-scene quotations, cross-source borrowing, explicit known other-NPC addressees, fabricated evidence, and isolated quoted `you` outside the accepted NPC activity remain rejected. Numeric relationship scoring, gates, inertia, milestones, replay protection, and storage schema stay unchanged.
- Add production regressions for first-person USER prose, second-person NPC dialogue, third-person pronoun prose, known-other-addressee rejection, and unowned-dialogue rejection. Update Scan/Refresh contract wording and source-role evidence metadata without adding another model request or provider-specific behavior.

## 0.5.25

- Generalize exact relationship evidence matching for wholly quoted model excerpts that are verbatim slices of a longer source dialogue. Outer quote delimiters may be ignored only when the unwrapped interior matches exactly inside one quoted-dialogue segment of the same permitted source.
- Keep the relaxation deliberately narrow: fabricated text, wrong-source evidence, mixed dialogue-to-narration excerpts, stitching across separate dialogue segments, and structural/custom-tag bridging remain rejected. Presentation-only markup normalization from v0.5.24 remains unchanged.
- Identity, activity, and Current Dynamic continue to share the same matcher. Neutral descriptive Current Dynamic can therefore persist at zero numeric relationship movement when its bounded evidence uses a shortened exact dialogue slice.
- Add generalized matcher and production-path regressions covering prefix/middle dialogue slices plus the fail-closed boundary cases. No database migration, scanner-prompt change, output allowance change, extra scan, or provider-specific branch is introduced.

## 0.5.24

- Normalize a bounded allowlist of presentation-only HTML wrappers during exact relationship evidence matching. Model excerpts can now cross a formatted dialogue boundary such as `</font>` into adjacent narration without reproducing presentation tags.
- Apply the same matcher to identity, activity, and Current Dynamic evidence, while preserving per-source ownership, wrong-source/fabricated rejection, structural/custom tag boundaries, and dialogue-versus-narration quote classification.
- Add a production-path Nelda regression proving cross-`<font>` identity/activity/summary evidence persists a neutral Current Dynamic with all numeric relationship state unchanged, plus safeguards showing fabricated cross-tag text and structural-tag bridging remain rejected.
- The single review also found that wholly quoted model excerpts retaining their outer quote marks were not recognized as being inside source dialogue; normalize that comparison without treating mixed dialogue-to-narration excerpts as wholly quoted.
- Scanner prompt text is unchanged, so the v0.5.23 measurement matrix remains unchanged. No additional scan, provider-specific branch, output reduction, database migration, or Phase 2 historical enrichment is introduced.

## 0.5.23

- Finish Current Dynamic evidence reuse: `relationshipSummaryEvidence` no longer has to repeat a narrator quote already accepted as the same resolved NPC's player-facing exchange activity. The bridge is transient, revalidates exact evidence against one permitted source record, and reuses only unambiguous application-validated activity/identity evidence.
- Preserve target safety: another customer/known NPC interaction cannot borrow the player's accepted activity; shared role-only activity remains ambiguous; narrated dialogue whose surrounding narration does not bind the player remains ambiguous unless that exact excerpt was already accepted for this NPC; quoted second person without an accepted player-facing narrator binding remains insufficient; fabricated/out-of-scope evidence still rejects normally. The single post-implementation review reproduced and closed the unnamed-other-customer variant of this edge.
- Keep descriptive and numeric relationships separate. A neutral summary can persist at zero trust/affection/desire/tension without fractional progress, milestones, evidence history, or relationship-change history; nonzero scoring continues through the unchanged axis-evidence path.
- Add Nelda production-path regressions for the captured two-dialogue evidence variation, direct binding, same-message wrong addressee, quoted `you`, established-summary preservation, storage reload, checkpoint rollback, and shared Scan/Refresh contract wording. Existing Vrena, stale-save, edit/swipe/deletion, lifecycle, profile-observation, and numeric relationship regressions remain green.
- Prompt measurements with the same estimator/system wrapper are 6,392 minimal, 6,395 rich first encounter, 7,460 three active plus one mentioned, 6,719 observation development, 8,061 dense collections/locks/forms, 6,597 large DB/one relevant, 7,121 structured/custom, and 4,794 targeted Refresh estimated input tokens, roughly +49 to +50 versus v0.5.22. No current narrative or scanner output allowance is reduced. Phase 2 remains deferred.

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
