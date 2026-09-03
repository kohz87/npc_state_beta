# NPC State 0.4.1 review checklist

Post-build review should confirm:

1. Generated runtime comes from the pinned stable baseline plus explicit 0.4.1 transformations.
2. `manifest.json` and runtime version remain 0.4.1.
3. Beta settings remain isolated under `npc_state_beta`; stable `npc_state` is read only for optional v0.3 sidecar import.
4. Missing optional stable import starts fresh; missing beta-owned sidecar remains fail-closed.
5. Foreground parser strips only NPC State transport and preserves Inventory Block v0.5/legacy/plain Inventory snapshots in valid, duplicate, malformed, and truncated NPC cases.
6. Embedded application is stale-operation protected against edit/swipe/delete/chat switch while queued.
7. Branch-unsafe state blocks scans, targeted Refresh, manual dossier edits/add/archive/delete, bundle import, and other durable mutations until explicit Rebase.
8. Branch fingerprints ignore NPC State and Inventory machine state but still change for visible narrative edits.
9. Checkpoints retain at most one variant per assistant message id; portrait payloads are excluded from snapshots and merged from current durable presentation data on rollback.
10. Multiple new and existing NPCs update in one payload. Relationship deltas remain exchange-gated. World-only patches stay restricted.
11. Targeted Refresh cannot mutate non-target dossiers, presence, observation, relationship scores, or social graph.
12. New and existing family/key relationships normalize to readable strings. Generic object-shaped collection entries never persist as `[object Object]`.
13. v0.4.1 can export, name, parse, and re-import its own v3-compatible bundles; legacy 0.3.x bundles remain accepted.
14. Identity directory plus full dossier continuity respects the configured injection budget.
15. Inventory Block 0.5.3 coexistence uses `INVENTORY_BLOCK_V05`; legacy `INVENTORY_BLOCK_UPDATE` remains tolerated.
16. Continue/regenerate/swipe/delete remain candidates for live SillyTavern lifecycle testing even after static CI passes.
