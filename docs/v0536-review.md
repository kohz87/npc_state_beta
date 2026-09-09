# v0.5.36 grounding consolidation review

Reviewed base: `main` at `2581d32d2441389ba085f6a2364454b0cb148657` (manifest 0.5.34). Released baselines: v0.5.33 `0c9f9b0f8a574375166b75b0f65f91fc845813c0`, v0.5.34 `b7b7f94070ea288bf48d21c406d34a07648a4b28`. The experimental branch at `43d90aa322ee6cd43d60b54c540b19c6b471ae11` was inspected separately and was not merged. There is no assumed v0.5.35 release.

## Findings and decisions

The principal failure was after extraction. `bootstrapStructuredContaminated` inferred provenance from vocabulary shared with disallowed blocks and rejected entire flat NEW proposals. The main-branch prompt shim then advertised semantic updates while labeling the canonical NEW example as legacy flat output. These were competing contracts.

The experimental branch was not a safe consolidation: generic accepted activity was reused as ordinary field provenance, and appended relationship evidence could rescue a summary addressed to another customer. Its existing suite had 19 failures, including structured-only Appearance and wrong-addressee cases. The reviewed main baseline passed 452 tests, demonstrating that passing the old suite alone did not cover the live regression.

v0.5.36 removes ordinary flat bootstrap writes and prompt rewriting. Identity resolution hands its accepted stable NPC ID to one source-cited semantic application pass. A model-supplied source must match its permitted message and field authority; unauthorized repetition cannot poison authorized evidence. The validator does not infer whether a quotation entails personality, employment, a goal, or a habit.

Compatibility policy is bounded repair (Option B), with strict rejection when its budget is unavailable. Successfully admitted NEW NPCs with uncited ordinary proposals or missing mannerism establishment can use the existing second automatic request to reconsider only affected blank fields. Optional missing-field completion shares that request. This can happen with optional first-contact follow-up Off and is recorded as `followUp.contractRepair`. No field citations are fabricated, no third request is added, and the repair cannot change identity, relationships, lifecycle, presence, graph state, or populated ordinary fields. An exhausted/failed repair preserves valid work and reports partial outcomes.

Current Dynamic uses the safer prompt correction: a new/changed summary must directly bind participants or include an exact accepted exchange-activity excerpt. No backend evidence is invented or appended. Numeric scoring and its stricter evidence checks are unchanged. A legacy response with the captured unbound dialogue-only summary can therefore still leave Current Dynamic blank; the format-repair phase cannot replay that focused channel.

## Answers to the architectural questions

| # | Assessment |
| --- | --- |
| 1 | Yes. One source-cited ordinary channel removes the NEW/EXISTING provenance asymmetry without moving narrative meaning into code. |
| 2 | Model-generated flat fields are unnecessary for admission, completion, Refresh, rollback or persistence. Stored dossiers/manual imports remain flat data structures; that representation is independent of the model mutation contract. |
| 3 | Ordinary flat bootstrap mutation is removed. Persisted/import readers and source-bearing legacy proposal aliases remain where needed; there is no uncited flat mutation compatibility path. |
| 4 | Yes. Assigning generic registration activity to an uncited Species or Background proposal manufactures field provenance. Both the experimental converter and the old direct-live inference are excluded. |
| 5 | The old bootstrap/semantic paths overlapped. Preparation now strips every direct ordinary field, and semantic application runs once. Same-field flat duplicates cannot override semantic proposals. The named-preferred `_modelLedRole` bypass is removed. |
| 6 | Preparation retains NEW semantic rows unchanged while removing direct fields from the focused handler copy. Admission's accepted patch-to-ID outcome is then reused. |
| 7 | The adapted payload supplies original semantic rows, evaluations and observations; the prepared copy supplies focused identity/mechanics. The removed NEW preprocessor no longer drops mannerism rows or rewrites birthday operations between these representations. |
| 8 | Mannerism additions/replacements use `establishment: explicit|reinforced` inside the semantic update for NEW and EXISTING alike. One-off evidence belongs in observations. Missing metadata is diagnosed and is repairable on first contact; code does not count gestures or recognize habit keywords. |
| 9 | Yes, by explicitly requesting reuse of accepted activity excerpts. Existing strict contextual binding remains; wrong addressees, ambiguity and fabricated quotations remain rejected. |
| 10 | Proposals and successful applications are separate outcomes. Rejected proposals remain rejected/partial. A simultaneous field evaluation is invalid and cannot conceal rejection. Successful bounded repair marks the earlier rejection as repaired, without counting it as another applied field. |
| 11 | Completion/Recheck already apply semantic updates. The shared target, sanitizer, audit, ownership and commit path now also handles format repair. |
| 12 | Canonical prompt rules, literal NEW example, parser diagnostics, model contract v7, core contract and migrated tests use semantic updates. No runtime text-rewriting shim remains. |
| 13 | Active fuzzy memory merging also inferred event equivalence using stopwords, event verbs and token similarity. It is replaced by exact normalized-text deduplication plus model-owned targeted refinement. Unused lexical relationship interpretation helpers are removed. Identity matching, exact excerpt matching and owned-source replay deduplication remain mechanical safeguards. |
| 14 | Yes. Release 0.5.36 and model contract 7; persisted state/settings schemas remain 1 and storage identity remains `npc_state_beta.v3`. No data rebuild or historical rescan is performed. |
| 15 | Remove duplicate mutation/prompt paths, preserve the accepted identity handoff, extend the existing bounded completion phase for format drift, and require field-specific model evidence. No new store, setting or semantic classifier is needed. |

