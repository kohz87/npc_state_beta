# Repository agent guidance

Work in this repository follows [`DEVELOPMENT.md`](DEVELOPMENT.md) and the authoritative runtime contract in [`docs/core-contract.md`](docs/core-contract.md). Read both before changing extension behavior.

## Before editing
- Inspect current remote HEAD and working-tree changes; preserve unrelated work.
- Check for nested `AGENTS.md` instructions in paths you touch.
- Read the core contract before changing extension behavior.

## Implementation
- Reuse existing scanner, evidence, validation, diagnostics, and persistence paths.
- Keep semantic interpretation model-led and ownership/validation deterministic.
- Preserve source identity, rollback, recovery, locks, and manual corrections.
- Keep code lean; remove superseded implementations only after tracing callers, exports, persisted readers, UI hooks, and tests.
- Preserve functional tombstones and required saved-data compatibility.
- Never modify or rebuild a user's actual NPC State database without explicit instruction.

## Verification and release
- Follow existing test, validation, packaging, and versioning conventions.
- Prefer behavioral regressions through production paths over prompt-string assertions.
- Controlled model fixtures do not prove live-provider compliance.
- Commit, push, or release only when the active user task authorizes it.
- Report changes, verification results, cleanup, request/prompt impact, and material limitations.
