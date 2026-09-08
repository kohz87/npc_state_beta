from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    file = ROOT / path
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    file.write_text(text.replace(old, new, 1))


# Current Dynamic: reuse the already accepted identity evidence as identity authority even
# when the canonical proper name came from World_State and is not literally visible. The
# player-facing activity still has to be exact, current, visible, unambiguous, and same-source.
replace_once(
    'src/scan-relationships.js',
    """    if (!identityIndexes.length) return false;\n\n    // Both halves must come from the same permitted source record. This keeps the bridge\n""",
    """    // Both halves must come from the same permitted source record. This keeps the bridge\n""",
)

replace_once(
    'src/scan-relationships.js',
    """    const identityActivitySources = new Set([...activityBindings, ...identityBindings]\n        .filter(row => identityMentioned(row.excerpt, subjectNames, otherNpcNames))\n        .map(row => row.sourceId));\n    const bridgedSources = new Set([...playerActivitySources].filter(sourceId => identityActivitySources.has(sourceId)));\n""",
    """    const identityActivitySources = new Set([\n        ...activityBindings.filter(row => identityMentioned(row.excerpt, subjectNames, otherNpcNames)),\n        ...(binding.identityEvidenceAccepted === true ? identityBindings : []),\n    ].map(row => row.sourceId));\n    const bridgedSources = new Set([...playerActivitySources].filter(sourceId => identityActivitySources.has(sourceId)));\n""",
)

replace_once(
    'src/scan-relationships.js',
    """    const linkedSummarySources = new Set(identityIndexes\n        .map(index => excerptMatches[index]?.sourceId)\n        .filter(sourceId => sourceId && bridgedSources.has(sourceId)));\n    if ([...linkedSummarySources].some(summarySourceSafe)) return true;\n\n    // POV-independent fallback: accepted exchangeActive + exact activityEvidence is the\n""",
    """    // If accepted identity evidence and player-facing activity already bind this NPC and\n    // player to the same exact visible source, summary quotations from that source need not\n    // repeat the identity anchor or narrator wording. They still pass the same wrong-target,\n    // unnamed-other-dialogue, exact-source, and known-addressee guards above.\n    if ([...bridgedSources].some(summarySourceSafe)) return true;\n    if (!identityIndexes.length) return false;\n\n    // POV-independent fallback: accepted exchangeActive + exact activityEvidence is the\n""",
)

# Release labels stay independent from persisted schema/model/foreground versions.
replace_once('src/schema.js', "export const NPC_STATE_VERSION = '0.5.28';", "export const NPC_STATE_VERSION = '0.5.29';")
replace_once('tests/structure.test.mjs', "assert.equal(manifest.version, '0.5.28');", "assert.equal(manifest.version, '0.5.29');")
replace_once('tests/structure.test.mjs', "assert.match(schema, /NPC_STATE_VERSION = '0.5.28'/);", "assert.match(schema, /NPC_STATE_VERSION = '0.5.29'/);")
replace_once('DEVELOPMENT.md', '- Extension release: `0.5.28`', '- Extension release: `0.5.29`')

manifest_path = ROOT / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
if manifest.get('version') != '0.5.28':
    raise SystemExit(f"manifest.json: expected 0.5.28, found {manifest.get('version')!r}")
manifest['version'] = '0.5.29'
manifest_path.write_text(json.dumps(manifest, indent=4) + '\n')

# Concise release documentation.
readme = ROOT / 'README.md'
text = readme.read_text()
old_intro = """## Release 0.5.28\n\n0.5.28 unifies first-seen identity grounding: a visible proper/short name or unique role/description is the sole `identityEvidence.anchor`, and current World_State may enrich that already grounded individual with one compatible canonical proper name. The superseded deterministic role-head fallback is removed; structured-only names, fabricated/disconnected excerpts, ambiguous anchors, and policy/collision bypasses remain rejected.\n"""
new_intro = """## Release 0.5.29\n\n0.5.29 completes zero-delta Current Dynamic reuse for first-seen identities whose canonical proper name is enriched from current World_State. Once exact visible identity evidence and exact player-facing activity already bind the NPC and player in one permitted source, exact relationship-summary quotations from that source do not have to repeat the visible identity anchor or narrator wording. Wrong addressees, isolated quoted `you`, fabricated/out-of-scope evidence, and numeric relationship scoring remain separately guarded.\n"""
if text.count(old_intro) != 1:
    raise SystemExit('README.md: release intro mismatch')
