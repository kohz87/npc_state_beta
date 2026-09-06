# Development

## Authoritative source

`src/` is the checked-in source of truth. Do not reconstruct the runtime from an older repository, version-numbered source folder, or historical patch chain.

The repository intentionally keeps the consolidated deterministic scanner/injection mechanics in `scanner-core.js` and `injection-core.js`, with small facades in `scanner.js` and `injection.js` that provide the current model-led contract. This avoids duplicating persistence/relationship/lifecycle mechanics while keeping model semantics isolated and testable.

## Version boundaries

Three versions serve different purposes:

- Release version: `0.5.0` in `manifest.json` and the exported runtime app version.
- Persisted state schema: `1`. Do not bump it for behavior/prompt changes that remain load-compatible.
- Model-output contract: `2` in `src/model/semantic-updates.js`. Bump when the model-facing structured update contract changes incompatibly or materially.

Do not rename existing storage keys, sidecar identity, or supported import formats as part of source organization work.

## Semantic architecture

The language model interprets narrative meaning. Existing-dossier durable changes should use `semanticUpdates`:

- `establish`: populate a genuinely unestablished field.
- `refine`: add compatible precision while leaving the existing characterization true.
- `replace`: correct an outdated value or represent genuine development/change.
- `remove`: explicitly retire unsupported/abandoned information.

Each automatic update needs grounded source excerpts from the supplied context. Collection edits should target stable entry refs or exact expected values. Omission preserves existing state; empty arrays are not destructive authorization.

`src/model/legacy-semantic-adapter.js` is a maintained compatibility adapter for older structured model response shapes. It translates the model's already-structured judgment into v2 operations so old backend English phrase gates do not regain semantic authority.

The backend remains deterministic for structure, targets, manual locks, provenance bounds, numeric mechanics, relationship progression, lifecycle safety, stale-result rejection, persistence, collection limits, and branch/recovery consistency.

## Context and history safety

Model prompts must remain bounded. Full scan/recovery/Refresh may use their supplied history window but must never pull future messages into historical reconstruction. Foreground embedded capture may cite the current exchange with a null message id because the assistant response is not committed yet; the runtime binds/checks that evidence against the committed exchange.

A saved model summary is continuity context, not independent proof of itself.

Completeness is supplemental. It must not duplicate relationship scoring, lifecycle changes, narrative-turn advancement, aging, memories, or development evidence already committed for the response.

## SillyTavern integration

The extension is nested under SillyTavern's extension hosting path. Preserve the established relative import depth to `extensions.js` and `script.js`; `scripts/validate.mjs` checks these paths.

Separate model requests must use the configured NPC connection profile without globally changing the user's main active connection. Foreground embedded capture stays on the normal roleplay generation path.

Initialization/listener registration must remain idempotent. Do not add polling loops or global observers when an existing event/operation hook can carry the behavior.

## Verification

Run from a clean checkout:

```sh
npm run validate
npm test
npm run package
```

The CI workflow runs the same sequence under Node 22 and uploads the generated release ZIP.

Tests that feed deterministic model-response JSON prove application, validation, persistence-shape, and replay behavior. They do not prove live provider/model judgment quality. If a live integration test is available, report it separately from deterministic fixture coverage.

Before release, review:

- manifest/bootstrap/CSS paths
- release/schema/contract version separation
- storage key compatibility
- Scan/Refresh/foreground/completeness prompt context
- manual locks and source validation
- relationship/lifecycle replay protection
- branch preserve/rollback behavior
- stale-operation guards
- package contents and clean-checkout CI
