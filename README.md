# NPC State Beta

NPC State is a SillyTavern extension that maintains durable NPC continuity while leaving narrative interpretation to the selected language model. The extension owns structure, evidence boundaries, deterministic relationship mechanics, history ownership, persistence, rollback, and recovery.

## Release 0.5.12

This release intentionally resets the **public release label** from the 0.7.x development line to the next unused 0.5.x patch. It does **not** restore old source, downgrade the sidecar, or change the persisted/settings schema. Existing `npc_state_beta.v3` data continues in place.

The automatic workflow is now simpler:

`compact continuity -> visible roleplay response -> one dedicated post-response scan -> validate/apply -> guarded persistence/checkpoint -> refresh continuity/UI`

Roleplay generation no longer has to emit `<npc_state_v1>` or any other NPC JSON. Foreground injection is continuity-only. `autoScan=true` means one dedicated scanner request after each completed assistant revision. Duplicate host completion events share the same logical job; edits, swipes, deletion, branch changes, and chat switches invalidate stale work.

Before the next ordinary generation, NPC State uses SillyTavern's awaited generation interceptor to settle the preceding response's owning scan and rebuild continuity. The recursion bypass exists only while invoking the scanner's own host generation call; it is not held for the provider request lifetime, so ordinary roleplay work cannot inherit scanner privileges. A failed or timed-out owning scan exposes an actionable Retry state and aborts the attempted next generation instead of silently using unsynchronized state.

### Scanner scope

Routine automatic Scan and manual **Scan current cast** treat the latest completed assistant message and its preceding user message as new-event evidence. At most two earlier non-system messages may be supplied as bounded reference context for antecedents; they are not new-event evidence. Relevant identity context accepts exact names/aliases and unique unambiguous short-name mentions, including explicitly mentioned archived/deceased dossiers; ambiguous short names are never guessed. Unrelated roster growth still does not expand every routine scan.

**Refresh** still reconciles one NPC over bounded history. Historical recovery still reconstructs surviving exchanges sequentially from a trustworthy baseline. All story mutations continue through the same guarded commit/checkpoint path.

### Dossier completeness and safety

The scanner contract demonstrates a realistically populated new NPC, explicit insufficient-evidence outcomes, field-level evaluation metadata, and a zero-delta Current Dynamic. Unsupported facts remain unknown. A sparse valid payload may still commit its supported facts, but diagnostics report unaccounted fields separately from persistence success.

Current Dynamic evidence may bind an NPC through an unambiguous short identity and the player through a full/unique short identity or narrator-addressed second person outside quoted dialogue. Exact excerpts are resolved within their original permitted source before quote/addressee checks, so shortening another character's quoted speech cannot turn quoted `you` into the player. Ambiguous aliases, wrong recipients, and unrelated NPC interactions remain rejected. Numeric relationship movement is independent and may remain zero.

New-NPC bootstrap, existing semantic updates, manual/import boundaries, and persisted normalization share field-aware value rules. Malformed nested collection members, form selectors, scalar objects, and coercive manual numeric values are rejected before lossy normalization rather than becoming strings such as `[object Object]`.

## Settings

Important settings retained by 0.5.12 include:

- **Auto scan**: one dedicated post-response scanner request.
- **Inject NPC continuity**: independent continuity context for roleplay generation.
- **NPC scan connection profile**: optional alternate model route for scanner requests. A missing/changed configured profile is an explicit error, not silent fallback to the main roleplay connection.
- **Scanner output tokens**: adjustable up to 15,000.
- **Injection budget / NPC limit / depth**: continuity budgeting and selection. The budget now supports values down to 256 because it no longer carries an extraction schema.
- Admission, birthday generation, dossier limits, relationship criteria/caps, portraits, stale retention, and recovery controls remain supported.

Obsolete `scanAfterEachResponse`, `fallbackScan`, and `newNpcHistoryEnrichment` settings are retired during idempotent settings normalization. An explicit `autoScan=false` stays false.

## Relationship and profile behavior

Existing dossiers evolve through the single `semanticUpdates` channel (`establish`, `refine`, `replace`, `remove`). The model judges narrative meaning; deterministic code validates source ownership, target identity, durability, manual locks, collection/form targeting, and permitted fields. Applied personality, behavioral-profile, speech, and mannerism changes append bounded source-owned `profileEvolutionEvidence`, so later exchanges can distinguish accumulated development from same-source retries.

Temporary states such as sleep, unconsciousness, one-off poses, or momentary mood do not automatically become permanent personality/speech. Later grounded evidence may enrich or replace an obsolete placeholder. Collection entries can be edited at capacity through stable refs without evicting unrelated items.

Player relationship meters remain deterministic: Trust, Affection, Desire, and Tension use configured caps, gates, inertia, fractional progress, milestones, evidence history, and replay protection. Neutral professional/other Current Dynamic summaries may update at zero scores without fabricating relationship history.

## Rollback and persistence

NPC State uses complete story snapshots and canonical history ownership. Tail deletion restores an exact surviving checkpoint when available. Middle-history divergence restores a verified prefix and reconstructs each surviving assistant exchange in order. A missing trustworthy baseline blocks safely instead of pretending a partial relationship rollback is complete.

User-owned portraits, locks, manual corrections, importance, and suppression tombstones retain their defined rollback behavior. Per-axis manual relationship corrections remain absolute durable ownership records independent of bounded display history. Sidecar writes keep revision/CAS and writer-lock protections.

## Compatibility

Current boundaries:

- Release label: **0.5.12**
- Persisted state schema: **1**
- Settings schema: **1**
- Model semantic contract: **6**
- Foreground continuity contract: **8**
- Storage identity: **`npc_state_beta.v3`**

No database reset, rebuild, or storage-key migration is required. Old `<npc_state_v1>` text is ignored by canonical history fingerprints so historical chats do not diverge merely because transport text remains, but new automatic processing does not consume embedded payloads.

SillyTavern's third-party extension updater is Git-based: it checks whether the installed repository is current and pulls the tracked branch when needed. The 0.5.x presentation label therefore does not require uninstall/reinstall or data deletion.

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

Packaging includes only reachable runtime files plus manifest/license/README. Tests, scripts, review ledgers, staging material, and history documents are excluded from the installable ZIP.
