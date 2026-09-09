# NPC State Beta

NPC State is a SillyTavern extension that maintains durable NPC continuity while leaving narrative interpretation to the selected language model. The extension owns structure, evidence boundaries, deterministic relationship mechanics, history ownership, persistence, rollback, and recovery.

## Release 0.5.34

0.5.34 tightens first-admission evidence authority, retains isolated profile observations without promoting them to habits, and safely reuses accepted participant bindings for neutral Current Dynamic summaries.

0.5.33 makes first-contact follow-up explicit instead of unconditional. **Off** is the default, including when the setting is absent on upgrade. **Missing evaluations only** rechecks only eligible blank fields on newly admitted NPCs that the first response neither proposed nor explicitly evaluated. **Recheck unknown fields** may also revisit eligible blanks explicitly marked insufficient. Any automatic follow-up uses the same complete current exchange, exact admitted stable IDs, existing locks/source validation, and the same final persistence/checkpoint boundary. A shared two-request budget includes malformed-JSON retries, so spending the retry budget skips follow-up rather than issuing a third request. Individual dossiers also offer a current-exchange-only **Recheck missing details** action that is distinct from historical Refresh. Deterministically generated birthdays remain internally tracked but are presented and supplied to normal scanner continuity as ordinary stable birthdays, without a `generated` label.

Recent 0.5.x refinements retained by this release include:

- **0.5.13:** grounded first-pass dossier extraction for descriptive apparent age, concise workplace/affiliation background, neutral first-contact Current Dynamic, appearance fidelity, and non-habitual behavior evidence.
- **0.5.14:** model-led apparent-age ranges such as `~20-30`, resolved deterministically to one stable per-NPC value such as `~24` without converting Apparent Age into chronological Actual Age.
- **0.5.15:** repository/runtime hygiene and portrait-ready overall appearance synthesis.
- **0.5.16:** independent bounded candidate accounting, observation-only profile evidence, and model-led profile consolidation/refinement semantics while retaining one post-response scanner request.
- **0.5.17:** correct `profileObservations` array examples, source-first observation/application dedupe, and exact claimed-message excerpt validation.
- **0.5.18:** compact shared scanner/domain rules, response examples, relationship/lifecycle instructions, and semantic-update guidance; add a reproducible final-request measurement matrix.
- **0.5.19:** correct compact lifecycle property names and restore concise collection/form targeting shapes with parser-to-application regressions.
- **0.5.20:** rebalance compact first-pass sufficiency for visible life-stage, repeated behavior/mannerism evidence, and exact Current Dynamic target binding without adding another scan pass.
- **0.5.21:** distinguish current Role from durable Background affiliation/employment and correct the contradictory first-pass example.
- **0.5.22:** accept coherent source-owned Current Dynamic evidence through already accepted identity/activity binding, remove lexical explanation matching from the descriptive-only path, and make compact examples behaviorally coherent.
- **0.5.23:** allow Current Dynamic to reuse already validated player-facing activity without duplicating narrator evidence, while preserving same-source ownership and wrong-addressee rejection.
- **0.5.24:** normalize supported presentation-only markup for exact evidence matching so real cross-tag identity/activity/Current Dynamic excerpts survive without weakening source or dialogue boundaries.
- **0.5.25:** accept exact verbatim slices from within one longer quoted-dialogue segment even when the model adds outer quote delimiters, without allowing cross-segment or narration bridging.
- **0.5.26:** make Current Dynamic target binding POV-independent by combining source-role-aware direct PC references with same-source accepted exchange activity reuse, while preserving wrong-addressee and unowned-evidence rejection.
- **0.5.27:** admit first-seen contextual role labels through their exact validated unique identity anchor in Balanced mode, without weakening identity collisions, structured evidence firewalls, or stricter admission settings.
- **0.5.28:** unify visible identity anchors with optional current-World_State canonical-name enrichment and retire the older deterministic role-head bridge.
- **0.5.29:** carry accepted World_State canonical-name enrichment into zero-delta Current Dynamic target binding without weakening other summary-target safeguards.
- **0.5.30:** retain source-owned profile observations for newly admitted NPCs and clarify first-contact profile establishment without adding another scan.
- **0.5.31:** re-check permitted current evidence before `insufficient`, and expose synthetic birthday provenance in compact scanner context and dossier UI.
- **0.5.32:** add a new-admission-only current-exchange completion request inside the same automatic operation, and return deterministic birthday provenance to internal-only bookkeeping.
- **0.5.33:** make that follow-up optional with an Off default, exact target-field completion coverage, a shared two-request budget, per-request estimates, and a manual current-exchange missing-detail recheck.

The automatic workflow remains:

`compact continuity -> visible roleplay response -> dedicated post-response scan -> optional configured first-contact follow-up -> validate/apply -> guarded persistence/checkpoint -> refresh continuity/UI`