## Regression coverage

`tests/v0536-unified-contract.test.mjs` exercises the real scanner and host entrypoint/engine/storage serialization paths with controlled provider responses. Existing relevant tests were migrated to source-cited fixtures or explicit flat-rejection expectations; unrelated safety assertions remain.

| Brief regression | Coverage |
| --- | --- |
| A: Linnea lexical overlap | Visible Personality/Background survive structured vocabulary overlap; existing v0.5.35 Linnea source-cited tests remain. |
| B: structured-only sleeves | v0.5.34 negative fixture now cites the World_State source explicitly; Appearance is rejected while visible registration memory survives. |
| C: repeated authorized fact | Visible sleeves remain accepted when repeated in an excluded block. |
| D: World_State live authority | Location/Status survive duplication in an excluded control block. |
| E: Inner Chatter | Mood/Goal accept private sources; Speech/Behavioral Profile reject those same sources. |
| F: Maren first pass | Captured flat provider object is tested separately from an authored source-cited counterpart using the supplied scene. Role, Background, apparent age, Appearance, Personality, consolidated Behavior, Speech, Mood, Location, narrowed Goal, Status and registration Memory persist in the counterpart. One-off card-dealing stays an observation. |
| G: Current Dynamic | The counterpart includes the original summary quotes plus one original accepted activity excerpt. Summary persists with all meters/progress zero and no relationship history. |
| H: wrong addressee | Existing named/unnamed-other-customer, ambiguous binding and fabricated quotation tests remain strict; no summary evidence injector was added. |
| I: isolated mannerism | Missing establishment is rejected on first contact, repair and manual Recheck. Explicit/reinforced semantic proposals use the same validator. |
| J: structured durable canon | World_State-only Background/Appearance/Personality and private-source visible profile remain rejected. |

Additional cases cover uncited Species and named-preferred Role, metadata preservation, duplicate direct/semantic fields, malformed JSON consuming the repair budget, conflicting evaluation accounting, typed/wrong-message/fabricated sources, edited/swiped/switched-chat repair responses, generated versus explicit/locked birthdays, and separate memory events with differing dates even after a long shared prefix.

The original captured provider object is preserved in `tests/fixtures/v0536-maren-captured.json`. The supplied request contains rendered evidence sections, not the original complete raw message wrappers or excluded control-block bodies. The host fixture reconstructs those wrappers from the supplied visible/World_State/Inner_Chatter text and labels that limitation. In that reconstruction, old Status persisted despite the reported live loss; this review does not assert that every reported missing field had the same cause. No exact Linnea live payload was supplied, so its coverage is representative rather than a claimed exact replay.

The full required validation, test, package and prompt-measurement gates must pass on the release tree, followed by ordinary CI on the published main SHA. Host tests use simulated provider/storage APIs and do not establish live Gemini compliance or modify actual NPC State data. A live SillyTavern/provider smoke test remains outside this automated validation.
