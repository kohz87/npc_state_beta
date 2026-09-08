from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing release anchor in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, count))

replace('manifest.json', '"version": "0.5.11"', '"version": "0.5.12"')
replace('src/schema.js', "export const NPC_STATE_VERSION = '0.5.11';", "export const NPC_STATE_VERSION = '0.5.12';")

p = Path('CHANGELOG.md')
text = p.read_text()
entry = '''# Changelog

## 0.5.12

- Fix automatic-scan synchronization so the recursion bypass exists only while invoking the scanner's own host generation call, not for the lifetime of its pending provider request. Ordinary next-turn generation now actually waits for the preceding scan, and a second real assistant completion remains eligible for its own queued scan while an earlier scanner request is pending.
- Expand routine Scan identity context with ambiguity-safe unique short-name matching. A returning inactive dossier such as `Bessa Vond` can be supplied when current narration uniquely says `Bessa`, while ambiguous shared short names remain unbound; explicitly mentioned archived/deceased dossiers are also supplied so resurrection extraction can reuse established identity/state instead of admitting a duplicate.
- Make automatic recovery status authoritative. Retry of a partial/failed settled boundary performs a fresh forced semantic rescan without replaying already-applied relationship scoring, `already-scanned` cannot erase a known partial/failed status, and a successful manual Scan of the same current source boundary is adopted by the coordinator so stale automatic failure state no longer blocks the next generation.
- Harden zero-delta Current Dynamic evidence against shortened quoted excerpts. Exact evidence is resolved back to its permitted original source, so narrator-addressed second person remains valid outside dialogue while a fragment taken from another character's quoted speech cannot turn quoted `you` into the player.
- Restore bounded `profileEvolutionEvidence` writing inside the current semantic pipeline for applied personality, behavioral-profile, speech, and mannerism changes. Observations retain source-message/turn ownership, normalize through the existing schema-1 collection, deduplicate same-source retries, and never stringify supported collection objects into `[object Object]`.
- Preserve the 0.5.11 post-response architecture, storage identity `npc_state_beta.v3`, persisted/settings schema 1, model semantic contract 6, foreground continuity contract 8, deterministic relationship mechanics, manual correction ownership, rollback/recovery, alternate routing, and guarded persistence. No database rebuild or storage migration is required.

'''
if not text.startswith('# Changelog\n'):
    raise SystemExit('unexpected changelog header')
p.write_text(entry + text[len('# Changelog\n\n'):])

p = Path('DEVELOPMENT.md')
text = p.read_text().replace('Extension release: `0.5.11`', 'Extension release: `0.5.12`')
text = text.replace('The 0.5.11 public label is an intentional renumbering over newer code', 'The 0.5.12 release continues the intentional 0.5.x public numbering over the newer codebase')
p.write_text(text)

