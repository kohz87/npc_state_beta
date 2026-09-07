# NPC State Beta

NPC State is a SillyTavern extension that maintains durable NPC continuity while leaving narrative interpretation to the selected language model. Release 0.7.5 carries accepted NPC identity through first-pass dossier application and diagnostics so newly admitted characters can be populated in the same response without weakening conflict safety.


## Release 0.7.5

The authoritative maintenance specification is [`docs/core-contract.md`](docs/core-contract.md). It defines seven responsibilities: state/ownership, chat/history identity, model context, update application, commit/persistence, rollback/reconstruction, and diagnostics. `DEVELOPMENT.md` now references that contract instead of carrying a second set of runtime rules.

The ordinary dossier registry records field kind, durability, normalization contract, permitted operations/evidence, first-pass requirements, and manual ownership. First-pass identity/admission now produces one accepted patch-to-dossier binding that ordinary semantic updates, role restoration, and coverage all reuse; unknown model transport ids are never promoted to stored ids, and conflicting id/name bindings fail closed. The v0.7.4 compact per-axis relationship-correction and remediation behavior remains unchanged.

Foreground capture, Scan, Refresh, completeness, structured import, historical recovery, recovery finalization, and branch restoration share the guarded durable commit responsibility. Candidate state is published to consumers only after the post-save ownership check. If recovery finalization loses history ownership, both recovery and branch safety remain blocked, and Resume revalidates completed history before it can report success. Chat renames continue to retarget checkpoint/baseline ownership. No pre-generation model request was added.

A bounded in-memory operation ledger observes the real workflow without storing prompts or chat content. `NPCState.debugStatus()` exposes only a concise operation summary; `NPCState.operationDiagnostics()` opts into detailed local records with source fingerprints/history hashes, selected NPC ids, local prompt estimates, proposal outcomes/reasons, persistence revision, checkpoint/recovery state, and failures. Invalid proposals are reported as rejected with their reason instead of being hidden inside unchanged counts.

Persisted state schema/settings schema remain 1, semantic contract remains 3, and foreground contract remains 4. No database rebuild or storage-key migration is required.

## Release 0.6.3

For every existing NPC selected into foreground context, the minimum budget representation now retains Mood, Location, Goal, and Status. The model compares those stored values with the completed response and uses the same canonical `semanticUpdates` pipeline to establish, replace, or explicitly remove a live value. Unchanged or insufficiently supported values are preserved rather than rewritten for style.

Legacy direct live fields remain accepted only as a bounded response-compatibility format. They are normalized once at the scanner boundary when the proposed value and NPC identity occur together in permitted current evidence; otherwise they are rejected with diagnostics before the ordinary direct fields are stripped. Generic presence/activity evidence no longer grants blanket authority over every live field. World_State remains limited to Location/Status and NPC_Inner_Chatter to Mood/Goal.

Embedded first-pass application now reports dossier coverage gaps, including an omitted live evaluation, without launching a repair request. Optional completeness scanning remains off unless the existing user setting enables it. Swipe identity is also carried through completed-response processing so a stale payload cannot commit to a replacement swipe.


## Release 0.6.0

Settings defaults, numeric bounds, and normalization now have shared definitions used by the runtime and settings controls. Relationship gate/cap instructions derive from the same policy data used by scoring. Scan, Refresh, and completeness build one semantic contract per request; obsolete age/form and replacement-array instructions have been removed. Legacy responses still translate at the compatibility boundary.

Unused age-progression code, the schema override facade, and the editor click bridge have been retired. Scanner responsibilities are separated into prompt, application, relationship, lifecycle, and payload modules. ZIP releases include only reachable runtime files, the manifest, license, and this guide, with standard DEFLATE compression. Tests, tooling, and development/history documents stay in the repository.

The canonical field registry lives in `src/model/dossier-fields.js` and drives the semantic contract, foreground contract, field kinds/durability, and evaluation groups. `currentForm` is now a first-class live semantic field. Full Scan appends only a compact edit-index containing stable collection/form refs and locks instead of serializing the complete dossier roster a second time.