Roleplay generation does not emit `<npc_state_v1>` or other NPC JSON. Foreground injection is continuity-only. `autoScan=true` means one logical dedicated scan operation after each completed assistant revision. With first-contact follow-up Off, a valid first response uses one provider request. When a follow-up mode is enabled, the same automatic operation may use one additional request for eligible newly admitted fields, but the shared cap is two requests total including malformed-JSON retries. Duplicate host completion events share the same logical job; edits, swipes, deletion, branch changes, and chat switches invalidate stale work.

Before the next ordinary generation, NPC State uses SillyTavern's awaited generation interceptor to settle the preceding response's owning scan and rebuild continuity. The recursion bypass exists only while invoking the scanner's own host generation call; ordinary roleplay work cannot inherit scanner privileges. A failed or timed-out owning scan exposes an actionable Retry state and aborts the attempted next generation instead of silently using unsynchronized state.

### Scanner scope

Routine automatic Scan and manual **Scan current cast** treat the latest completed assistant message and its preceding user message as new-event evidence. At most two earlier non-system messages may be supplied as bounded reference context for antecedents; they are not new-event evidence. Relevant identity context accepts exact names/aliases and unique unambiguous short-name mentions, including explicitly mentioned archived/deceased dossiers; ambiguous short names are never guessed. The same bounded existing-NPC candidate set is supplied to the model and audited afterward. Candidate accounting is separate from physical presence/activity and from field-level completeness, so an omitted NPC cannot disappear from coverage merely because the model also omitted it from activity arrays. Unrelated roster growth does not expand every routine scan.

**Refresh** reconciles one NPC over bounded history. Historical recovery reconstructs surviving exchanges sequentially from a trustworthy baseline. All story mutations continue through the same guarded commit/checkpoint path.

Scanner input sizing is measured separately from foreground continuity and scanner output allowance. npm run measure:scan-prompts uses the existing local conservative estimator (ASCII/3.5 + non-ASCII*1.1) and the exact scanner system wrapper. 0.5.29 does not change scanner prompt text; the current stable matrix is 6,386 tokens for the minimal one-NPC fixture, 6,389 for a rich first encounter, 7,453 for three active plus one mentioned NPC, 6,713 for observation development, 8,055 for dense collections/locks/forms, 6,591 with 1,000 stored NPCs but one relevant NPC, 7,118 for structured blocks plus custom criteria, and 4,794 for targeted Refresh. The dense fixture is reported honestly against the approximate 7,500-token engineering target; no current-evidence truncation rule is introduced. A deliberately long current response remains about 21,342 estimated tokens because the current scene is preserved in full. These are local engineering estimates, not provider-reported usage.

### Dossier completeness and safety

The scanner contract supports realistically populated new NPCs, compact existing-candidate accounting, explicit insufficient-evidence outcomes, field-level evaluation metadata, observation-only profile evidence, and zero-delta Current Dynamic. Unsupported facts remain unknown. A sparse valid payload may still commit its supported facts, while candidate/field diagnostics report unaccounted work separately from persistence success. Older compatible responses may still apply valid proposals but cannot falsely report complete candidate coverage.

Current Dynamic may establish a neutral professional, transactional, adversarial, supervisory, or other role-defined relationship even when Trust/Affection/Desire/Tension remain zero. A newly established or materially changed summary uses bounded exact current-source evidence: one excerpt may bind NPC and player directly, or a small coherent set may reuse the already accepted NPC identity/activity binding from the same owned exchange. PC binding is POV-independent: USER first person, ASSISTANT narrator second person, explicit PC names, and the model's already accepted same-source exchange activity can establish participant context without a hardcoded pronoun requirement. Unrelated passages, conflicting known addressees, fabricated/wrong-message excerpts, and isolated quoted second-person dialogue that is not part of the accepted NPC activity remain rejected. The explanation is descriptive model interpretation and need not copy the source wording. Numeric relationship movement is separate and still requires its own stricter validated axis evidence.

Apparent Age is visual, not chronological. Direct visible life-stage wording such as child, adolescent, young adult, middle-aged, or elderly is positive evidence even without a number. The model may return `~N` for a specific-looking age or a semantic interval such as `~20-30` for a defensible visible band; the backend uses the NPC's stable identity to choose one reproducible inclusive value and persists only `~N`. No fixed English phrase-to-range dictionary is used. Existing/manual descriptive Apparent Age values remain compatible. Actual Age never derives from Apparent Age.

New-NPC bootstrap, existing semantic updates, manual/import boundaries, and persisted normalization share field-aware value rules. Malformed nested collection members, form selectors, scalar objects, and coercive manual numeric values are rejected before lossy normalization rather than becoming strings such as `[object Object]`.

## Settings

Important settings include:

