# NPC State Beta 0.4.28

Experimental one-pass foreground NPC continuity for SillyTavern, continuing directly from stable NPC State v0.3.2.

## Architecture

- Normal turns use the same foreground RP inference for NPC State capture. No mandatory second scanner request.
- The model emits one hidden `<npc_state_v1>...</npc_state_v1>` observation block; NPC State validates it, applies deterministic state rules, stores per-message/per-swipe metadata, and strips the transport from chat.
- With current Inventory Block transports, NPC State yields the terminal position: the NPC payload comes first and Inventory keeps its own final `INVENTORY_BLOCK_V05` / legacy `INVENTORY_BLOCK_UPDATE` control.
- `present` remains the internal v0.3-compatible storage field, but its v0.4.28 meaning is **in chat**: individually relevant NPC participants at exchange end, not everyone physically nearby.
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

## World-state identity bridge

- v0.4.15 fixes new-NPC creation when the visible narration clearly introduces an individual by role or occupation but the canonical proper name is supplied only by the current `<World_State>` block. Example: visible "the clerk" plus World_State "Kora Lind — Guild Clerk" may resolve to one new dossier.
- The bridge is identity-only and fail-closed. World_State by itself still cannot introduce a new NPC, private chatter cannot introduce one, and an unrelated visible role does not authorize a structured name.
- Existing new-NPC admission modes remain unchanged. Named-preferred may use the bridge because the resulting dossier still has an established proper name.

## Settings organization

- v0.4.14 is a presentation-only settings cleanup. Existing control IDs, stored keys, defaults, and listeners are preserved; scanner, storage, relationship, dossier, and branch semantics are unchanged.
- **Scanning & Capture** is the only settings category open by default and now owns Auto Scan, context depth, new-NPC admission/history, Scanner Response Limit, and malformed-capture recovery.
- Continuity Injection, Birthday & Aging, Dossier Evolution, Relationships, Recovery & Branch Safety, Advanced, Maintenance, and Portraits remain collapsed until needed. Relationship and memory rubrics are no longer presented together as one vague Advanced Rubrics bucket.
- Recovery keeps ordinary branch-rescan controls at the main level. Force Timeline Rebase is nested under **Advanced Recovery**, while the normal Rebase action still appears automatically when NPC State detects a branch-safety problem.
- Birthday controls remain progressive: Off shows only the fill policy, Unknown also exposes the local fill action, and Random additionally exposes calendar and fallback-days controls. This changes presentation only.

## Compact appearance presentation

- The normal dossier and foreground continuity now expose only two reader-facing appearance surfaces: **Current appearance**, resolved from the stored shared/common traits plus the active form, and **Appearance forms**, the complete named form registry with the active entry marked current.
- Standalone **Current form** and **Shared / ordinary appearance** lines are intentionally hidden from normal reading/injection because they duplicate information already represented by those two surfaces. The underlying fields remain stored and manually editable, and continue to drive form switching, legacy Base synchronization, age-linked maturation, portraits, scanner validation, and branch-safe continuity.

## Testing beside stable NPC State

Disable the stable NPC State extension while exercising this beta. Stable may remain installed and its settings/data remain untouched. On first load for a chat with no beta sidecar, 0.4.27 clones the stable v0.3 sidecar into a beta-owned sidecar and then diverges independently.

## Scanner output and relationship diagnostics

Scanning & Capture includes **Scanner Response Limit**, from 512 to 15,000 tokens (default 7,000). This output ceiling applies to separate scans, dossier Refresh, structured imports, and JSON retries. It does not change foreground RP output or the recent-history window. Use a model/provider that supports the selected output allowance.

Dossiers include expandable **Relationship scoring** details: per-axis gate status, fractional progress, before/after scores, unlocks, and recent rejection reasons. Diagnostics are private continuity bookkeeping and are not injected into roleplay. A meaningful event may unlock a gate while the displayed score stays at the boundary because of fractional progress.

