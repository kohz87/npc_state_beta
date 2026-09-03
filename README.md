# NPC State Beta 0.4.1

Experimental one-pass foreground NPC continuity for SillyTavern, continuing directly from stable NPC State v0.3.2.

## Architecture

- Normal turns use the same foreground RP inference for NPC State capture. No mandatory second scanner request.
- The model emits one hidden `<npc_state_v1>...</npc_state_v1>` observation block; NPC State validates it, applies deterministic state rules, stores per-message/per-swipe metadata, and strips the transport from chat.
- With Inventory Block 0.4, NPC State yields the terminal position: NPC payload first, Inventory `INVENTORY_BLOCK_UPDATE` last.
- `present` remains the internal v0.3-compatible storage field, but its v0.4.1 meaning is **in chat**: individually relevant NPC participants at exchange end, not everyone physically nearby.
- New NPCs use the same full semantic scan and receive all grounded foundational information established by the exchange. Unknown biography stays unknown.
- The full separate v0.3-style scanner is retained as a contingency for manual Scan current cast, dossier Refresh, timeline rebase, edited/untracked branch recovery, and optional foreground failure fallback.
- Automatic recovery after missing/malformed foreground capture is optional and off by default.
- Known tracked swipes restore from branch checkpoints; stored embedded payloads are available as a local replay fallback before another LLM call is considered.
- Stable v0.3.x sidecars can be cloned once into an independent beta sidecar. v0.2 migration is intentionally removed from the 0.4 line.
- Beta settings, sidecar filenames, pointer hints, and writer locks remain isolated from stable NPC State.

## Testing beside stable NPC State

Disable the stable NPC State extension while exercising this beta. Stable may remain installed and its settings/data remain untouched. On first load for a chat with no beta sidecar, 0.4.1 clones the stable v0.3 sidecar into a beta-owned sidecar and then diverges independently.
