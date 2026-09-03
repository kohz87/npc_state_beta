# NPC State 0.4.1 deep-hardening invariants

This file documents the invariants enforced by the final 0.4.1 hardening patch and CI. It is intentionally implementation-facing.

- Beta settings must stay under `extension_settings.npc_state_beta`; helper modules must not write stable `npc_state` settings.
- Stable v0.3 sidecars remain an optional one-time import source only. Missing stable import files must never block a fresh beta chat. Missing beta-owned sidecars remain fail-closed.
- Normal foreground capture may create/update multiple NPCs in one response. Returned dossier patches are accepted independently of imperfect activity arrays, while relationship deltas remain exchange-gated and world-only updates remain restricted.
- Targeted dossier Refresh may mutate only the requested stable NPC identity and may not change presence, global observation, social edges, or relationship scores.
- Any operation that would create durable state/checkpoints is blocked while branch safety is not `safe`, except the explicit branch Rebase path.
- Embedded foreground application must discard stale work if chat identity, operation epoch, or the target assistant message fingerprint changes before commit.
- Assistant branch fingerprints ignore NPC State transport and Inventory Block transports/snapshots, including Inventory Block v0.5 `INVENTORY_BLOCK_V05` envelopes.
- Truncated NPC State cleanup must preserve a following Inventory transport/snapshot.
- Checkpoint snapshots omit portrait payloads. Rollback restoration merges current portraits by stable NPC id so image data is not multiplied through checkpoint history.
- Rollback history keeps one canonical checkpoint per assistant message id so swipe/regeneration churn does not consume the entire 48-checkpoint window.
- Generic model-produced dossier collections must reject/normalize object-shaped values instead of persisting `[object Object]`.
- The configured injection budget applies to the identity directory plus full dossiers together.
- v3-compatible bundle storage remains accepted for both 0.3.x and 0.4.x app versions.
- The beta build must pin the stable source commit and explicitly invoke each transformation patch in workflow order.
