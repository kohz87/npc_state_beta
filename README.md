# NPC State Beta 0.4.3

Experimental one-pass NPC continuity for SillyTavern, continuing directly from stable NPC State v0.3.2.

NPC State 0.4.x keeps the durable dossier/storage model of v0.3, moves normal NPC observation into the same foreground generation that writes the RP response, and progressively restores or strengthens the deterministic continuity safeguards that existed in the older v0.2 line.

> **Beta note:** Stable NPC State v0.3 may remain installed, but disable it while testing this beta. Beta settings and sidecars are independent from stable NPC State.

## Architecture

- **One foreground generation on normal turns.** NPC State capture rides inside the same RP inference instead of requiring a mandatory second scanner request.
- The model emits one hidden `<npc_state_v1>...</npc_state_v1>` observation block. NPC State validates it, applies deterministic state rules, stores per-message/per-swipe metadata, and strips the transport from visible/stored chat.
- `present` remains the internal v0.3-compatible storage field, but its v0.4 meaning is **In chat**: individually relevant NPC participants still involved at exchange end, not everyone physically nearby.
- `exchangeActiveNpcIds` tracks NPCs who spoke, acted, were directly acted upon, or directly received/perceived a relevant event in the current exchange.
- `worldActiveNpcIds` separately tracks explicit off-screen activity.
- New NPCs use the same foreground semantic capture and may receive all grounded foundational information established by the exchange. Unknown biography stays unknown.
- A compact identity directory covers the wider known cast while fuller continuity dossiers are reserved for likely relevant NPCs.
- The separate full scanner remains available for **Scan current cast**, dossier **Refresh**, timeline rebase, edited/untracked branch recovery, and foreground-capture recovery.
- When embedded capture is expected but the foreground response completely omits `<npc_state_v1>`, NPC State automatically runs one full recovery scan. The **Malformed capture recovery** setting controls malformed-block recovery only.
- Known tracked swipes restore from exact branch checkpoints when available; stored embedded payloads provide a local replay fallback before another LLM call is considered.
- Inventory Block coexistence is supported. NPC State strips only its own control and preserves Inventory Block V05 / legacy update transports.
- Stable v0.3.x sidecars can be cloned once into an independent beta sidecar. **v0.2 migration is intentionally not part of the 0.4 line.**

## Current feature set

### NPC identity and participation

- Stable locally assigned NPC IDs. Model-invented `npc-*` IDs are non-authoritative.
- Human-facing display-name protection prevents machine IDs/slugs from becoming dossier names.
- Proper names take precedence over generic role labels when a canonical name is known.
- Multiple new NPCs and multiple existing NPC updates can be captured in one foreground response.
- Incidental crowds, nearby workers, unnamed guards, and mentioned-only characters do not become **In chat** merely because they are physically present.
- Optional new-NPC admission policies:
  - **Balanced**: named NPCs and genuinely unique relevant role-label NPCs may auto-create.
  - **Named preferred**: automatic dossiers require a proper/personal name.
  - **Manual**: scanners never create new dossiers automatically; existing NPCs still update normally.

### Durable dossier continuity

NPC State distinguishes live scene state from durable character canon.

Durable fields include:

- Name / aliases
- Role
- Species
- Actual and apparent age
- Appearance and physical forms
- Personality
- Behavioral profile
- Speech
- Mannerisms
- Background
- Key NPC relationships
- Important memories

Established **Appearance, Species, Background, and Role** are sticky canon. Real revisions use evidence-backed `canonChanges` rather than accepting casual scanner drift.

Established **Personality, Behavior, Speech, and Mannerisms** use durable evolution safeguards. Changes may be grounded as compatible refinement, gradual development, explicit lasting change, or development across a real narrated time skip. A single unusual scene or one-off gesture is not enough to rewrite the character.

Scanner-provided Importance is not allowed to ratchet dossier priority upward. Stored Importance remains user/editor-owned, while foreground relevance uses computed runtime salience from current participation/activity plus that manual preference.

### Form-aware appearance

Multi-form NPCs can retain durable appearance canon for arbitrary freeform physical forms:

```text
Base
Human
Demihuman
Partial manifestation
Wolf
Silver Dragon
Stormcrown Thunderbird
True Form
```

Forms are not restricted to a fixed enum.

- `currentForm` tracks the body/form currently being used.
- `appearanceForms` stores durable canonical descriptions for known forms.
- One exchange can establish several transformation stages, such as Base -> Partial manifestation -> Beast.
- Temporary, reversible, magical, elemental, spectral, or energy-made transformations may count when they create a coherent distinct body state or materially change anatomy/silhouette.
- Mere aura, glow, outfit, pose, disguise, mood, or injury is not a separate form.
- Existing form descriptions are sticky. Casual contradictory dimensions/colors/anatomy do not overwrite established canon.
- Real growth, evolution, correction, or other persistent physical changes use evidence-backed `appearanceFormChanges`.
- Older single-form dossiers can recover the original ordinary appearance as a neutral `Base` form when alternate forms are later discovered.
- Portrait prompts use the NPC's current physical form when one is active.