p = Path('README.md')
text = p.read_text().replace('## Release 0.5.11', '## Release 0.5.12')
text = text.replace('Important settings retained by 0.5.11 include:', 'Important settings retained by 0.5.12 include:')
text = text.replace('Release label: **0.5.11**', 'Release label: **0.5.12**')
text = text.replace('The lower 0.5.11 presentation label', 'The 0.5.x presentation label')
old = '''Before the next ordinary generation, NPC State uses SillyTavern's awaited generation interceptor to settle the preceding response's owning scan and rebuild continuity. Scanner-generated quiet requests carry an internal lease so they do not wait on themselves. A failed or timed-out owning scan exposes an actionable Retry state and aborts the attempted next generation instead of silently using unsynchronized state.'''
new = '''Before the next ordinary generation, NPC State uses SillyTavern's awaited generation interceptor to settle the preceding response's owning scan and rebuild continuity. The recursion bypass exists only while invoking the scanner's own host generation call; it is not held for the provider request lifetime, so ordinary roleplay work cannot inherit scanner privileges. A failed or timed-out owning scan exposes an actionable Retry state and aborts the attempted next generation instead of silently using unsynchronized state.'''
if old not in text: raise SystemExit('missing README sync paragraph')
text = text.replace(old, new, 1)
old = '''Routine automatic Scan and manual **Scan current cast** treat the latest completed assistant message and its preceding user message as new-event evidence. At most two earlier non-system messages may be supplied as bounded reference context for antecedents; they are not new-event evidence. Only relevant/mentioned/currently active dossiers are serialized richly, so unrelated roster growth does not expand every routine scan.'''
new = '''Routine automatic Scan and manual **Scan current cast** treat the latest completed assistant message and its preceding user message as new-event evidence. At most two earlier non-system messages may be supplied as bounded reference context for antecedents; they are not new-event evidence. Relevant identity context accepts exact names/aliases and unique unambiguous short-name mentions, including explicitly mentioned archived/deceased dossiers; ambiguous short names are never guessed. Unrelated roster growth still does not expand every routine scan.'''
if old not in text: raise SystemExit('missing README scanner paragraph')
text = text.replace(old, new, 1)
old = '''Current Dynamic evidence may bind an NPC through an unambiguous short identity and the player through a full/unique short identity or narrator-addressed second person outside quoted dialogue. Quoted `you`, ambiguous aliases, wrong recipients, and unrelated NPC interactions remain rejected. Numeric relationship movement is independent and may remain zero.'''
new = '''Current Dynamic evidence may bind an NPC through an unambiguous short identity and the player through a full/unique short identity or narrator-addressed second person outside quoted dialogue. Exact excerpts are resolved within their original permitted source before quote/addressee checks, so shortening another character's quoted speech cannot turn quoted `you` into the player. Ambiguous aliases, wrong recipients, and unrelated NPC interactions remain rejected. Numeric relationship movement is independent and may remain zero.'''
if old not in text: raise SystemExit('missing README current dynamic paragraph')
text = text.replace(old, new, 1)
old = '''Existing dossiers evolve through the single `semanticUpdates` channel (`establish`, `refine`, `replace`, `remove`). The model judges narrative meaning; deterministic code validates source ownership, target identity, durability, manual locks, collection/form targeting, and permitted fields.'''
new = '''Existing dossiers evolve through the single `semanticUpdates` channel (`establish`, `refine`, `replace`, `remove`). The model judges narrative meaning; deterministic code validates source ownership, target identity, durability, manual locks, collection/form targeting, and permitted fields. Applied personality, behavioral-profile, speech, and mannerism changes append bounded source-owned `profileEvolutionEvidence`, so later exchanges can distinguish accumulated development from same-source retries.'''
if old not in text: raise SystemExit('missing README profile paragraph')
text = text.replace(old, new, 1)
p.write_text(text)