Full Scan, completeness, and historical recovery now validate semantic source excerpts against the same bounded history window supplied to the model. Deliberate Scan/Refresh/recovery also report coverage diagnostics when an expected NPC patch or dossier evaluation group was omitted, while foreground embedded capture stays budget-bounded and best-effort.

Version boundaries:

- Extension release: `0.7.5`
- Persisted state schema: `1` (unchanged)
- Model semantic update contract: `3`
- Settings schema: `1` (unchanged)
- Foreground embedded-capture contract: `4`

No dossier rebuild or storage-key migration is required. Existing settings are normalized in place; an injection budget below 1600 is upgraded to the existing runtime floor, and an explicit injection depth of zero is preserved.

## Release 0.5.8

The checked-in `src/` tree is authoritative. A clean checkout is sufficient to validate, test, and package the extension.

Version boundaries remain independent:

- Extension release: `0.5.8`
- Persisted state schema: `1` (unchanged)
- Model semantic update contract: `2`
- Settings schema: `1` (unchanged; no new settings keys)
- Foreground embedded-capture contract: `3`

Existing v0.4.x/0.5.x sidecars keep their established storage identity. No dossier rebuild or storage-key migration is required.

## Foreground capture and prompt budgets

Foreground roleplay now receives one authoritative NPC State contract from `src/injection.js`. The previous layered path, where a full legacy foreground contract was built and a second semantic-update contract plus a second dossier serialization was appended, has been removed.

One selection pipeline ranks explicitly referenced, present, recently active, and otherwise salient NPCs, then honors the configured injection limit for every dossier-bearing foreground section. Dossier context is serialized once as complete compact JSON. Collection/form entries keep stable edit refs required by `semanticUpdates`; memories, relationships, forms, and history are bounded by whole-entry selection rather than cutting JSON into fragments.

The existing **Injection budget** (`injectBudgetTokens`) is now the total NPC State foreground budget, covering fixed instructions plus dossier/history context. Its stored key and default (`1800`) are unchanged, so no settings migration is required. The effective valid range is `1600` to `8000` estimated tokens. Older saved values below `1600` normalize to `1600`, and the settings control displays the same effective limit. If a future fixed contract itself grows beyond that floor, diagnostics report the real effective minimum.

NPC State does not make a remote tokenizer request on the send path. Diagnostics therefore label counts as a local conservative estimate (`ASCII/3.5 + non-ASCII*1.1`), not exact provider tokens. Prompt results are cached by relevant state/settings/content and invalidated when dossier content or selection inputs change.

## Model-led semantic updates

For existing dossiers, durable semantic changes use `semanticUpdates` with `establish`, `refine`, `replace`, or `remove`. The model decides whether story evidence establishes a first meaningful personality baseline, enriches compatible characterization, demonstrates genuine development, corrects mistaken canon, or retires obsolete information.

Temporary conditions stay distinct from durable characterization. Sleeping, unconsciousness, silence while asleep, one-off reactions, and poses do not become permanent personality or speech merely because they were observed first. Later grounded evidence can replace a frozen sleep/emergence placeholder. A form-specific habit stays scoped to that form unless evidence changes it, and omission from one response is never deletion evidence.

The runtime remains authoritative for structure, permitted fields, NPC/entry targeting, source provenance, manual locks, deterministic numeric normalization, relationship caps/milestones/inertia/fractional progress, replay protection, lifecycle transitions, stale-result rejection, persistence, branch recovery, and collection limits. It does not reintroduce English keyword or arbitrary repetition gates as semantic approval.

`Scan current cast` also has a narrow Current Dynamic repair mode. When an existing NPC's `relationshipSummary` is blank, the manual scan may reconstruct it from already accepted relationship meters, fractional progress, milestones, evidence history, and recent relationship changes. This repair does not replay relationship scoring and never overwrites an existing non-empty summary merely to rephrase it.

