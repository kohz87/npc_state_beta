# v0.7.9 validation and review ledger

`docs/core-contract.md` remains the authoritative behavioral specification. This ledger is development-only and is excluded from the installable package. Controlled fixtures never access or rebuild a user's NPC State database.

## Initial implementation

Baseline: `8460706c00ea9e45e958690aab8a0149b176677f` (v0.7.8).

Reproduced against the baseline:
- malformed `appearanceForms` `scope.form` object was accepted and stored as form name `[object Object]`;
- a `keyRelationships` object with an array-valued `name` and valid string `relation` passed shape validation and normalized to object/array text;
- manual Trust accepted `null`, `false`, `[]`, and `[7]` through `Number(...)`, mutating scores and correction records.

Implementation: validate supplied form selectors before semantic dedupe/application; require every recognized collection-object property consumed by normalization to be textual; use one strict finite-number/nonempty-numeric-string rule for manual relationship input and persisted manual relationship overrides. Preserve string form selectors, documented collection aliases, numeric age compatibility, random birthday filling, first-pass/Scan/Refresh sharing, and existing ownership/rollback mechanics.

Validated initial candidate: `83afdd0d750e171737ab459c17381c2987f2b1b5`. Focused regressions plus `npm run validate`, `npm test`, `npm run package`, and ZIP integrity passed; 293/293 tests passed. GitHub verification run: `34173958074`.

## Review cycle 1 - input boundaries

Candidate: `83afdd0d750e171737ab459c17381c2987f2b1b5`.

Inspected: `src/model/dossier-fields.js`, `src/model/semantic-updates.js`, `src/model/legacy-semantic-adapter.js`, `src/scan-application.js`, `src/schema.js`, public manual mutation in `src/engine.js`, and coercive `Number`/`String` call sites. Probes exercised selectors, nested aliases, nulls, booleans, arrays, blank strings, nonfinite values, and valid numeric strings.

Confirmed finding: manual `importance` still accepted `null`, `false`, `[]`, `[7]`, and blank strings through `Number(...)`, persisting 0/7. Fix: export and reuse the strict manual numeric-input helper for importance. Invalid writes now leave persistence unchanged; finite numbers and nonempty finite numeric strings remain supported.

Fix commit: `0f40a3cef0cdf58b97efbea48a8056cbd981f1f3`. Targeted tests and full validation/test/package gates passed; 294/294 tests passed. GitHub verification run: `34174102355`.

## Review cycle 2 - state lifecycle

Candidate: `0f40a3cef0cdf58b97efbea48a8056cbd981f1f3`.

Inspected: durable correction normalization in `src/schema.js`, correction ownership/application and `preserveUserOwnedState()` in `src/branches.js`, public correction creation in `src/engine.js`, deletion/rollback paths, history trimming, and legacy migration/remediation tests. Probes used malformed persisted correction values and actual full-state rollback, plus a valid numeric-string correction control.

Confirmed finding: legacy persisted `manualRelationshipCorrections` still sent `raw.value` through permissive relationship normalization. `null` became Trust 0 and `[7]` became 7, then could be replayed as durable manual ownership during rollback. Fix: apply the same strict numeric-input rule before accepting a correction record. Malformed records are dropped; valid numeric-string corrections remain durable through rollback.

Fix commit: `dc8f7907bfe750348c281926f724805dbb52cd40`. Lifecycle/correction probes and full validation/test/package gates passed; 296/296 tests passed. GitHub verification run: `34174223839`.

## Review cycle 3 - asynchronous ownership

Candidate: `dc8f7907bfe750348c281926f724805dbb52cd40`.

Inspected: `processEmbeddedScan()`/fallback lifecycle in `src/index.js`, `scan()`/ownership/`commitState()` in `src/engine.js`, `src/completeness-coordinator.js`, `src/operation-diagnostics.js`, and `src/shared-generation-queue.js`. Hypotheses covered capture-bound fallback surviving a chat switch during generation, same-address capture replacement, history/swipe/deletion changes during hydration/save, stale completeness work, persistence failure, and diagnostic ownership.

Result: no confirmed finding. A fresh deferred-provider probe changed chat identity while fallback generation was pending; the fallback was discarded and performed zero sidecar writes. Together with the host capture/fallback suites, 32/32 targeted ownership probes passed. No runtime change.

## Review cycle 4 - contract and user-visible behavior

Candidate: `dc8f7907bfe750348c281926f724805dbb52cd40`.

Inspected: shared envelope/examples in `src/scan-contract.js`, foreground/Scan/Refresh prompt paths, `semanticUpdatePrompt()`, identity handoff, field/coverage diagnostics, zero-delta Current Dynamic, first-pass completeness, and prompt compaction. Hypotheses covered parser/example drift, malformed selector diagnostics, valid selector rejection, identity conflict propagation, relationship replay, and first-pass extra-request regressions.

Result: no confirmed finding. A host-level malformed form selector produced one actionable rejected-proposal diagnostic and preserved the existing form; the canonical string selector updated through the same path. Contract/identity/completeness/relationship suites and the two fresh host probes passed 102/102. No runtime change.

## Review cycle 5 - integration and leanness

Candidate: `dc8f7907bfe750348c281926f724805dbb52cd40`.

Inspected: the accumulated diff and adjacent consumers, registry/helper references, release/version authorities, dynamic/runtime package reachability, documentation authority, and installable ZIP contents. `rg` confirmed the former `supportedCollectionObject()` wrapper had zero callers after `collectionObjectIssue()` became the sole collection-object validator.

Confirmed cleanup: removed the dead four-line wrapper rather than retaining two names for one rule. This is safe because no runtime/test/dynamic-import/package reference remained; `dossierFieldValueIssue()` directly calls the authoritative helper.

Fix/cleanup commit: `c3127429bfdd0ce47e34592e7dd9eafe9853aa5f`. Targeted affected-consumer probes passed 25/25; full validation/test/package gates passed 296/296 tests. The package contains 56 files, passes ZIP integrity, and contains no tests, scripts, `.github` staging, or review-ledger files. GitHub verification run: `34174421747`.

## Remaining validation limitation

No configured live SillyTavern provider or exact provider/model identifier corresponding to the user's label “Gemini 3.8 Flash” was available. Live sample count: 0. No credentials or model settings were invented or changed.
