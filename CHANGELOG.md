# Changelog

## v0.4.6

- Fixes the timeline-rebase recovery control after the categorized settings redesign. When branch safety requires an explicit rebase, the warning and **Rebase to current chat** action now mount inside **Recovery & Branch Safety**, which is opened automatically while recovery is required.

## v0.4.5

- Simplifies appearance presentation to two authoritative reader-facing surfaces: resolved Current appearance and the complete Appearance forms registry. Redundant standalone Current form and Shared / ordinary appearance lines are removed from dossier display and foreground continuity while all underlying storage, editing, form synchronization, age progression, portrait, and scanner safeguards remain unchanged.

## v0.4.4

- Reorganizes the growing settings surface into compact semantic collapsible categories without changing tracking, persistence, branch, Inventory, or dossier behavior. Tracking remains open by default while secondary categories stay collapsed.

## v0.4.3

- Adds optional passive Birthday continuity metadata with durable evidence-backed correction, manual locking/editing, scanner/injection/dossier/structured-import support, and fantasy-calendar-safe freeform storage. Optional Off/Unknown/Random fill can populate missing birthdays locally; Random uses a configurable month/day pool and stable internal generated provenance so later explicit canon supersedes generated values without displaying provenance labels. Birthday metadata never derives from age, advances age, tracks calendar dates, or independently authorizes age-linked appearance evolution.

- Deep-audit follow-up grounds automatic relationship changes for EXISTING NPCs against the actual current relationship-evidence context too. A model-written evidence sentence that is absent from the exchange can no longer move visible scores, accumulate hidden fractional progress, or enter semantic relationship-evidence history. Manual dossier relationship edits remain authoritative and bypass the scanner path.

- Deep-audit hardening closes cross-feature edge cases found after the phased release: long-message NPC/reference matching no longer truncates at identity-key length; gradual character development requires a genuinely different assistant message; form corrections, Key Relationship removals, and family facts are grounded against source evidence; World_State world-active authority is backend-filtered; unrelated <Blocks> wrappers stay inert while truncated recognized wrappers fail closed; life/death/resurrection changes are evidence-gated; Named preferred cannot be bypassed by a mislabeled role identity; explicitly named returning NPCs receive foreground dossier priority; fully disabling capture+continuity removes the prompt; manual name/alias collisions are rejected; deceased manual restore normalizes back to alive; and branch rollback preserves current user-locked canon plus editor-owned Importance.

- Appearance/maturation hardening synchronizes legacy Base-compatible appearance, resolves current appearance consistently across dossier/injection/portrait surfaces, allows grounded shared appearance updates for form-aware NPCs, and adds conservative age-linked visual evolution after accepted birthday/elapsed age transitions without changing age normalization or age-continuity rules. Corrections/manual age edits do not mature appearance; long-lived, ageless, and unknown maturation stays conservative; accelerated growth is supported; unrelated canonical traits and manual locks remain protected.