Current Dynamic evolution is no longer gated on a score actually moving. For exchange-active NPCs, a model-proposed `relationshipSummary` may persist when it is supported by the current stored relationship depth and the same grounded current-exchange relationship proposal, even if numeric application is blocked as duplicate/replay, capped, gated, or absorbed by inertia. Ordinary `impact:none` turns cannot stylistically rewrite it. Targeted Refresh can also reconcile a missing or materially stale Current Dynamic from its supplied history without changing relationship scores.

To avoid making Full Scan perform relationship-summary reconciliation across the entire stored cast, the scan roster now includes `relationshipSummary` only for NPCs who are already present or explicitly referenced in the current exchange. The rest of the continuity roster remains available for identity, lifecycle, profile, and other reconciliation, while irrelevant off-screen Current Dynamic prose is omitted. Targeted Refresh and explicit current-cast repair still receive the required relationship-summary context.

## Routing and response lifecycle

Normal roleplay and embedded `<npc_state_v1>` capture remain part of the main roleplay generation. Full scans, Refresh, recovery, historical rebuild, and optional post-response completeness requests may use the configured NPC connection profile. The alternate profile path does not intentionally change or fall back to the active main connection.

Post-response embedded/completeness work is started without awaiting it from the `MESSAGE_RECEIVED` event handler. Completeness remains optional, starts only after the assistant response exists, and receives stale fingerprints/swipe identity so discarded background results cannot overwrite a newer branch or edit.

## Diagnostics and latency interpretation

Opt-in diagnostics are available through the existing `NPCState.debugStatus()` console API and report local extension facts only:

- fixed instruction, dynamic-context, and total character counts
- estimated tokens and estimate method
- selected NPC count/ids and configured/effective budgets
- prompt construction time and cache hit status
- background scan state/completeness state and configured scan route id without credentials

NPC State does not currently own reliable hooks for browser request dispatch, provider first response data, or first visible token/paint across providers. Those phases are therefore reported as unavailable rather than inferred.

A smaller extension prompt can reduce prompt-processing work, but it does not prove or promise that an observed 15–20 second delay will disappear. If the browser generation request is dispatched immediately, remaining time can include SillyTavern server/proxy processing, provider queueing, prompt ingestion, model reasoning, and streaming/render behavior outside NPC State's measured local construction time.

## Source layout

- `src/` - authoritative runtime source
- `src/model/` - semantic update contract and compatibility response adaptation
- `src/injection.js` - single foreground orchestration/cache/diagnostics entrypoint
- `src/foreground-contract.js` - concise authoritative embedded-capture/model-led update contract
- `src/foreground-context.js` - one NPC selection and complete-entry dossier compaction pipeline
- `src/foreground-budget.js` - local estimate and total-budget normalization
- `src/scanner.js` - public scan API and single response-application coordinator
- `src/scan-*.js` - focused prompt, application, evidence-helper, relationship, lifecycle, and payload modules
- `src/settings.js` / `src/settings-contract.js` - settings registry and numeric validation/UI metadata
- `src/relationship-rules.js` - numeric policy shared by scoring and model instructions
- `tests/` - behavioral and compatibility regressions
- `scripts/validate.mjs` - clean-checkout source/import validation
- `scripts/package.mjs` - dependency-free release packaging
- `.github/workflows/ci.yml` - validation, tests, package generation, and artifact upload

Historical v0.4 documentation is retained under `docs/history/`.

## Development

Requires Node.js 22 or later for the repository workflow.

```sh
npm run validate
npm test
npm run package
```

See `DEVELOPMENT.md` for architecture and release guidance.

Live model quality varies by provider/model. Deterministic fixtures verify parsing/application behavior; they are not live-provider latency or judgment measurements.


### Message-linked rollback

NPC State links story mutations to canonical chat lineage and full-state checkpoints. Tail deletion restores the matching snapshot directly; middle deletion restores a verified prefix and reconstructs the surviving suffix in order. User-owned presentation/locks/manual overrides are preserved, while story-derived memories, live state, canon, relationships, graph state, presence, and bookkeeping roll back with their source history. If retained history is insufficient, the extension blocks normal scanning and requires recovery rather than guessing.
