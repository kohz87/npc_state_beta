# v0.7.8 implementation and review ledger

This development ledger records the required post-implementation review sequence for v0.7.8. `docs/core-contract.md` remains the authoritative behavioral specification. This file is not part of the installable package.

## Phase A - initial implementation

Candidate SHA: pending initial validated commit.

Scope and reproductions:
- Reproduced optional foreground fallback started by a malformed capture later consuming the scanned boundary of a newer valid capture at the same visible narration/message/swipe.
- Reproduced object-valued ordinary scalar bootstrap and semantic updates becoming `[object Object]` and being counted as accepted.

Implementation:
- Bound automatic fallback Scan to the originating capture id and canonical source history using the existing operation ownership token and commit guard. Manual Scan remains non-capture-bound.
- Added registry-derived ordinary dossier value-shape validation before bootstrap/semantic coercion, preserving finite non-negative numeric age/apparent-age compatibility and supported collection/form object compatibility.
- Invalid field values are rejected with bounded `invalid-value-type:*` diagnostics and preserve valid existing data.

Validation before commit:
- Focused v0.7.8 regressions: 6/6 pass.
- Full validation/test/package results are recorded with the initial commit entry below.

## Independent review rounds

Pending. At least three distinct post-implementation rounds are required. A runtime fix resets the consecutive-clean-review count.