## Relationship evaluation observability

- v0.4.18 requires an explicit relationship evaluation for every exchange-active NPC. A scanner may still correctly decide that an ordinary interaction causes no relationship movement, but it must say so instead of silently omitting the relationship channel.
- A deliberate zero is recorded only in the bounded relationship diagnostics as `evaluated-no-change`; it does not create relationship history, evidence history, fractional progress, or score movement. If an exchange-active NPC is returned without the required evaluation, diagnostics record `evaluation-missing` instead. Malformed attempted evaluations are recorded as `evaluation-invalid`.
- This keeps routine scenes from inflating relationship history while making "evaluated and unchanged" distinguishable from "scanner forgot to evaluate". Rescans with relationship application disabled do not add duplicate evaluation telemetry.

## Recovery and chronological rebuild

- A missing beta sidecar can now be explicitly replaced without first hydrating the broken pointer. Recovery writes a new uniquely named sidecar under the existing writer lock, verifies that another tab has not already advanced the pointer, and switches this chat only after the replacement upload succeeds.
- Rebuild from chat processes surviving assistant exchanges chronologically. Each model call receives only the chat prefix through the exchange being reconstructed, so future messages cannot leak into earlier historical judgments.
- Recovery progress is persisted after every committed exchange. Reloads turn an interrupted running rebuild into a resumable pause; failed generations retry the same exchange; cancellation never advances an uncommitted step; edits to completed history stop with restart-required status, while edits confined to the unprocessed suffix are safely replanned without replaying completed work.
- Relationship mode can either start meters fresh while reconstructing the rest of the dossier, or re-evaluate historical relationship changes through the normal evidence, cap, inertia, duplicate, and milestone rules.
- Automatic stale deletion is deferred during reconstruction and applied once at the chosen end of the rebuilt range. Archival may still occur chronologically and can be restored by later reconstructed activity.
- Recovery controls live under Recovery & Branch Safety with fresh initialization, all/latest/custom range selection, relationship mode, progress, resume, pause, cancel, and restart feedback. Normal scans and mutating dossier operations are blocked while an incomplete recovery owns chronology.

## Source-agnostic identity and presence grounding

- Current visible narrative is the primary source for new-NPC identity and scene participation. The scanner may bind indirect descriptions, pronouns, scene continuity, and earlier named references semantically, while runtime verifies quoted current-visible provenance instead of adding keyword/role classifiers.
- New-NPC proposals may carry `identityEvidence`; activity claims may carry per-channel `activityEvidence` for exchange-active, in-chat, and world-active classification. These fields are transient scan evidence and do not rewrite saved dossier schema.
- Megumin-style `World_State` is optional corroboration only. When present, NPCs Present and Off-Screen sections are separated so a present NPC cannot be accepted as world-active merely because their name appears somewhere in World_State. A public short-name anchor may be enriched to a unique compatible structured full name, but structured-only names still cannot create dossiers.
- In-chat and world-active are mutually exclusive final states. When a malformed scan claims both for one NPC and current-visible evidence supports in-chat, in-chat wins. Existing score, relationship, family, history, and progression mechanics are unchanged.

## General kinship projection

- Grounded named family facts now cover direct siblings, aunts/uncles, nieces/nephews, cousins, grandparents/grandchildren, spouses, guardians/wards, and common in-law ties in addition to the existing child/parent family slots.
- The owner keeps the explicit directional relation from narration, such as `Mara - sister` or `Rowan - uncle`. When the named relative already has a dossier, NPC State adds a conservative reciprocal relation without guessing unknown gender, such as `sibling`, `niece/nephew`, `grandchild`, or `spouse`.
- Named relatives remain continuity metadata rather than automatic NPC admission. Public-evidence grounding, ambiguous short-name fail-closed behavior, manual Key relationships locks, and unnamed-family handling remain unchanged.

## Named family facts