text = text.replace(old_intro, new_intro, 1)
needle = '- **0.5.28:** unify visible identity anchors with optional current-World_State canonical-name enrichment and retire the older deterministic role-head bridge.\n'
if text.count(needle) != 1:
    raise SystemExit('README.md: 0.5.28 bullet mismatch')
text = text.replace(needle, needle + '- **0.5.29:** let grounded Current Dynamic reuse that accepted visible identity plus same-source player-facing activity even when the summary quotes do not repeat the identity anchor.\n', 1)
old_matrix = "Scanner input sizing is measured separately from foreground continuity and scanner output allowance. npm run measure:scan-prompts uses the existing local conservative estimator (ASCII/3.5 + non-ASCII*1.1) and the exact scanner system wrapper. 0.5.26 changes only the compact Current Dynamic target-binding wording; the stable matrix is 6,388 tokens for the minimal one-NPC fixture, 6,391 for a rich first encounter, 7,456 for three active plus one mentioned NPC, 6,715 for observation development, 8,057 for dense collections/locks/forms, 6,593 with 1,000 stored NPCs but one relevant NPC, 7,117 for structured blocks plus custom criteria, and 4,790 for targeted Refresh. The dense fixture is reported honestly against the approximate 7,500-token engineering target; no current-evidence truncation rule is introduced. A deliberately long current response remains about 21,345 estimated tokens because the current scene is preserved in full. These are local engineering estimates, not provider-reported usage."
new_matrix = "Scanner input sizing is measured separately from foreground continuity and scanner output allowance. npm run measure:scan-prompts uses the existing local conservative estimator (ASCII/3.5 + non-ASCII*1.1) and the exact scanner system wrapper. 0.5.29 does not change scanner prompt text; the current stable matrix is 6,386 tokens for the minimal one-NPC fixture, 6,389 for a rich first encounter, 7,453 for three active plus one mentioned NPC, 6,713 for observation development, 8,055 for dense collections/locks/forms, 6,591 with 1,000 stored NPCs but one relevant NPC, 7,118 for structured blocks plus custom criteria, and 4,794 for targeted Refresh. The dense fixture is reported honestly against the approximate 7,500-token engineering target; no current-evidence truncation rule is introduced. A deliberately long current response remains about 21,342 estimated tokens because the current scene is preserved in full. These are local engineering estimates, not provider-reported usage."
if text.count(old_matrix) != 1:
    raise SystemExit('README.md: prompt matrix paragraph mismatch')
readme.write_text(text.replace(old_matrix, new_matrix, 1))

changelog = ROOT / 'CHANGELOG.md'
text = changelog.read_text()
insert = """## 0.5.29\n\n- Fix first-contact zero-delta Current Dynamic when a new NPC is visibly grounded by a role/description but receives its canonical proper name from current World_State. Accepted exact identity evidence now remains identity authority for the relationship-summary bridge even when the canonical name itself is not visible.\n- Allow exact relationship-summary quotations from the same permitted visible source to reuse that already accepted identity plus player-facing exchange activity without repeating the identity anchor or narrator wording. Preserve known/unnamed wrong-addressee rejection, isolated quoted-second-person rejection, exact source ownership, and descriptive-versus-numeric relationship separation.\n- Add Vrena-shaped production regressions for dialogue-only summary evidence after World_State name enrichment and the quoted-`you` negative boundary. No prompt text, extra scan, provider-specific rule, storage schema, model contract, or foreground contract change.\n\n"""
marker = '## 0.5.28\n'
if text.count(marker) != 1:
    raise SystemExit('CHANGELOG.md: 0.5.28 marker mismatch')
changelog.write_text(text.replace(marker, insert + marker, 1))

core = ROOT / 'docs/core-contract.md'
text = core.read_text()
old = "The summary does not have to repeat narrator text already validated for that activity. Reuse is transient, same-operation, one-permitted-source, and limited to activity evidence unambiguously owned by that accepted NPC patch; each supplied summary quotation still validates against permitted source text."
new = "The summary does not have to repeat the accepted visible identity anchor or narrator text already validated for that activity when accepted identity evidence and player-facing activity bind the same NPC/player interaction in one permitted source. Reuse is transient, same-operation, one-permitted-source, and limited to identity/activity evidence unambiguously owned by that accepted NPC patch; each supplied summary quotation still validates against permitted source text."
if text.count(old) != 1:
    raise SystemExit('docs/core-contract.md: Current Dynamic reuse wording mismatch')
core.write_text(text.replace(old, new, 1))

print('Applied v0.5.29 Current Dynamic source-reuse release patch.')