- Phase 6 adds lightweight new-NPC admission control without reviving the v0.2 candidate database: Balanced preserves current behavior, Named preferred auto-admits only proper/personal names, and Manual prevents scanner-created dossiers while existing NPC updates continue. It also adds read-only NPCState.debugStatus() / scanMetrics() diagnostics covering sidecar revision, branch safety, checkpoint count/bytes, current activity sets, structured-block detection, admission mode, and actual injection selection/budget.
- Phase 5 restores deliberate Megumin New_NPC / NPC_Update dossier import without weakening the structured-evidence firewall. An explicit dossier More-menu/API action may reconcile only durable identity/profile/forms/key-relationship/memory fields from matching master-block sources; it cannot alter presence, live state, life/archive state, Importance, player relationship scores/summaries/history, or social activity. Chats without matching Megumin blocks return locally with no model call or write.
- Phase 4 restores owner-wide character lifecycle handling for SillyTavern CHARACTER_RENAMED/CHARACTER_DELETED, adds bounded 1s/2s/5s retries for transient network/408/425/429/5xx sidecar mutations without ever retrying logical revision conflicts, and adds a 4 MiB serialized checkpoint-history pressure ceiling on top of the existing 48-global/4-sibling count limits.
- Phase 3 adds deterministic semantic hygiene for Important Memories. Near-duplicate paraphrases of the same grounded event collapse to one richer concise entry during normalization and scan application, while separate events involving the same people/topic remain distinct. This is local token/event-concept matching only, with no embeddings or extra model calls.
- Phase 2 makes ordinary Appearance, Species, Background, and Role durable scalar canon with an explicit evidence-backed canonChanges revision channel. Scanner-supplied importance can no longer ratchet dossier priority upward; stored importance remains user/editor-owned while foreground selection uses computed runtime salience from In-chat/current activity plus that manual preference.
- Phase 1 replaces raw player-relationship meter injection with a compact qualitative lens and reserves most dynamic prompt budget for likely-relevant full dossiers. Large identity directories and optional new-NPC history can no longer starve In-chat continuity, while exact numeric relationship values remain private backend state for gates, inertia, and scoring.
- Begins the phased v0.4.3 continuity, durability, structured-source, and observability pass. Each phase is applied and verified independently on top of the complete v0.4.2 chain.

## v0.4.2

- Phase 7B adds optional one-pass new-NPC history enrichment without restoring v0.2 backfill calls. When enabled, the foreground capture receives at most six prior non-system messages / 3500 visible characters, with Megumin reference blocks and NPC/Inventory transports removed. The capsule can enrich only durable foundational facts and memories after the current exchange independently admits the new NPC. Backend current-exchange identity matching prevents history-only dossier creation, and new-NPC numeric relationship evidence must still be grounded in the live exchange. A settings toggle disables the capsule entirely.
- Phase 7A adds an explicit evidence-gated ageChange channel. Established chronological ages remain sticky against casual contradictory prose; automatic revision now requires a grounded birthday, explicit elapsed-time update, or explicit correction that states the resulting numeric age. Appearance guesses and unstated arithmetic fail closed, while manual dossier edits remain authoritative.
- Phase 6 adds a narrowly auto-detected Megumin <Blocks> evidence adapter. Non-Megumin text is unchanged and gets no extra foreground rules. World_State may ground live/off-screen state but not In-chat/action/new-NPC admission; NPC_Inner_Chatter may ground private mood/goal/relationship context but not presence/action/speech/visible reaction; other master-block children are excluded from ordinary event evidence. Backend activity/new-NPC admission, relationship/profile grounding, and stale-reference retention use the same authority filter.
- Phase 5 restores owner-safe chat lifecycle hardening for CHAT_RENAMED, CHAT_DELETED, and GROUP_CHAT_DELETED. Rename copies and verifies the destination sidecar, revision-retires the source before pointer publication, and only then removes the retired file; deletion likewise retires before pointer removal. Filename-only delete events act only on a unique owner-qualified beta pointer, ambiguous same-name chats fail closed, no active owner is borrowed, stale-tab writes to retired sources are rejected, and lifecycle handlers are time-bounded so SillyTavern event delivery cannot hang indefinitely.
- Phase 4 makes Key Relationships omission-safe by merging per named counterpart and requiring an explicit evidence-backed removal channel. It also adds a bounded private family-slot graph for countable unnamed relatives, partial later resolution, graph provenance/confidence, and conservative shared-parent sibling/twin-sibling inference without creating placeholder NPC dossiers. Family slots persist through sidecars/checkpoints and optional portable-bundle data.
- Phase 2 follow-up makes checkpoint recency strictly monotonic so rapid sibling swipes created within the same millisecond still evict the true oldest sibling deterministically.
- Phase 3 restores durable characterization safeguards for Personality, Behavioral Profile, Speech, and Mannerisms. New NPCs can still establish a rich baseline immediately, but established fields require grounded refine/gradual/explicit/batch evidence; gradual concepts need cross-scan confirmation, explicit changes need lasting-change cues, batch changes need a real narrated time skip, refinement cannot hide identity flips, and one-off gestures cannot become permanent mannerisms.
- Phase 2 restores bounded exact sibling swipe snapshots: up to four distinct content-lineage checkpoints may coexist for one assistant message, while v0.4.2 keeps swipe-index-independent fingerprints, the global 48-checkpoint bound, and stored embedded-payload replay as fallback after older sibling eviction.
- Phase 1 restores v0.2 relationship hardening on top of the v0.4 milestone gates: fractional evidence progress, depth inertia, tier axis-count limits with tied-overflow rejection, recent semantic event dedupe, a narration-backed Desire firewall, and Relationship Summary depth validation. Blocked/duplicate events cannot rewrite the summary, while checkpoint-blocked evidence is retained only in the short hidden dedupe ledger.
- Begins the phased v0.4.2 hardening line. Each recovery phase is applied and verified independently before the next phase is introduced.