- Explicit countable family facts may now carry the names actually established in visible narration. For example, "Greta has twin daughters Lyra and Talia" stores the two-daughter family slot and also projects `Lyra - daughter` and `Talia - daughter` into Greta's durable key relationships.
- Named family members do not become NPC dossiers merely because they are relatives. NPC admission remains governed by the normal admission policy and active-scene relevance.
- Unnamed family remains private countable continuity exactly as before. Family-member names must be grounded in public profile evidence; names found only in World_State/private control blocks are not promoted. Ambiguous short-name matches fail closed when resolving a named relative to an existing dossier.

## Presence grounding

- Existing multi-part NPC names may be grounded by an unambiguous visible short-name token when the scanner returns that established NPC as exchange-active or in-chat. For example, visible "Brina" can ground the existing dossier "Brina Cole" even when World_State uses the full name.
- Short-name grounding is fail-closed when the token is shared by another stored NPC identity, is generic/common control language, or appears only in World_State/private/reference blocks. The structured-evidence firewall remains authoritative: World_State alone still does not prove in-chat presence.
- This fixes off-screen-to-present transitions that were previously discarded after a correct scanner result because visible prose used a first name while structured context used the full canonical name.

## Relationship prompt alignment

- Recovery labels older material as continuity-only context rather than profile/memory-only. Older context may establish prior attitudes, baselines, and already-counted developments for interpretation, but quotations supporting a new relationship movement still come from permitted current-exchange evidence.
- Foreground and recovery numeric guidance now receives the same effective relationship caps used by runtime scoring. The shared cap normalizer preserves defaults, accepts valid configured numeric caps, clamps negative caps to zero, and falls back safely for missing or invalid values. Milestone requirements, inertia, fractional progress, axis limits, priority selection, and duplicate protection are unchanged.
- Offline relationship evaluation fixtures now include positive and negative Desire, Affection decrease, materially ambiguous attraction, and unchanged negative attitude cases. These remain evaluation-only and do not add production keywords or runtime semantic vetoes.

## Relationship judgment calibration

- v0.4.28 applies one shared relationship-judgment rubric to foreground capture and the full recovery/current-cast scanner. It distinguishes genuinely new change from continuity, binds reactions to the correct NPC and player target, supports contextual/indirect evidence without keyword gating, evaluates axes independently, weighs ambiguity without freezing, and considers mixed chronology before proposing a net change.
- Impact caps remain maxima rather than targets. The model is instructed to choose modest raw deltas from strength, significance, and novelty, while runtime continues to apply caps, priority/axis limits, duplicate protection, inertia, fractional progress, and milestone gates exactly as before.
- Per-axis explanations remain concise and evidence-backed. Exact quotations still come only from permitted current-exchange relationship evidence; older context can inform interpretation but never becomes fresh evidence.
- Relationship criteria in settings are additive campaign calibration. The shared rubric and deterministic evidence/mechanics contract always remain in force. Existing user-edited criteria are preserved; only the exact previous built-in default is migrated to the shorter additive default.
- This release changes prompt judgment/calibration only. It does not rescan, reset, backfill, or rewrite relationship scores/history.

## Relationship history remarks

- v0.4.21 preserves accepted per-axis relationship explanations in visible relationship history instead of dropping them during dossier normalization. A supplied overall reason remains the preferred concise remark.
- When an applied history entry has no overall reason, the dossier shows only explanations for axes whose displayed scores actually changed, with axis labels and duplicate explanation text collapsed.
- Older entries may recover explanations from relationship evidence/diagnostic history only when event identity and corroborating metadata resolve to one unambiguous event. Otherwise the dossier shows "No explanation recorded." without inventing a reason or substituting raw quotations.
- This is persistence/presentation only: scoring, caps, inertia, fractional progress, milestone gates, axis selection, duplicate protection, manual edits, and branch/rebase behavior are unchanged.

## Evidence-backed relationship judgment

