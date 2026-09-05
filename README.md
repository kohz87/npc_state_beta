# NPC State Beta 0.4.8

Experimental one-pass foreground NPC continuity for SillyTavern, continuing directly from stable NPC State v0.3.2.

## Architecture

- Normal turns use the same foreground RP inference for NPC State capture. No mandatory second scanner request.
- The model emits one hidden `<npc_state_v1>...</npc_state_v1>` observation block; NPC State validates it, applies deterministic state rules, stores per-message/per-swipe metadata, and strips the transport from chat.
- With current Inventory Block transports, NPC State yields the terminal position: the NPC payload comes first and Inventory keeps its own final `INVENTORY_BLOCK_V05` / legacy `INVENTORY_BLOCK_UPDATE` control.
- `present` remains the internal v0.3-compatible storage field, but its v0.4.8 meaning is **in chat**: individually relevant NPC participants at exchange end, not everyone physically nearby.
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

## Passive birthday continuity

- Dossiers may store an optional freeform `birthday` such as `14 Frostwane`, `March 12`, or `Unknown`. It is continuity metadata only: NPC State never derives it from age, derives age from it, watches the calendar, increments age when it passes, or lets it trigger maturation without an independently accepted birthday/elapsed age transition in narration.
- Grounded story canon may establish a blank birthday. Explicit/manual birthdays are durable scalar canon; later correction requires evidence-backed `canonChanges` with `field: "birthday"` and `mode: "correction"`. Manual stable-profile locks include Birthday.
- **Birthday fill** is optional and defaults Off. `Unknown` fills blank participating dossiers with `Unknown`; `Random` assigns one deterministic stable date from the configured calendar. The default calendar is an editable Gregorian month pool, and fantasy calendars can replace it line-by-line as `Frostwane:30`, `Rainmoot:28`, etc. Lines without `:days` use the configurable fallback month length.
- Generated birthdays keep internal generated provenance. They remain stable for continuity but yield to a later explicitly grounded birthday; no provenance label is shown in the dossier or foreground continuity text. A local **Fill missing birthdays** action can populate existing blank dossiers without an LLM call. Generated or manually entered birthday metadata never changes chronological age by itself.

## Settings organization

- v0.4.8 groups the growing settings surface into semantic collapsible sections while preserving the existing setting IDs, values, defaults, and listeners. **Tracking** opens by default; Continuity Injection, Birthday Continuity, Dossier Evolution, Recovery & Branch Safety, Advanced Rubrics, Maintenance, and Portraits remain collapsed until needed.
- Birthday controls are progressive: Off shows only the fill policy, Unknown also exposes the local fill action, and Random additionally exposes the calendar and fallback-days controls. This changes presentation only; birthday provenance, age behavior, and scanner authority are unchanged.

## Compact appearance presentation

- The normal dossier and foreground continuity now expose only two reader-facing appearance surfaces: **Current appearance**, resolved from the stored shared/common traits plus the active form, and **Appearance forms**, the complete named form registry with the active entry marked current.
- Standalone **Current form** and **Shared / ordinary appearance** lines are intentionally hidden from normal reading/injection because they duplicate information already represented by those two surfaces. The underlying fields remain stored and manually editable, and continue to drive form switching, legacy Base synchronization, age-linked maturation, portraits, scanner validation, and branch-safe continuity.

## Testing beside stable NPC State

Disable the stable NPC State extension while exercising this beta. Stable may remain installed and its settings/data remain untouched. On first load for a chat with no beta sidecar, 0.4.8 clones the stable v0.3 sidecar into a beta-owned sidecar and then diverges independently.

## Scanner output and relationship diagnostics

Recovery & Branch Safety includes **Maximum scanner response tokens**, from 512 to 15,000 (default 7,000). This output ceiling applies to separate scans, dossier Refresh, structured imports, and JSON retries. It does not change foreground RP output or the recent-history window. Use a model/provider that supports the selected output allowance.

Dossiers include expandable **Relationship scoring** details: per-axis gate status, fractional progress, before/after scores, unlocks, and recent rejection reasons. Diagnostics are private continuity bookkeeping and are not injected into roleplay. A meaningful event may unlock a gate while the displayed score stays at the boundary because of fractional progress.

## Relationship milestone gate invariants

Relationship milestone gates are fixed evidence thresholds, independently for each axis and positive/negative polarity. A locked boundary may be reached by weaker evidence, but deepening beyond it requires: **25 = meaningful-or-stronger with at least 1 raw point on that axis; 50 = major-or-stronger with at least 3 raw points; 75 = extreme with at least 5 raw points; 90 = extreme with at least 8 raw points.** These raw minima are not reduced when relationship tier caps are configured below them; a configuration that cannot supply the required raw evidence simply cannot unlock that gate. Movement back toward neutral is never milestone-blocked. Inertia is applied after the raw evidence weight and does not lower the gate requirement.
