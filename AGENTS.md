# Repository Agent Instructions

## Before starting

- Read `DEVELOPMENT.md` and `docs/core-contract.md`, plus any applicable nested
  `AGENTS.md` instructions.
- Inspect the current branch, remote HEAD, and working-tree changes.
- Verify reported issues against the current code. Preserve subsequent fixes
  and unrelated work.
- Follow the user's task scope. This file does not independently authorize
  commits, pull requests, pushes, releases, or database changes.

## Architecture and behavior

- Treat `docs/core-contract.md` as the canonical behavior specification.
  Keep detailed rules there instead of duplicating them in this file.
- Keep narrative interpretation model-led. Keep source ownership, structural
  validation, locks, deduplication, and persistence deterministic.
- Reuse existing scanner, evidence, diagnostics, and commit/checkpoint paths.
  Avoid parallel implementations, duplicate settings, and additional stores.
- Preserve chat ownership, message lineage/revision, swipe identity, stale-work
  rejection, rollback, recovery, and manual corrections.
- Never treat numeric message position alone as sufficient source identity.
- Preserve the separation of dossier updates, relationship scoring,
  presence/activity, lifecycle, and graph authority.
- Do not add automatic model requests or historical enrichment unless the
  task explicitly calls for that behavior.
- Do not modify or rebuild a user's actual NPC State database without explicit
  authorization.

## Lean implementation

- Prefer the smallest cohesive fix that resolves the underlying problem.
- Remove superseded implementations and verified unused references together.
  Do not retain replaced workflows in legacy folders or no-op placeholders.
- Trace callers, exports, UI hooks, tests, and saved-data readers before removal.
- Preserve functional tombstones and compatibility needed for supported data,
  deletion safety, replay protection, rollback, and manual ownership.
- Consolidate contradictory prompts and documentation instead of appending
  another layer of rules. Avoid unrelated refactors.

## Validation and execution limits

- Inspect available execution tools and existing CI workflows early.
- When execution is available, run applicable behavioral tests and the checks
  required by `DEVELOPMENT.md`, including release checks when publishing.
- Otherwise, inspect existing CI results for the exact final commit when
  accessible. Distinguish executed checks, CI-verified checks, and unrun checks.
- Never claim static inspection or an earlier commit's results prove the
  current changes pass. Mocked responses do not prove live model compliance.
- Do not create temporary workflows or empty commits solely to obtain execution.
- Lack of execution capability must not stop authorized implementation,
  test-code changes, cleanup, documentation, or review.
- When committing is authorized, finish and commit reviewable branch work.
  If required release checks cannot run, leave publication pending and report
  the specific blocker. Do not bypass repository protections.

## Completion

- Follow existing versioning, documentation, packaging, and release conventions.
- Review the completed diff once unless the task requests otherwise; fix
  concrete findings and rerun affected checks when execution is available.
- Do not force-push or overwrite unrelated changes without explicit authorization.
- Report changes, verification, unrun checks, and material limitations. Include
  the commit or PR link when created, and verify remote state before claiming
  publication succeeded.
