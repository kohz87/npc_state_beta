# v0.7.9 validation and review ledger

`docs/core-contract.md` remains the authoritative behavioral specification. This ledger is development-only and is excluded from the installable package.

## Initial implementation

Baseline: `8460706c00ea9e45e958690aab8a0149b176677f` (v0.7.8).

Confirmed reproductions before the fix:
- malformed `appearanceForms` `scope.form` object was accepted and stored as form name `[object Object]`;
- a `keyRelationships` object with an array-valued `name` and valid string `relation` passed shape validation and normalized to object/array text;
- manual Trust accepted `null`, `false`, `[]`, and `[7]` through `Number(...)`, mutating scores and correction records.

Implementation:
- validate form selectors before semantic dedupe/application;
- validate every recognized collection-object text property and defensively consume strings only;
- use one strict manual relationship numeric-input rule at public/manual override and persisted override boundaries;
- bump release only to 0.7.9; persisted/settings schemas, semantic/foreground contracts, and storage identity remain unchanged.

Initial focused regressions and repository gates are recorded with the initial candidate commit below after publication.

## Post-fix review cycles

Review-cycle entries are appended after each executed review. Clean cycles record no runtime change rather than creating empty commits.