- **Auto scan**: one dedicated post-response scan operation.
- **First-contact follow-up**: Off by default; optionally recheck only missing evaluations or recheck eligible unknown fields for newly admitted NPCs. A follow-up consumes the same two-request automatic-operation budget and may find no additional information.
- **Inject NPC continuity**: independent continuity context for roleplay generation.
- **NPC scan connection profile**: optional alternate model route for scanner requests. A missing/changed configured profile is an explicit error, not silent fallback to the main roleplay connection.
- **Scanner output tokens**: adjustable up to 15,000.
- **Injection budget / NPC limit / depth**: continuity budgeting and selection. The budget supports values down to 256 because it no longer carries an extraction schema.
- Admission, birthday generation, dossier limits, relationship criteria/caps, portraits, stale retention, and recovery controls remain supported.

Obsolete `scanAfterEachResponse`, `fallbackScan`, and `newNpcHistoryEnrichment` settings are retired during idempotent settings normalization. An explicit `autoScan=false` stays false.

## Relationship and profile behavior

Existing dossiers evolve through the single `semanticUpdates` channel (`establish`, `refine`, `replace`, `remove`). The model judges narrative meaning; deterministic code validates source ownership, target identity, durability, manual locks, collection/form targeting, and permitted fields. Personality, behavioral profile, speech, and mannerisms may also record bounded grounded observations without forcing an immediate dossier mutation. Observation-only and applied-change evidence share the existing `profileEvolutionEvidence` store and commit through the same guarded transaction/checkpoint. Mechanical observation identity uses the owned source event plus field and normalized concept, so distinct concepts can share one excerpt; an applied update that reuses an already observed source excerpt does not manufacture another evidence record. Every cited excerpt is validated against its claimed permitted message before source ownership is derived.

Temporary states such as sleep, unconsciousness, one-off poses, injury, stress, or momentary mood do not automatically become permanent personality/speech. Later grounded evidence may enrich or replace an obsolete placeholder. Behavioral Profile and Mannerisms may consolidate substantially overlapping established entries through targeted collection refs while preserving distinct facts and unrelated entries. Semantic overlap remains model-led rather than hardcoded in English dictionaries.

Player relationship meters remain deterministic: Trust, Affection, Desire, and Tension use configured caps, gates, inertia, fractional progress, milestones, evidence history, and replay protection.

## Rollback and persistence

NPC State uses complete story snapshots and canonical history ownership. Tail deletion restores an exact surviving checkpoint when available. Middle-history divergence restores a verified prefix and reconstructs each surviving assistant exchange in order. A missing trustworthy baseline blocks safely instead of pretending a partial relationship rollback is complete.

User-owned portraits, locks, manual corrections, importance, and suppression tombstones retain their defined rollback behavior. Per-axis manual relationship corrections remain absolute durable ownership records independent of bounded display history. Sidecar writes keep revision/CAS and writer-lock protections.

## Compatibility

Current boundaries:

- Release label: **0.5.33**
- Persisted state schema: **1**
- Settings schema: **1**
- Model semantic contract: **6**
- Foreground continuity contract: **8**
- Storage identity: **`npc_state_beta.v3`**

No database reset, rebuild, or storage-key migration is required. Automatic historical enrichment/backfill remains intentionally deferred; this release does not add a raw-history window or follow-up scanner request.

Old `<npc_state_v1>` text is ignored/stripped only where needed for historical canonicalization and prompt cleanliness so older chats do not diverge merely because transport text remains. New automatic processing does not consume embedded payloads.

Supported older model-response aliases are normalized once at the scanner boundary into the canonical semantic pipeline. Tiny retired public diagnostic entry points may remain as compatibility tombstones, but the obsolete embedded-capture/completeness subsystems themselves are not present.

SillyTavern's third-party extension updater is Git-based: it checks whether the installed repository is current and pulls the tracked branch when needed. The 0.5.x presentation label does not require uninstall/reinstall or data deletion.

## Public APIs and diagnostics

Manual `NPCState.scan()`, targeted Refresh/import APIs, dossier editing, branch/recovery actions, and bounded operation diagnostics remain available. `NPCState.scanStatus()` exposes the current automatic job state (`idle`, `queued`, `scanning`, `saving`, `complete`, `partial`, `failed`, or `blocked`) and `NPCState.retryAutoScan()` retries the latest failed automatic job.

Legacy capture/completeness diagnostic entry points return small documented retirement responses rather than keeping the obsolete capture subsystem alive.

`docs/core-contract.md` is the authoritative behavioral specification. `DEVELOPMENT.md` contains repository workflow and responsibility boundaries. Historical release material under `docs/history/` is retained for reference only.

## Development

Requires Node.js 22 or later:

```sh
npm run validate
npm test
npm run package
```

Packaging includes only reachable runtime files plus manifest/license/README. Tests, scripts, development notes, and history documents are excluded from the installable ZIP.