- v0.4.20 makes the scanner model responsible for interpreting relationship meaning and makes deterministic runtime validation responsible for provenance, structure, limits, duplicate application, inertia, and milestone gates.
- Every nonzero Trust, Affection, Desire, or Tension proposal now carries its own exact current-exchange excerpt(s) plus a concise explanation. Runtime verifies those quotations against bounded visible/private relationship sources without using keyword overlap as a semantic veto.
- Structured World_State and reference/control blocks remain outside ordinary relationship-event evidence. Existing saves remain readable; legacy nonzero scanner payloads without the new per-axis evidence contract are diagnosed and rejected rather than silently authorized.
- Impact-tier axis limits remain unchanged. Scanner-provided axis priority resolves supported overflow first; legacy proposals with valid per-axis evidence fall back deterministically to magnitude, then Trust → Affection → Desire → Tension.

## Per-axis relationship grounding

- v0.4.19 grounds each proposed Trust, Affection, Desire, and Tension movement independently instead of rejecting a whole multi-axis relationship change when one axis is weak.
- Unsupported or polarity-conflicting axes are discarded individually. Grounded axes continue through the existing impact axis-limit, duplicate protection, inertia curve, and milestone gates. Diagnostics preserve the original proposal and identify rejected axes, while accepted subsets are marked `partial-applied`.
- Desire keeps its explicit-evidence safeguards and remains outside broad semantic performance inference. A weak Desire proposal cannot suppress an independently grounded Trust, Affection, or Tension change.

## Relationship evidence grounding

- v0.4.17 separates evidence validity from progression difficulty. The lexical path remains first choice, while the semantic fallback may ground a single-axis Trust, Affection, or Tension change at any impact tier when the current exchange independently proves the concrete player-attributed event behind the scanner's paraphrase.
- Semantic grounding validates that the event happened, belongs to the player, concerns the target NPC, and plausibly supports the proposed axis/direction. It does not make meaningful/major/extreme events easier and it never bypasses relationship inertia or milestone requirements.
- The fallback remains fail-closed: wrong actors, actorless events, contradictory outcomes, failed positive-performance claims, unrelated NPCs, and ambiguous multi-axis paraphrases are rejected. Desire remains outside broad semantic inference and still requires explicit attraction/intimacy evidence in both scanner evidence and narration.

## Relationship progression curve

Deepening movement uses the same bands as the milestone system: **0–25 = ×1.00, 26–50 = ×0.80, 51–75 = ×0.60, 76–90 = ×0.40, 91–100 = ×0.25**. Fractional progress is retained between accepted events. Movement back toward neutral keeps its easier recovery multipliers instead of inheriting the deepening curve.

The milestone boundaries remain narrative locks rather than extra friction inside the band: **25 = meaningful with at least 1 raw point, 50 = major with at least 3 raw points, 75 = extreme with at least 5 raw points, 90 = extreme with at least 8 raw points.** Ordinary history may accumulate up to a locked boundary, but a qualifying event is required to establish movement beyond it.

## Relationship milestone gate invariants

Relationship milestone gates are fixed evidence thresholds, independently for each axis and positive/negative polarity. A locked boundary may be reached by weaker evidence, but deepening beyond it requires: **25 = meaningful-or-stronger with at least 1 raw point on that axis; 50 = major-or-stronger with at least 3 raw points; 75 = extreme with at least 5 raw points; 90 = extreme with at least 8 raw points.** These raw minima are not reduced when relationship tier caps are configured below them; a configuration that cannot supply the required raw evidence simply cannot unlock that gate. Movement back toward neutral is never milestone-blocked. Inertia is applied after the raw evidence weight and does not lower the gate requirement.

## Timeline rebase relationship rollback