## v0.4.1

- Restored deterministic relationship milestone gates from the pre-v0.3 relationship model: each axis/direction now checkpoints at 25/50/75/90, requires meaningful/major/extreme evidence to deepen past those boundaries, records hidden directional unlock history, allows movement toward neutral, preserves already-passed legacy depths, and upgrades the exact old stock evidence rubric without overwriting custom rubrics.
- Baseline form recovery: rescanning a previously half-captured multi-form NPC can recover the legacy ordinary appearance as Base when the exchange explicitly ends back in that body, even if an alternate form such as Beast was already stored by an older scan.
- Multi-stage form capture hardening: temporary/reversible magical or spectral body transformations can now be recorded as forms when they materially change anatomy, partial manifestation and full-beast states can both be captured from one exchange, and an existing single-form appearance is preserved as a neutral Base form when alternates first appear.
- Form-aware appearance: multi-form NPCs now track currentForm plus durable named appearanceForms, preserve unrelated/established forms across transformations, require evidence-gated revisions for explicit physical changes, inject known forms back into relevant turns, expose form editing in dossiers, and use the current form for portrait prompts while ordinary NPC appearance remains backward-compatible.
- Age semantics hardening: actual age is now numeric chronological data only, existing numeric ages are scanner-sticky instead of being re-estimated, recovery/Refresh prompts receive the stored age, and life-stage labels such as child/adult/elderly are rejected from age fields.
- Hardened new-NPC display-name authority: `npc-*` transport ids/slugs can no longer become dossier names; grounded human aliases/activity references are promoted to the canonical display name, existing bad technical names self-repair when a trustworthy alias exists, and unresolved machine-only identities fail closed instead of polluting the roster.
- Hardened new-NPC identity authority: model-invented ids are ignored for new dossiers, existing dossiers reconcile by canonical name when an unknown id is returned, proper names take priority over role labels, and same-payload activity/social references map to the locally allocated stable id.
- Clarified dossier current status semantics: status now means the NPC concrete immediate activity, situation, or condition, never active/inactive/in-chat/off-screen/archive lifecycle state. Lifecycle-only status pollution is rejected deterministically and existing generic values normalize away on load.
- Missing embedded foreground capture now automatically falls back to one full separate current-cast scan whenever embedded scanning is enabled; the recovery toggle now applies only to malformed embedded blocks.
- Silenced foreground missing-capture warnings when NPC State or embedded auto-scan is intentionally disabled; any stray NPC transport is cleanup-only and never applied.
- Preserved social edges between secondary existing NPCs when both have valid returned dossier patches, even if an imperfect activity array omitted them.
- Isolated stored foreground payload replay per active swipe: when a concrete swipe record exists, missing swipe metadata no longer falls back to potentially stale message-level metadata from another variant.
- Made forced rescans of an already-scanned assistant message relationship-idempotent: dossier/profile reconciliation may run again, but the same current-exchange relationship delta is not applied twice.
- Closed the pre-lock embedded stale-payload race: foreground apply now carries the exact cleaned assistant text that produced the payload and rejects it if that message was edited, replaced, deleted, or shifted before the engine lock begins.
- Deep hardening: fixed 0.4.1 bundle self-compatibility, beta relationship-history namespace isolation, embedded stale-operation protection, unsafe-branch mutation gates, and deterministic targeted Refresh isolation.
- Deep hardening: added Inventory Block v0.5 transport compatibility, portrait-light rollback snapshots, generic structured collection normalization, total injection-budget accounting, and per-message checkpoint compaction for swipe-heavy chats.
- Canonicalized assistant-message branch fingerprints so transient `<npc_state_v1>` / Inventory controls and swipe-index renumbering do not make unchanged visible narrative look like a different branch; existing 0.4.1 sidecars perform a one-time rollback-hash reset while preserving dossiers, relationships, and memories.
- Applied every returned existing-NPC dossier patch in foreground/recovery scans instead of silently discarding secondary NPC updates when an activity-reference array is incomplete; relationship deltas remain exchange-gated and world-only updates remain restricted.
- Canonicalized assistant-message branch fingerprints so transient `<npc_state_v1>` and `INVENTORY_BLOCK_UPDATE` controls do not make an unchanged visible narrative look like a different branch after post-generation cleanup; existing 0.4.1 sidecars perform a one-time rollback-hash reset while preserving dossiers, relationships, and memories.
- Canonicalized assistant-message branch fingerprints so transient `<npc_state_v1>` and `INVENTORY_BLOCK_UPDATE` controls do not make an unchanged visible narrative look like a different branch after post-generation cleanup; this improves recent message-delete rollback reliability.
- Fixed multi-NPC existing-dossier updates so every valid returned NPC patch in the same foreground/recovery output can be applied even when the model imperfectly omits a secondary existing NPC from an activity array; relationship deltas remain exchange-gated and world-only NPCs retain restricted update semantics.
- Fixed multi-NPC embedded bootstrap so one foreground payload can create every individually relevant new NPC in the same response; idless new `npcs` entries are now retained as bootstrap candidates even if the model imperfectly omits a secondary name from the activity arrays.
- Normalized structured **Key relationships** values at the schema and scanner boundaries so object-shaped model output can no longer persist or render as `[object Object]`; prompts now require canonical string entries such as `Mira - sister`.
- Hardened **Key relationships** capture: explicit family/kinship/spouse/guardian/dependent ties must be recorded in each involved NPC dossier, while `socialEdges` remains complementary graph data rather than a substitute; newly revealed ties now count as material collection updates for existing NPCs.
- Fixed new-NPC bootstrap capture so **Behavioral profile** and **Mannerisms** (plus other evolving collections) are populated from grounded first-scene evidence instead of defaulting to `null`; `null` remains the unchanged sentinel for existing dossiers.
- Retained the full separate structured scanner as a contingency while keeping normal automatic turns on the one-pass embedded foreground path.
- Added optional **Automatic recovery scanner** fallback for missing or malformed `<npc_state_v1>` capture. It is off by default; manual **Scan current cast** remains available regardless.
- Restored changed-branch recovery without reintroducing a mandatory second request: tracked swipes restore from checkpoints, stored swipe payloads can replay locally when needed, and edited/untracked branches fall back to the separate scanner when branch rescan is enabled.
- Invalidated stored embedded metadata on assistant edits so stale machine observations cannot be reapplied to rewritten prose.
- Hardened foreground transport stripping so duplicate NPC blocks are rejected and removed, truncated NPC output is fail-closed, and Inventory Block 0.4 terminal controls are preserved.
- Standardized the separate recovery scanner on the same **in-chat** semantics as embedded mode instead of the v0.3.2 strict physical-presence rule.
- Updated dossier/status/settings wording from **Present** / strict physical presence to **In chat** / individually relevant current participants while keeping the internal `present` field for v0.3 sidecar compatibility.
- Removed the v0.2 migration path from the 0.4 beta. The supported upgrade path is stable v0.3.x -> independent v0.4.1 beta clone.
- Kept stable v0.3 relationship/history, memories, dossier evolution, portraits, bundles, stale management, branch checkpoints/rebase, manual tools, social graph, Megumin integration, and sidecar protections intact.