### Age continuity

- Actual age is chronological numeric data only: `25`, `~25`, `6 months`, etc.
- Life-stage labels such as `child`, `adult`, or `elderly` are rejected from the actual-age field.
- Apparent age is separate and uses an approximate numeric form such as `~25`.
- Established actual age is sticky against casual re-estimation.
- Legitimate birthdays, explicit elapsed-time updates that state the resulting age, and explicit corrections use the evidence-backed `ageChange` channel.

### Relationship system

Player-facing relationship axes remain:

- **Trust**
- **Affection**
- **Desire**
- **Tension**

The 0.4 relationship engine includes:

- Per-event strength caps.
- Fractional hidden progress.
- Increasing inertia at deeper relationship levels.
- Semantic recent-event deduplication so the same rescue/confession/betrayal/aftermath cannot be repeatedly farmed.
- Axis-count limits by event tier.
- Backend Desire validation: friendship, gratitude, rescue, trust, beauty, proximity, or generic affection do not by themselves establish attraction.
- Relationship Summary validation so prose cannot jump ahead of accepted numeric depth.
- Independent positive/negative milestone gates at absolute relationship depth **25 / 50 / 75 / 90**.
- Movement back toward neutral is never blocked by an outward milestone gate.

Exact relationship numbers remain private backend state for scoring, gates, inertia, and persistence. Foreground RP generation receives a qualitative relationship lens instead, reducing meter-feedback loops.

### NPC-to-NPC relationships and family continuity

- Key Relationships merge by named counterpart, so one incomplete scanner response cannot silently erase unrelated established ties.
- Removing an established tie requires explicit evidence-backed removal.
- Significant family/kinship/spouse/guardian/dependent relationships are stored in NPC dossiers as well as the social graph.
- Private family slots can retain countable unnamed relatives such as `two daughters` without creating fake placeholder NPC dossiers.
- Later named relatives can resolve those slots individually.
- Confirmed shared-parent information may conservatively infer sibling/twin-sibling continuity without inventing unsupported birth order or biological/adoptive details.

### Important Memories

- Important Memories are curated durable events/facts, not a chronological transcript.
- Deterministic semantic hygiene collapses obvious paraphrases of the same grounded event into one richer concise memory.
- Separate events involving the same people/topic remain separate memories.
- The dedupe pass is local token/event-anchor matching only: no embeddings and no additional model request.

### Optional new-NPC history enrichment

When enabled, the same foreground generation may receive a small recent visible-history capsule for a newly appearing NPC.

- Maximum six prior non-system messages / roughly 3500 visible characters.
- NPC State and Inventory machine transports are stripped from the capsule.
- Megumin reference blocks are not treated as ordinary event history.
- The **current visible exchange must independently admit the NPC first**.
- Older history may enrich durable foundational facts and Important Memories only.
- Older history cannot create an NPC by itself, establish In-chat presence, or replay relationship deltas.
- No second model generation is introduced.

### Branch, edit, swipe, and checkpoint safety

- Assistant fingerprints are based on canonical visible story text rather than transient NPC/Inventory controls or swipe-index noise.
- Forced rescans of an already processed assistant message do not apply the same relationship delta twice.
- Foreground observations are rejected if their producing assistant text was edited/replaced/deleted before application.
- Up to **4 exact sibling swipe checkpoints per assistant message** may coexist.
- Checkpoint recency is strictly monotonic even when several swipes are created within the same millisecond.
- Up to **48 checkpoints globally** are retained.
- Checkpoint history also has an approximately **4 MiB serialized-size pressure ceiling**.
- Stored embedded payload replay remains available after an older exact sibling checkpoint has been evicted.
- Timeline Rebase remains available when history changes cross the oldest recoverable branch baseline.

### Persistence and lifecycle safety

- Beta sidecars, settings, pointer hints, and writer locks are isolated from stable NPC State.
- Chat rename/delete lifecycle handling covers `CHAT_RENAMED`, `CHAT_DELETED`, and `GROUP_CHAT_DELETED`.
- Character-owner lifecycle handling covers `CHARACTER_RENAMED` and `CHARACTER_DELETED` when exposed by SillyTavern.
- Rename verifies the destination before retiring/removing the source.
- Deleted/retired sidecars cannot be silently resurrected by stale writers.
- Ambiguous filename-only ownership fails closed instead of borrowing the currently open character.
- Temporary network / 408 / 425 / 429 / 5xx sidecar mutations retry with bounded delays of approximately **1s -> 2s -> 5s**.
- Logical revision conflicts are never blindly retried.

### Megumin structured-block evidence adapter

Megumin Suite is **optional**. NPC State remains fully usable without it.

When a recognized `<Blocks>` master block is present, NPC State applies source-specific evidence authority:

- `World_State` may ground world/live/off-screen facts but cannot establish In-chat participation or current actions by itself.
- `NPC_Inner_Chatter` may inform private mood, goals, thoughts, or relationship context but cannot become visible speech/action/reaction by itself.
- Story/reference/tracker blocks do not count as ordinary current-scene events.
- `New_NPC` / `NPC_Update` blocks are firewalled from ordinary scene scanning.

