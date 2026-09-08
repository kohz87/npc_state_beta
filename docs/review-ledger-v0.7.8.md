# v0.7.8 review ledger

`docs/core-contract.md` remains the authoritative behavioral specification. This development ledger is excluded from the installable package.

## Final independent review

Candidate reviewed: `7818b2afe0329086a3b7e1e57e91c0a6cdf3d568`

Scope and methods:
- Re-read fallback/commit ownership and the value-shape boundaries added across ordinary, focused, manual API, and manual-override paths.
- Searched production `String(...)` coercion sites for user/model-owned values that could still reach persistence.
- Traced legacy manual override normalization through full-state rollback.

Confirmed finding:
- Medium: a malformed `manualOverrides` value already present in an older sidecar survived `normalizeNpc()` and could be reapplied by `preserveUserOwnedState()`, turning an object-valued text override into `[object Object]` during rollback.

Fix:
- Centralized manual-owned field validation in the schema boundary and reused it from the public manual API. Persisted legacy override entries now keep only values accepted by the same field-shape rules; invalid entries are dropped fail-closed before rollback. Valid overrides, numeric relationship compatibility, portrait objects, correction remediation, and user-owned rollback semantics remain supported.

Validation:
- Added malformed-legacy and valid-legacy rollback controls to `tests/v078-manual-api-value-boundaries.test.mjs`.
- Final focused/full/package results are recorded in the release report.

Limitation: controlled repository/host simulations only. No configured live SillyTavern + exact Gemini 3.8 Flash provider identifier was available for a live smoke test.