## v0.4.0-beta.1

- Reworked normal automatic NPC accounting into a **foreground embedded scan** performed by the same LLM generation that writes the RP response, eliminating the routine second `generateRaw` scanner request.
- Added the hidden `<npc_state_v1>...</npc_state_v1>` transport. NPC State extracts, validates, applies, and removes this machine payload from the visible/stored assistant message after generation.
- Kept the existing v0.3 scanner as an explicit **recovery and reconciliation path** for `Scan current cast` and dossier Refresh instead of running it automatically after every response.
- Added a full current-exchange semantic capture contract rather than a sparse database-patch contract. The model reports current NPC observations while NPC State remains authoritative for identity matching, relationship caps, relationship history, dossier curation, stale lifecycle, checkpoints, and persistence.
- Added rich **new NPC bootstrap capture** through the same embedded scan used for existing NPCs. Newly introduced individually relevant NPCs may populate grounded identity, role, species, age/apparent age, appearance, personality, behavior, speech, mannerisms, background, mood, location, goals, status, relationship evidence, memories, social ties, life state, and importance without inventing unsupported biography.
- Changed automatic live-cast semantics from strict physical presence to **in-chat presence**. `inChatNpcIds` tracks individually relevant NPCs still participating in the active scene/conversation at exchange end; incidental crowds, background workers, nearby guards, and merely mentioned characters no longer become live cast solely from proximity.
- Preserved `exchangeActiveNpcIds` as the current-exchange participation signal and `worldActiveNpcIds` as the explicit off-screen activity signal, keeping interaction, in-chat presence, and off-screen activity independent.
- Added a compact known-NPC identity directory plus fuller continuity dossiers for likely relevant NPCs so surprise returning NPCs can still resolve identity without serializing every full dossier into every prompt.
- Added foreground transport failure handling: a missing, duplicate, truncated, or invalid NPC block is rejected without automatic dossier mutation, leaving manual `Scan current cast` available as recovery.
- Added per-message and per-swipe beta metadata for accepted foreground observations so embedded transport can be removed from visible prose while retaining message-local bookkeeping.
- Updated branch/edit/swipe reconciliation to avoid automatically launching the old background scanner during ordinary branch changes in the beta path.
- Added explicit **Inventory Block 0.4 coexistence ordering**: NPC State never claims the final machine position and instructs the model to place `<npc_state_v1>` before Inventory Block's terminal `INVENTORY_BLOCK_UPDATE` control.
- Hardened NPC transport stripping so it removes only the NPC State block and preserves peer machine controls such as Inventory Block's update payload regardless of which extension processes the response first.
- Added an Inventory coexistence smoke test verifying that NPC State parsing succeeds, its own transport is stripped, and `INVENTORY_BLOCK_UPDATE` survives untouched.
- Isolated beta runtime settings under `npc_state_beta` so stable NPC State and the beta do not share extension settings state.
- Isolated beta sidecar filenames, pointer hints, and writer locks so beta testing cannot overwrite the stable v0.3 sidecar.
- Added one-time **stable v0.3 → beta sidecar cloning** when a chat has stable NPC State data but no beta sidecar yet. The beta reads the compatible v0.3 payload once, writes an independent beta-owned copy, and diverges from stable thereafter.
- Added CI gates for the beta transformation, generated-runtime JavaScript syntax, foreground parser behavior, Inventory Block transport preservation, and stable/beta storage isolation.
- Kept the v0.3 dossier schema and durable state model compatible so existing relationships, histories, memories, portraits, profile locks, archives, social ties, stale state, bundles, and branch machinery continue forward without a schema reset.