p = Path('docs/core-contract.md')
text = p.read_text()
old = '''- automatic post-response Scan and manual Scan current cast use the completed assistant response plus its immediately preceding user message when one exists; up to two earlier non-system messages may be supplied only as bounded reference context for antecedents or continuity;'''
new = '''- automatic post-response Scan and manual Scan current cast use the completed assistant response plus its immediately preceding user message when one exists; up to two earlier non-system messages may be supplied only as bounded reference context for antecedents or continuity; relevant stored identity context accepts exact names/aliases and only unique unambiguous short-name mentions, and an explicitly mentioned archived/deceased dossier remains eligible for compact identity/state context so lifecycle resurrection can bind to the established record;'''
if old not in text: raise SystemExit('missing core context bullet')
text = text.replace(old, new, 1)
old = '''Ordinary semantic operations are `establish`, `refine`, `replace`, and `remove`. The model decides narrative meaning. The validator owns permitted fields, source provenance, target identity, manual ownership, durability, collection/form targeting, and structural rules. English keyword lists or arbitrary repetition counts must not become general semantic authority.'''
new = '''Ordinary semantic operations are `establish`, `refine`, `replace`, and `remove`. The model decides narrative meaning. The validator owns permitted fields, source provenance, target identity, manual ownership, durability, collection/form targeting, and structural rules. Applied personality, behavioral-profile, speech, and mannerism changes append bounded normalized `profileEvolutionEvidence` carrying source-message/turn ownership; the same source/concept retry is not a second development observation, while grounded observations from later exchanges may accumulate. English keyword lists or arbitrary repetition counts must not become general semantic authority.'''
if old not in text: raise SystemExit('missing core semantic paragraph')
text = text.replace(old, new, 1)
old = '''Relationship scoring remains deterministic and separate: caps, gates, inertia, fractional progress, milestones, replay protection, evidence history, and descriptive Current Dynamic safeguards are extension-owned. Current Dynamic evidence is also separate from numeric scoring eligibility: a source-owned, correctly targeted descriptive relationshipSummary may establish or materially update at zero scores/zero deltas without creating relationship-change history, while intensity/milestone safeguards still reject unsupported depth. Target binding accepts canonical names, unambiguous short identity references, and narrator-addressed second person outside quoted dialogue; a bare quoted “you” or an ambiguous shared short name is never sufficient. Normal current-evidence proposals carry bounded exact summary evidence; explicit repair/reconciliation keeps its established accepted-history authority.'''
new = '''Relationship scoring remains deterministic and separate: caps, gates, inertia, fractional progress, milestones, replay protection, evidence history, and descriptive Current Dynamic safeguards are extension-owned. Current Dynamic evidence is also separate from numeric scoring eligibility: a source-owned, correctly targeted descriptive relationshipSummary may establish or materially update at zero scores/zero deltas without creating relationship-change history, while intensity/milestone safeguards still reject unsupported depth. Target binding accepts canonical names, unambiguous short identity references, and narrator-addressed second person outside quoted dialogue. Each exact excerpt is resolved against its original permitted source before quote/addressee classification, so a shortened fragment from another character's quoted dialogue cannot reclassify quoted “you” as the player; an ambiguous shared short name is likewise never sufficient. Normal current-evidence proposals carry bounded exact summary evidence; explicit repair/reconciliation keeps its established accepted-history authority.'''
if old not in text: raise SystemExit('missing core relationship paragraph')
text = text.replace(old, new, 1)
old = '''Post-response status is per chat and bounded: `idle`, `queued`, `scanning`, `saving`, `complete`, `partial`, `failed`, or `blocked`. Only the newest owned job may publish status. Partial semantic coverage is distinct from persistence success; a failed save cannot be presented as complete.'''
new = '''Post-response status is per chat and bounded: `idle`, `queued`, `scanning`, `saving`, `complete`, `partial`, `failed`, or `blocked`. Only the newest owned job may publish status. Partial semantic coverage is distinct from persistence success; a skipped `already-scanned` result never upgrades a known partial/failed boundary. Retry of a settled partial/failed current source performs a forced semantic rescan while existing replay protection prevents duplicate relationship scoring. A successful manual Scan of that exact current source boundary is adopted as the coordinator's settled result so stale automatic failure state cannot keep blocking the next generation. A failed save cannot be presented as complete.'''
if old not in text: raise SystemExit('missing core status paragraph')
text = text.replace(old, new, 1)
old = '''Before the user's next normal generation prompt is assembled, the supported awaited generation interceptor settles the preceding assistant response's owning automatic scan when Auto scan is enabled. This wait occurs outside the shared quiet-generation queue used by the scanner itself. Scanner-owned generation bypasses its own interceptor wait through a narrow in-process lease, preventing recursion/deadlock. On bounded wait/scan failure the interceptor aborts the attempted generation cleanly, preserves the user's input, and exposes Retry rather than hanging or silently using stale continuity. `autoScan=false` is an explicit opt-out from this synchronization.'''
new = '''Before the user's next normal generation prompt is assembled, the supported awaited generation interceptor settles the preceding assistant response's owning automatic scan when Auto scan is enabled. This wait occurs outside the shared quiet-generation queue used by the scanner itself. Scanner-owned generation bypasses its own interceptor wait only during the synchronous invocation that starts that scanner generation; the bypass is released as soon as the provider promise is obtained and is never held for the lifetime of the pending request. Ordinary roleplay generation and real assistant-completion processing therefore still synchronize while a scanner request is pending. On bounded wait/scan failure the interceptor aborts the attempted generation cleanly, preserves the user's input, and exposes Retry rather than hanging or silently using stale continuity. `autoScan=false` is an explicit opt-out from this synchronization.'''
if old not in text: raise SystemExit('missing core sync paragraph')
text = text.replace(old, new, 1)
p.write_text(text)

# Keep the release-specific test label current without altering behavior.
p = Path('tests/dossier-pipeline-consolidation.test.mjs')
if p.exists():
    t = p.read_text().replace('0.5.11 uses one canonical semantic field registry', '0.5.12 uses one canonical semantic field registry')
    p.write_text(t)

print('Prepared v0.5.12 release metadata and docs')
