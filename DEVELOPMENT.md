# NPC State Beta development

The authoritative behavior and ownership specification is [`docs/core-contract.md`](docs/core-contract.md). Do not duplicate its runtime rules here. If implementation and older release notes disagree, verify current behavior with tests and update the core contract deliberately.

## Current boundaries

- Extension release: `0.5.31`
- Persisted state schema: `1`
- Settings schema: `1`
- Model semantic update contract: `6`
- Foreground continuity contract: `8`
- Sidecar/settings storage identity remains `npc_state_beta.v3`

The 0.5.x release line intentionally keeps the newer consolidated architecture under the public 0.5.x numbering. A release bump does not require a persisted schema bump. Change a persisted schema only for an actual incompatible storage contract.

## Responsibility map

- `src/schema.js`: persisted state normalization, ownership metadata and snapshot shape.
- `src/model/dossier-fields.js`: ordinary semantic field registry.
- `src/model/semantic-updates.js`: ordinary semantic validation/application and coverage diagnostics.
- `src/profile-observations.js`: bounded evidence-only profile observations using accepted patch identity and semantic source validation.
- `src/scan-contract.js`: shared response envelope, identity classifications, and literal parser-tested examples.
- `src/scanner.js` plus `src/scan-*.js`: model response boundary and focused identity/relationship/lifecycle/graph handlers.
- `src/foreground-contract.js`, `src/foreground-context.js` and `src/injection.js`: continuity-only foreground selection, compaction and local prompt diagnostics.
- `src/post-response-coordinator.js`: one logical automatic scan job per completed assistant revision and next-turn settlement status.
- `src/engine.js`: operation ownership, shared story commit boundary, persistence orchestration and recovery sequencing.
- `src/branches.js`: canonical history identity, full-state checkpoints, restoration and explicit rebase behavior.
- `src/storage.js`: sidecar persistence, revision/CAS validation and writer locks.
- `src/operation-diagnostics.js`: bounded runtime-only observation of authoritative operations.
- `src/index.js`: SillyTavern lifecycle wiring and public API.

Do not move these responsibilities into one giant module. Share helpers only where semantics are actually identical.

## Compatibility and hygiene rules

Preserve public `NPCState` APIs, settings keys, sidecar identity, routing semantics, supported bundle/import formats and conservative legacy response adaptation unless a release explicitly migrates them. Legacy compatibility belongs at a boundary, not as a parallel mutation path.

Retired public diagnostic entry points may remain as tiny compatibility tombstones when removing them would break callers, but the obsolete subsystem behind them must stay absent. Historical transport stripping and shipped-default settings migrations remain valid only where they protect existing chats/settings; do not reinterpret them as current extraction workflows.

Do not accept current dossier state as a fabricated historical baseline. Do not bypass sidecar revision conflicts. Do not make automatic history reconciliation equivalent to explicit preserve-state rebase.

Keep release-facing documentation synchronized with the manifest/runtime release. `npm run validate` enforces the current release heading in `README.md`, the current boundary in this file, and the first release entry in `CHANGELOG.md`.

## Repository workflow

Requires Node.js 22 or later. From a clean checkout run:

```sh
npm run validate
npm test
npm run package
npm run measure:scan-prompts
```

`npm run validate` checks JavaScript syntax, manifest/release consistency, release-document consistency, runtime dependency reachability and unused source files. `npm test` contains behavioral/compatibility regressions. `npm run package` produces the installable ZIP from reachable runtime files plus manifest, license and README. `npm run measure:scan-prompts` reports the stable scanner fixture matrix using the existing local conservative estimator and the exact scanner system wrapper; it is not a provider token-usage claim. Tests, scripts and development/history documents do not ship in the ZIP.

Before release:

1. Re-read current remote `main` and check for concurrent work.
2. Run the full required workflow on the exact candidate tree.
3. Inspect the final diff and packaged runtime.
4. Synchronize release labels without changing storage schema versions unnecessarily.
5. Fast-forward or squash-merge into `main` without force-pushing or overwriting newer work.
6. Run ordinary CI on the exact final `main` SHA.

Repository tests use controlled host/storage/model simulations. They do not modify a user's NPC State database and do not constitute a live SillyTavern/provider smoke test.