For chats without recognized Megumin blocks, the adapter is dormant and ordinary text is scanned normally.

A deliberate dossier action/API may explicitly import matching `New_NPC` / `NPC_Update` reference data into an existing NPC. Structured import may reconcile durable dossier facts but **cannot** change In-chat state, current activity, Mood, Location, Goal, life/archive state, Importance, player relationship scores/summaries/history, or current social activity.

### Diagnostics

Read-only diagnostics are available from the browser console:

```js
NPCState.debugStatus()
NPCState.scanMetrics()
```

Diagnostics expose useful troubleshooting information such as:

- current version/chat key
- beta sidecar and revision
- hydration/busy state
- branch safety
- checkpoint count and byte usage
- NPC count
- In-chat / exchange-active / world-active IDs
- last scanned message
- structured-block detection
- active admission policy
- actual NPCs selected for continuity injection
- injection budget allocation

## 0.4.x feature history

### 0.4.0-beta.1 - One-pass foreground architecture

- Moved routine NPC observation into the same foreground RP generation.
- Added hidden `<npc_state_v1>` transport and message/swipe-local bookkeeping.
- Retained the full scanner for recovery/manual operations rather than every turn.
- Introduced **In chat** participation semantics.
- Added rich first-scene new-NPC bootstrap and selective continuity injection.
- Added Inventory Block coexistence and independent beta sidecars/settings.
- Added one-time stable v0.3 -> independent beta cloning.

### 0.4.1 - Identity, forms, age, and branch correctness

- Added freeform form-aware appearance with `currentForm`, `appearanceForms`, multi-stage transformation capture, baseline-form recovery, and evidence-gated form revision.
- Hardened actual/apparent age semantics.
- Made local NPC IDs and human-facing names authoritative over model-generated technical identities.
- Clarified concrete activity/condition semantics for `status`.
- Added automatic recovery when foreground capture is completely missing.
- Hardened multiple-NPC creation/update behavior and Key Relationship capture.
- Restored deterministic 25/50/75/90 relationship milestone gates.
- Hardened fingerprints, swipe payload isolation, stale foreground rejection, branch mutation safety, bundle compatibility, and relationship rescan idempotence.
- Removed the legacy v0.2 migration path from the beta.

### 0.4.2 - Relationship depth, character evolution, and family continuity

- Restored fractional relationship progress, depth inertia, event dedupe, tier axis limits, Desire firewall, and Relationship Summary validation.
- Restored bounded exact sibling swipe snapshots.
- Added evidence-gated durable evolution for Personality, Behavior, Speech, and Mannerisms.
- Made Key Relationships omission-safe and added explicit removal authority.
- Added private family slots and conservative shared-parent sibling/twin inference.
- Restored owner-safe chat rename/delete lifecycle hardening.
- Added the optional Megumin structured-block evidence firewall.
- Added evidence-gated `ageChange`.
- Added optional zero-extra-call new-NPC history enrichment.

### 0.4.3 - Canon stability, memory hygiene, persistence, and observability

- Replaced exact relationship-meter injection with a qualitative relationship lens.
- Reserved most dynamic injection budget for likely relevant full dossiers.
- Made ordinary Appearance, Species, Background, and Role durable evidence-gated canon.
- Separated manual Importance from computed runtime salience.
- Added deterministic semantic Important Memory dedupe/compaction.
- Restored character-owner rename/delete lifecycle handling.
- Added bounded transient sidecar-write retry and checkpoint byte-pressure limits.
- Added deliberate Megumin `New_NPC` / `NPC_Update` dossier import without weakening ordinary evidence firewalls.
- Added Balanced / Named preferred / Manual new-NPC admission modes.
- Added `NPCState.debugStatus()` and `NPCState.scanMetrics()` troubleshooting APIs.

For implementation-level details and individual hardening fixes, see [`CHANGELOG.md`](CHANGELOG.md).

## Testing beside stable NPC State

Disable the stable NPC State extension while exercising this beta. Stable may remain installed and its settings/data remain untouched. On first load for a chat with no beta sidecar, 0.4.3 can clone the stable v0.3 sidecar into a beta-owned sidecar and then diverges independently.

## Recommended live-test targets

The static/regression suite covers the current feature stack, but real SillyTavern event timing still matters. Useful beta torture tests include:

- Continue on an existing assistant message.
- Heavy swipe creation/deletion and returning to older sibling swipes.
- Mid-history edits/deletions and Timeline Rebase.
- Very large NPC rosters and continuity-budget selection.
- Multiple NPCs entering/leaving the conversation in one exchange.
- Relationship events around 25/50/75/90 gates.
- Long-running personality, appearance, age, memory, and family continuity.
- Character/chat rename and deletion.
- Temporary sidecar/network write failure.
- Inventory Block coexistence.
- Megumin and non-Megumin chats.
- Balanced / Named preferred / Manual NPC admission modes.
