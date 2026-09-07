# 0.6.0 consolidation audit

Baseline: v0.5.10, commit `b83ef9f83e613856353045073eeea2084350bbe8`.

## Deletion and replacement inventory

| Removed file/code | Evidence and disposition |
| --- | --- |
| `src/age-progression.js` | No imports, dynamic loads, test references, or asset references. Existing dossier evolution already uses the model semantic validator. The active semantic age/form pipeline and legacy response adapter remain. |
| `src/schema-core.js` | Its only consumer was the schema facade. Merged normalization into `schema.js`, removing the stale release constant and wrapper overrides while preserving schema 1. |
| `src/scanner-core.js` | Replaced by focused `scan-application`, `scan-prompts`, `scan-relationships`, `scan-lifecycle`, `scan-payload`, and `scan-helpers` modules. Public scanner API stays in `scanner.js`; stateful behavior is preserved. |
| `src/editor-top-layer.js` | The promotion function now runs directly after the editor mounts in `ui.js`, covering both button and programmatic opens. Removed the document-wide click listener and bootstrap import. |
| `shortActivityIdentityScope()` | No callers; removed after tracing references. The used short-name uniqueness and identity binding helpers remain, with lifecycle regression coverage. |
| `relationshipAxisIndependencePrompt()` alias | No imports or callers. The actual shared judgment rubric remains in use. |
| Obsolete scan prompt schemas/rules | Removed legacy age/form/profile revision output examples and full-array replacement advice from emitted contracts. Legacy response adaptation remains supported. |
| Bootstrap inline editor CSS | Moved to the main stylesheet; preserved responsive stylesheet ordering and top-layer fallback. |
| `CHANGELOG.md` and `DEVELOPMENT.md` in ZIP | Remain in the repository; omitted from installable archives. Tests, scripts, and history docs were already excluded and remain repository-only. |

No arbitrary unused-CSS purge was attempted: dynamically generated controls and feature bridges still reference their styles. All surviving `src/` files are reachable from the manifest through static imports/reexports, literal dynamic imports, URL assets, or CSS references. Validation checks that invariant for future changes.

## Size comparison

Sizes are exact bytes. Runtime source includes `bootstrap.js` and every checked-in `src/` file, including CSS. Baseline ZIP used stored entries; the new ZIP uses standard DEFLATE. Compression does not imply a corresponding JavaScript execution-speed improvement.

| Measure | 0.5.10 | 0.6.0 |
| --- | ---: | ---: |
| Runtime source files | 44 | 51 |
| Runtime source bytes | 893,309 | 868,185 |
| Packaged files | 49 | 54 |
| ZIP bytes | 974,003 | 235,057 |

Source bytes decrease by 2.81%. ZIP bytes decrease by 75.87%. File count grows because responsibilities were split into smaller modules; it is not the cleanup success metric.

## Compatibility and verification

- Existing persisted schema/settings schema remain 1; model contract remains 3 and foreground contract 4.
- Keep `npc_state_beta.v3`, sidecar identities, unknown settings, custom criteria, portrait templates, and old structured response compatibility.
- Injection budgets below 1600 now normalize to the already-enforced runtime floor and display consistently. Explicit injection depth zero is preserved. Invalid numeric inputs normalize centrally.
- Existing 79 tests pass, with 12 additional tests (91 total) covering settings/upgrade preservation, policy consistency, prompt modes, legacy age payloads/manual locks, lifecycle short names, editor mount/fallback, dependency completeness, compressed archive extraction, and host-stub installation.
- Validation checks syntax, release/manifest consistency, SillyTavern import depth, missing runtime dependencies, and unused source files.
- Archive tests compare every decompressed file byte-for-byte with source. Fresh/upgraded loading tests exercise the public API using a local host API stub at the real SillyTavern relative directory depth.
- This environment did not provide a running SillyTavern instance or a live model connection. Browser layout, live routing/provider responses, and end-to-end generation latency were not measured. Existing routing, recovery, branch, and nonblocking-processing regression coverage remains enabled.
