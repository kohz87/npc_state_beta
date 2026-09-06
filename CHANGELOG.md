# Changelog

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