## v0.3.2

- Added explicit **Rebase to current chat** recovery when edits or deletions cross NPC State's oldest recoverable v0.3 checkpoint.
- Replaced the dead-end `prebaseline-diverged` UX with a recoverable **Timeline rebase required** state that distinguishes pure prebaseline truncation from an incompatible rewrite.
- Rebasing preserves durable dossiers, portraits, relationship state/history, memories, manual profile locks, archives, retention flags, social ties, suppression data, and deletion tombstones while clearing strict presence, off-screen activity, latest observation, chat-local message references, and incompatible branch checkpoints.
- Relative stale inactivity age is rebased to the surviving chat instead of being blindly reset, and social/relationship source message IDs are cleared because deletion can shift chat indices.
- A successful rebase establishes the surviving chat as a fresh branch baseline and force-scans its latest assistant exchange even when automatic scanning is disabled.
- Added a conditional recovery card inside Tracking plus clearer scan/refresh warnings so `branch-unsafe` is no longer exposed as an unexplained internal status.

## v0.3.1

- Added configurable **Dossier Evolution** working caps for Important memories, Key relationships, Mannerisms, and Behavioral profile. Defaults remain 5 / 12 / 8 / 8, with guarded maximums of 20 / 30 / 16 / 16.
- Separated user working caps from higher schema storage ceilings so increasing a limit genuinely persists more entries, while lowering a limit does not immediately destructively truncate untouched dossier data.
- Reworked the four bounded dossier collections from append-only accumulation into self-curating canonical sets. Scanner `null` means preserve the current collection; an array is the complete authoritative replacement and may merge, rewrite, retire, reorder, clear, or displace entries as canon evolves.
- Updated the scanner prompt to include each collection's current contents and configured cap so still-relevant older facts can survive curation even when the latest exchange does not repeat them.
- Updated targeted dossier refresh to use the same curated-replacement semantics without replaying player relationship deltas or changing global physical presence.
- Manual dossier editing now obeys the configured working caps instead of hardcoded 5 / 12 / 8 / 8 limits.
- Canonicalized apparent age to one numeric approximation such as `~25`; vague decade bands and ranges are rejected rather than stored as apparent age.
- Reserved Trust / Affection / Desire / Tension plus Relationship Summary for NPC-to-player state. Key relationships and social edges are non-player ties, and unlocked legacy player duplicates are cleaned during scan/refresh.
- Restored manual **Attach portrait**, **Change portrait**, and **Remove portrait** controls in the canonical dossier More menu while retaining the local image-prompt workflow.
- Moved the dossier editor into the browser top layer on supported clients, resolving mobile/tablet clipping and host stacking-context failures while retaining the direct editor Save/Cancel flow.
- Hardened the Megumin/Inventory shared tab integration so NPC State can recreate a missing Present NPC holder after host rebuilds and recover across extension load-order changes.

