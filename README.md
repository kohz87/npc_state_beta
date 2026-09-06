# NPC State Beta

NPC State is a SillyTavern extension that maintains durable NPC continuity while leaving narrative interpretation to the selected language model. Release 0.5.1 is a patch over the consolidated 0.5.x runtime that fixes release-label drift in the settings UI and model-facing facades.

## Release 0.5.1

The current source of truth is `src/`. A clean checkout is sufficient to validate, test, and package the extension. The build no longer clones an older repository or replays historical patch scripts.

Release version, persisted state schema, and model-output contract are intentionally separate:

- Extension release: `0.5.1`
- Persisted state schema: `1` (unchanged)
- Model semantic update contract: `2`

The 0.5.1 patch makes the settings header, settings intro, roster summary, scanner facade, and foreground injection facade derive their release label from the shared `NPC_STATE_VERSION` constant. Existing v0.4.x sidecars and settings continue using their established storage identity. This release does not rename storage keys or require dossier deletion/rebuild.

## Model-led semantic updates

For existing dossiers, the model can emit `semanticUpdates` with `establish`, `refine`, `replace`, or `remove`. The proposal identifies the target field, proposed value or targeted collection changes, concrete source excerpts, and a short explanation.

The model interprets narrative meaning, including whether evidence establishes a first meaningful personality baseline, refines compatible characterization, demonstrates genuine development, corrects canon, retires obsolete information, distinguishes temporary state from durable traits, identifies age/date semantics, judges fantasy maturation, recognizes names/roles, and interprets directional kinship.

The runtime remains authoritative for structure and mechanics. It validates NPC/field targeting, manual locks, source provenance, stable collection references, deterministic numeric normalization, relationship caps/milestones/inertia/fractional progress, replay protection, lifecycle transitions, stale-result guards, persistence, branch recovery, and collection limits.

Evidence validation establishes that a cited excerpt exists in the permitted source window. It does not independently claim the model's semantic interpretation is correct.

## Repairing existing dossiers

Scan and Refresh receive the current personality, speech, behavior profile, mannerisms, canon, forms, and compact prior evidence. They can therefore repair dossiers that were frozen on temporary emergence/sleep observations, for example:

- `Quiet and dormant baseline post-emergence.`
- `Rests in deep, restorative slumber following her emergence.`
- `Unvoiced; currently sleeping.`
- a sleeping wing-folding pose stored as a permanent mannerism

Later grounded evidence may establish the actual baseline or replace/remove obsolete placeholders. Sleeping does not imply muteness. A stale sleeping Status can be retired after awakening. Form-specific habits remain scoped continuity and are not erased merely because the NPC is currently in another form.

Manual field protection remains authoritative.

## Source layout

- `src/` - authoritative runtime source
- `src/model/` - model semantic contract, response adaptation, and model-facing logic
- `src/scanner.js` - model-led scanner facade over deterministic scanner mechanics
- `src/scanner-core.js` - deterministic scan/application mechanics retained from the consolidated runtime
- `src/injection.js` - foreground continuity/model-contract facade
- `src/injection-core.js` - deterministic foreground continuity builder
- `tests/` - deterministic behavioral and compatibility regressions
- `scripts/validate.mjs` - clean-checkout source/import validation
- `scripts/package.mjs` - dependency-free release packaging
- `.github/workflows/ci.yml` - validation, tests, and package artifact generation

Historical v0.4 documentation is retained under `docs/history/`; implementation history remains available in Git.

## Development

Requires Node.js 22 or later for the repository validation/test workflow used in CI.

```sh
npm run validate
npm test
npm run package
```

`npm run package` writes a versioned ZIP under `dist/` containing the extension runtime and release documentation.

See `DEVELOPMENT.md` for architecture, compatibility, and release guidance.

## Integration notes

NPC State preserves the existing SillyTavern nested extension import depth and its established storage/sidecar identity. Separate NPC model requests continue using the selected NPC connection profile without intentionally changing SillyTavern's active main connection. The optional completeness pass remains off unless enabled and is treated as supplemental, non-replaying reconciliation.

Live model quality varies by provider/model. Repository tests use deterministic model-response fixtures to verify parsing/application behavior; they do not constitute live-provider accuracy measurements.