Relationship deltas and milestone breakthroughs are timeline-sensitive rather than timeless dossier canon. When an explicit rebase accepts a surviving chat after a pre-baseline truncation or rewrite, NPC State now rolls back non-manual relationship events attributed to discarded message ids before establishing the new branch base. Recent scoring diagnostics are used to restore exact score/fractional state when possible; older visible deltas are reversed as a fallback. Discarded milestone unlocks are removed, and if older history is no longer sufficient to reconstruct an over-gate score exactly, that axis is conservatively clamped back to the first now-locked boundary. Manual relationship edits remain authoritative.

After rebase, surviving relationship history and milestone provenance becomes part of the accepted baseline and its old message references are cleared. Recent relationship evidence/diagnostics are also cleared so discarded text cannot participate in future deduplication or scoring. Durable profile canon, memories, portraits, manual profile locks, archives, social ties, and deletion tombstones continue to survive rebase.

## Manual force timeline rebase

Recovery & Branch Safety keeps **Force Timeline Rebase** inside the collapsed **Advanced Recovery** subsection when NPC State currently considers the branch safe. This is an explicit recovery tool for cases where external edits, extension lifecycle events, or other unusual state leave the user wanting to accept the currently visible chat as a fresh branch baseline. When a rebase is already required, the normal warning banner remains the primary action instead of showing a duplicate force control.

A force rebase uses the same durable-state and discarded-branch relationship rollback safeguards as an ordinary required rebase. If the visible lineage is already the exact tracked lineage and its latest assistant exchange was already scanned, NPC State carries that scan marker through the baseline reset. The follow-up scan can therefore rebuild live continuity without applying the already-consumed relationship delta a second time. If the visible lineage actually diverged, the marker is cleared and the surviving latest exchange is treated normally.

## Scanner edge-case hardening

NPC State 0.4.13 hardens automatic reconciliation around malformed scanner payloads, identity collisions, life-state evidence, long canonical appearance text, cumulative visual maturation, family/manual-lock boundaries, Targeted Refresh isolation, and directional relationship evidence. Invalid foreground payloads now fail before state mutation or scan-marker advancement; automatic identity updates fail closed when a returned name/alias belongs to another dossier; death archiving requires affirmative target-attributed evidence rather than a bare death keyword; appearance synchronization compares full canonical descriptions rather than 160-character identity keys; small birthday/elapsed transitions accumulate from a persisted visual-aging baseline; family inference respects manual Key Relationship locks; Targeted Refresh discards non-target family facts; and relationship grounding uses predicate-local negation plus expected actor direction.

## Second-order scanner hardening

NPC State 0.4.13 closes follow-on edge cases discovered after the 0.4.11 scanner pass. Scanner observations now validate member types transactionally even when passed as already-parsed objects; same-observation identity reservations prevent two pending renames from claiming the same canonical identity; death archiving requires a completed assertion that the tracked NPC is actually the victim rather than merely appearing near a death verb; directional relationship evidence rejects another known NPC as the experiencer and relationship delta polarity must agree with locally negated predicates. Timeline rebase now treats manual relationship edits as chronological anchors instead of shielding an entire axis, so later discarded automatic gains roll back without undoing the manual value. Manual Actual/Apparent Age edits reset the maturation baseline, and Targeted Refresh disables global family reconciliation so unrelated dossiers cannot change as a side effect.

## Semantic evidence isolation

NPC State 0.4.13 binds destructive life-state transitions and relationship movement to the actual target predicate instead of accepting nearby names or cue words. Death and living-return evidence now resolve the tracked NPC specifically, preserve possessive boundaries, scope negation/modality to the target assertion, and ignore another character's survival or resurrection. Relationship evidence binds each directional predicate to its nearest named actor and evaluates polarity within the predicate rather than a broad token window. Scanner dossier identities are strongly typed strings at the payload boundary. Structured dossier import now disables global family reconciliation, matching Targeted Refresh isolation. The release build also persists the legacy verifier compatibility fixtures used by CI so a fresh checkout runs the same test surface as the build pipeline.
