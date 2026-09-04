# NPC State Beta 0.4.3

Experimental one-pass foreground NPC continuity for SillyTavern, continuing directly from stable NPC State v0.3.2.

## Architecture

- Normal turns use the same foreground RP inference for NPC State capture. No mandatory second scanner request.
- The model emits one hidden `<npc_state_v1>...</npc_state_v1>` observation block; NPC State validates it, applies deterministic state rules, stores per-message/per-swipe metadata, and strips the transport from chat.
- With current Inventory Block transports, NPC State yields the terminal position: the NPC payload comes first and Inventory keeps its own final `INVENTORY_BLOCK_V05` / legacy `INVENTORY_BLOCK_UPDATE` control.
- `present` remains the internal v0.3-compatible storage field, but its v0.4.3 meaning is **in chat**: individually relevant NPC participants at exchange end, not everyone physically nearby.
- New NPCs use the same full semantic scan and receive all grounded foundational information established by the exchange. Unknown biography stays unknown.
- The full separate v0.3-style scanner is retained as a contingency for manual Scan current cast, dossier Refresh, timeline rebase, edited/untracked branch recovery, and optional foreground failure fallback.
- When embedded capture is enabled, a completely missing `<npc_state_v1>` block automatically triggers one recovery scan. Recovery for a malformed block remains separately optional/configurable.
- Known tracked swipes restore from branch checkpoints; stored embedded payloads are available as a local replay fallback before another LLM call is considered.
- Stable v0.3.x sidecars can be cloned once into an independent beta sidecar. v0.2 migration is intentionally removed from the 0.4 line.
- Beta settings, sidecar filenames, pointer hints, and writer locks remain isolated from stable NPC State.

## Form-aware current appearance and age-linked maturation

- `appearance` stores shared/common appearance, or ordinary appearance for a single-form NPC. `appearanceForms` stores durable named body forms and `currentForm` selects the active body. One shared resolver supplies **Current appearance** to dossiers, portrait prompts, and foreground continuity.
- Legacy dossiers that copied ordinary `appearance` into `appearanceForms.Base` stay synchronized while those values are still duplicates. Once `appearance` becomes genuine cross-form shared canon, Base and shared appearance evolve independently.
- A valid birthday or elapsed-time `ageChange` now asks the scanner to reconsider visual maturation in the same observation. Age parsing, normalization, units, storage, and existing age-continuity rules are unchanged. Corrections and manual age edits never fabricate maturation.
- Maturation is conservative and lore-aware rather than species-name hard-coded: ordinary, accelerated, long-lived, ageless, or unknown. Unknown fantasy species do not silently inherit human aging. Insignificant adult birthdays, long-lived intervals, and ageless beings may correctly produce no visible change.
- Age-linked revisions reuse `apparentAge`, `canonChanges` mode `age_progression`, and `appearanceFormChanges` mode `age_progression`. The backend requires an accepted forward age transition, a visually meaningful interval, the correct shared/form channel, and preservation of unrelated canonical traits.

## Testing beside stable NPC State

Disable the stable NPC State extension while exercising this beta. Stable may remain installed and its settings/data remain untouched. On first load for a chat with no beta sidecar, 0.4.3 clones the stable v0.3 sidecar into a beta-owned sidecar and then diverges independently.