## v0.3.0

- Rebuilt NPC State around a clean v0.3 runtime instead of extending the v0.2 compatibility stack.
- Replaced automatic cast-wide backfill queues and detached per-NPC refresh chains with one current-cast scan transaction.
- Separated current-exchange participation, strict final-scene physical presence, and off-screen world activity.
- Defined full reconciliation targets as exactly `exchangeActive + finalPresent`.
- Restricted relationship-score changes to current-exchange evidence while allowing older context for profile and memory recovery.
- Added serialized per-chat operations, stale-result invalidation, atomic state commits, branch-safe v0.3 checkpoints, and stable-ID deletion tombstones.
- Added independent revisioned v0.3 sidecars with cross-tab write protection and fail-closed missing-file handling.
- Added a one-way v0.2 importer that preserves durable dossier data while leaving the original v0.2 sidecar untouched.
- Added one searchable canonical Dossier Library for present, world-active, off-screen, and archived NPCs.
- Redesigned the canonical Dossier Library around a dominant portrait hero instead of a permanent cast sidebar.
- Added a searchable horizontal portrait cast rail fixed at the bottom of the dossier viewer, with selected-card centering, previous/next controls, touch scrolling, and lifecycle status on each card.
- Reorganized dossier content into distinct Current, Relationship, Personality, Appearance, Behavioral profile, Speech, Mannerisms, Key relationships, Important memories, Background, and relationship-history blocks.
- Restored the portrait-heavy split-view grammar on desktop and landscape tablet so the portrait remains visible while the dossier document scrolls independently.
- Added responsive portrait-tablet and phone layouts that stack the portrait hero over one readable document column while retaining the bottom cast rail.
- Preserved the selected dossier's reading position across background refreshes, and explicit opens from other NPC State surfaces clear stale cast-search filters so the requested stable ID remains visible.
- Bound editor saves to an exact NPC ID and optimistic dossier version so cross-NPC and stale same-NPC overwrites are rejected.
- Added a UI-only Megumin master-block adapter that mounts the existing present-NPC roster as an `NPC State` tab when Megumin's tab/panel hosts are present, with standalone inline fallback when they are not.
- Kept Megumin outside the state architecture: the adapter owns no scanning, persistence, dossier import, or World State parsing.
- Added narrative-turn stale NPC management with configurable 30-turn archive and 50-turn total-inactivity cleanup defaults. Re-scanning the same assistant message does not advance stale age.
- Stale retention activity is refreshed by current interaction, final physical presence, explicit off-screen world activity, and canonical-name/alias references in the current exchange.
- Added automatic restoration for stale-archived NPCs that become narratively active again while leaving manual/deceased archives outside the stale cleanup path.
- Added hard stale-pruning protection for retention-protected dossiers and manually locked stable profiles.
- Kept automatic stale cleanup softer than manual Delete: stale cleanup does not create a permanent tombstone, while explicit user deletion still does.
- Added a manual stale-review surface with Open dossier, Reset activity, Protect, Archive/Restore, and Delete controls.
- Added portable v0.3 bundle export for full-chat backups and selected-NPC dossiers, preserving normalized dossiers, memories, relationships/history, social graph, portraits, suppression names, tombstones, archive/retention/stale data, and stable IDs.
- Kept branch checkpoints/baselines/lineage, latest observation state, sidecar revisions, migration/runtime state, and engine operation locks out of the bundle format.
- Added schema/version validation and whitelist normalization for every imported bundle before it reaches persistence.
- Added explicit stable-ID conflict handling: safe merge can keep or replace matching IDs, abort or skip hard ID/name conflicts, and never silently resurrect local manual tombstones or apply imported tombstones over live local dossiers.
- Added full-chat Replace durable state as a separate restore mode that replaces portable durable domains while retaining destination branch/runtime machinery and clearing imported live presence.
- Cross-chat imports now clear chat-local message references, rebase stale inactivity age, and safely drop social edges whose counterpart stable ID does not exist in the destination.
- Bundle preview/export are read-only; a successful bundle import is serialized into one sidecar commit and destination branch checkpoint, while rejected conflicts commit nothing.
- Added lightweight portrait prompt support with named reusable presets containing paired positive and negative channels, separate shared positive/negative prompt templates, and Natural/Tags/Hybrid formatting for the auto-built dossier character block.
- Existing single positive/negative portrait preset settings migrate into the first named `Default` preset without losing user text.
- Added New, Duplicate, Delete, rename, and default-selection controls for a multi-preset portrait library while keeping prompt templates shared across presets.
- Added **Generate image prompt** to the canonical dossier `More` menu. It opens a focused per-NPC positive/negative prompt dialog where any saved preset can be selected and copied without changing the default preset.
- Realigned portrait settings into explicit control rows and cards so titles, explanatory text, selects, inputs, and positive/negative textareas remain visually aligned on desktop and mobile.
- Added local placeholder resolution and live selected-NPC positive/negative preview with Copy Positive, Copy Negative, and Copy Both controls without adding any image API, automatic portrait generation, regeneration queue, or portrait workflow state.
- Preserved first-pass single portrait-preset/generation-prompt settings by migrating them into the positive channel, while intentionally blank presets/templates remain blank.
- Added focused v0.3 behavioral tests as the supported release gate.
- Moved the complete v0.2.23 repository snapshot, including its source, tests, reports, changelog, and documentation, under `legacy/v0.2.x/`.
- Made the repository root and default `main` branch the supported v0.3 install surface for SillyTavern.

Historical v0.2 release notes remain in the stable repository under `legacy/v0.2.x/CHANGELOG.md`.