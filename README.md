# NPC State Beta 0.4.0-beta.1

Experimental one-pass foreground NPC continuity for SillyTavern.

## Beta architecture

- Normal automatic NPC accounting runs in the same LLM inference that writes the RP response.
- The model emits a hidden `<npc_state_v1>...</npc_state_v1>` observation block. NPC State validates/applies it locally and strips it from chat.
- With Inventory Block 0.4, NPC State explicitly yields the terminal position: NPC payload first, Inventory `INVENTORY_BLOCK_UPDATE` last.
- New NPCs use the same full semantic scan and are bootstrapped with all grounded foundational information. Unknown biography remains empty.
- `present` storage is interpreted in this beta as individually relevant NPCs in chat at exchange end, not every physically nearby background character.
- Existing v0.3 relationship/history/checkpoint/stale logic remains authoritative after the embedded observation is parsed.
- Automatic second `generateRaw` scanning is removed. Manual Scan current cast and dossier Refresh remain recovery tools.
- Beta settings, sidecar filenames, pointer hints and writer locks are isolated from stable NPC State.

If a foreground model omits or corrupts its NPC machine block, that response commits no automatic NPC mutation. Use Scan current cast to repair it.

## Testing beside stable NPC State

Disable the stable NPC State extension while exercising this beta. Keeping both runtimes active would make stable 0.3 continue its own post-response scanner, defeating the one-generation test. The stable extension may remain installed and its settings/data remain untouched. On the beta's first load for a chat with no beta sidecar, it clones the stable v0.3 sidecar into a new beta-owned sidecar and then diverges independently.
