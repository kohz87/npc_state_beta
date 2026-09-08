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


# Current Dynamic: the v0.5.28 identity path can deliberately keep the canonical proper
# name structured-only while validating a visible role/description anchor. Carry that
# already accepted enrichment fact into the descriptive summary validator instead of
# manufacturing a second lexical identity requirement there.
replace_once(
    'src/scan-relationships.js',
    """    if (!identityIndexes.length) return false;\n\n    // Both halves must come from the same permitted source record. This keeps the bridge\n""",
    """    const worldStateCanonicalEnrichmentAccepted = binding.worldStateCanonicalEnrichmentAccepted === true;\n    if (!identityIndexes.length && !worldStateCanonicalEnrichmentAccepted) return false;\n\n    // Both halves must come from the same permitted source record. This keeps the bridge\n""",
)

replace_once(
    'src/scan-relationships.js',
    """    const identityActivitySources = new Set([...activityBindings, ...identityBindings]\n        .filter(row => identityMentioned(row.excerpt, subjectNames, otherNpcNames))\n        .map(row => row.sourceId));\n    const bridgedSources = new Set([...playerActivitySources].filter(sourceId => identityActivitySources.has(sourceId)));\n""",
    """    const identityActivitySources = new Set([\n        ...activityBindings.filter(row => identityMentioned(row.excerpt, subjectNames, otherNpcNames)),\n        ...identityBindings.filter(row => worldStateCanonicalEnrichmentAccepted\n            || identityMentioned(row.excerpt, subjectNames, otherNpcNames)),\n    ].map(row => row.sourceId));\n    const bridgedSources = new Set([...playerActivitySources].filter(sourceId => identityActivitySources.has(sourceId)));\n""",
)

replace_once(
    'src/scan-relationships.js',
    """    const linkedSummarySources = new Set(identityIndexes\n        .map(index => excerptMatches[index]?.sourceId)\n        .filter(sourceId => sourceId && bridgedSources.has(sourceId)));\n    if ([...linkedSummarySources].some(summarySourceSafe)) return true;\n\n    // POV-independent fallback: accepted exchangeActive + exact activityEvidence is the\n""",
    """    // When the canonical proper name was accepted specifically through the current\n    // World_State enrichment path, the exact visible identity anchor remains identity\n    // authority. Exact summary quotes in that same safely bound source therefore need not\n    // repeat the anchor or structured-only name. Other identity paths keep the older\n    // summary-linked requirement below.\n    if (worldStateCanonicalEnrichmentAccepted && [...bridgedSources].some(summarySourceSafe)) return true;\n\n    const linkedSummarySources = new Set(identityIndexes\n        .map(index => excerptMatches[index]?.sourceId)\n        .filter(sourceId => sourceId && bridgedSources.has(sourceId)));\n    if ([...linkedSummarySources].some(summarySourceSafe)) return true;\n\n    // POV-independent fallback: accepted exchangeActive + exact activityEvidence is the\n""",
)

replace_once(
    'src/scan-application.js',
    """                    const identityEvidenceExcerpts = identityEvidenceAccepted && Array.isArray(identityRecord?.excerpts)\n                        ? identityRecord.excerpts.map(value => String(value || '').trim()).filter(Boolean).slice(0, 3)\n                        : [];\n                    return {\n""",
    """                    const identityEvidenceExcerpts = identityEvidenceAccepted && Array.isArray(identityRecord?.excerpts)\n                        ? identityRecord.excerpts.map(value => String(value || '').trim()).filter(Boolean).slice(0, 3)\n                        : [];\n                    const canonicalIdentity = canonicalPatchName(patch, []);\n                    const worldStateCanonicalEnrichmentAccepted = Boolean(identityEvidenceAccepted\n                        && canonicalIdentity\n                        && !containsNormalizedPhrase(currentVisibleText, canonicalIdentity)\n                        && worldStateCanonicalIdentityMention(patch, evidencePolicy));\n                    return {\n""",
)

replace_once(
    'src/scan-application.js',
    """                        identityEvidenceAccepted,\n                        identityEvidenceExcerpts,\n                        identityEvidenceBindings: identityEvidenceExcerpts.map(uniquelyOwnedRelationshipExcerptBinding).filter(Boolean),\n""",
    """                        identityEvidenceAccepted,\n                        worldStateCanonicalEnrichmentAccepted,\n                        identityEvidenceExcerpts,\n                        identityEvidenceBindings: identityEvidenceExcerpts.map(uniquelyOwnedRelationshipExcerptBinding).filter(Boolean),\n""",
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
new_intro = """## Release 0.5.29\n\n0.5.29 completes zero-delta Current Dynamic reuse for the v0.5.28 case where a first-seen NPC is grounded by exact visible identity evidence but receives its canonical proper name from current World_State. For that accepted enrichment path, exact same-source relationship-summary quotations may reuse the already accepted visible identity plus player-facing activity without repeating the visible anchor or structured-only name. Other identity paths retain their existing summary-link safeguards; wrong addressees, isolated quoted `you`, fabricated/out-of-scope evidence, and numeric relationship scoring remain separately guarded.\n"""
if text.count(old_intro) != 1:
    raise SystemExit('README.md: release intro mismatch')
text = text.replace(old_intro, new_intro, 1)
needle = '- **0.5.28:** unify visible identity anchors with optional current-World_State canonical-name enrichment and retire the older deterministic role-head bridge.\n'
if text.count(needle) != 1:
    raise SystemExit('README.md: 0.5.28 bullet mismatch')
text = text.replace(needle, needle + '- **0.5.29:** carry accepted World_State canonical-name enrichment into zero-delta Current Dynamic target binding without weakening other summary-target safeguards.\n', 1)
old_matrix = "Scanner input sizing is measured separately from foreground continuity and scanner output allowance. npm run measure:scan-prompts uses the existing local conservative estimator (ASCII/3.5 + non-ASCII*1.1) and the exact scanner system wrapper. 0.5.26 changes only the compact Current Dynamic target-binding wording; the stable matrix is 6,388 tokens for the minimal one-NPC fixture, 6,391 for a rich first encounter, 7,456 for three active plus one mentioned NPC, 6,715 for observation development, 8,057 for dense collections/locks/forms, 6,593 with 1,000 stored NPCs but one relevant NPC, 7,117 for structured blocks plus custom criteria, and 4,790 for targeted Refresh. The dense fixture is reported honestly against the approximate 7,500-token engineering target; no current-evidence truncation rule is introduced. A deliberately long current response remains about 21,345 estimated tokens because the current scene is preserved in full. These are local engineering estimates, not provider-reported usage."
new_matrix = "Scanner input sizing is measured separately from foreground continuity and scanner output allowance. npm run measure:scan-prompts uses the existing local conservative estimator (ASCII/3.5 + non-ASCII*1.1) and the exact scanner system wrapper. 0.5.29 does not change scanner prompt text; the current stable matrix is 6,386 tokens for the minimal one-NPC fixture, 6,389 for a rich first encounter, 7,453 for three active plus one mentioned NPC, 6,713 for observation development, 8,055 for dense collections/locks/forms, 6,591 with 1,000 stored NPCs but one relevant NPC, 7,118 for structured blocks plus custom criteria, and 4,794 for targeted Refresh. The dense fixture is reported honestly against the approximate 7,500-token engineering target; no current-evidence truncation rule is introduced. A deliberately long current response remains about 21,342 estimated tokens because the current scene is preserved in full. These are local engineering estimates, not provider-reported usage."
if text.count(old_matrix) != 1:
    raise SystemExit('README.md: prompt matrix paragraph mismatch')
readme.write_text(text.replace(old_matrix, new_matrix, 1))

changelog = ROOT / 'CHANGELOG.md'
text = changelog.read_text()
insert = """## 0.5.29\n\n- Fix first-contact zero-delta Current Dynamic when a new NPC is visibly grounded by exact role/description evidence but receives its canonical proper name through the current World_State enrichment path. The accepted visible identity remains identity authority for that descriptive relationship-summary bridge even when the canonical name itself is not visible.\n- Carry the already validated World_State-enrichment fact into Current Dynamic context plumbing so exact summary quotations from the same permitted visible source can reuse accepted player-facing activity without repeating the identity anchor. Other identity paths retain their existing summary-linked target checks.\n- Preserve known/unnamed wrong-addressee rejection, isolated quoted-second-person rejection, exact source ownership, and descriptive-versus-numeric relationship separation. Add Vrena-shaped production regressions for the accepted enrichment case and quoted-`you` negative boundary. No prompt text, extra scan, provider-specific rule, storage schema, model contract, or foreground contract change.\n\n"""
marker = '## 0.5.28\n'
if text.count(marker) != 1:
    raise SystemExit('CHANGELOG.md: 0.5.28 marker mismatch')
changelog.write_text(text.replace(marker, insert + marker, 1))

core = ROOT / 'docs/core-contract.md'
text = core.read_text()
old = "The summary does not have to repeat narrator text already validated for that activity. Reuse is transient, same-operation, one-permitted-source, and limited to activity evidence unambiguously owned by that accepted NPC patch; each supplied summary quotation still validates against permitted source text."
new = "The summary does not have to repeat narrator text already validated for that activity. When the accepted visible identity was canonically enriched by current World_State, that accepted visible identity may also supply the NPC side without forcing the summary to repeat the visible anchor or structured-only proper name. Reuse is transient, same-operation, one-permitted-source, and limited to identity/activity evidence unambiguously owned by that accepted NPC patch; each supplied summary quotation still validates against permitted source text. Other identity paths retain their existing summary-linked target checks."
if text.count(old) != 1:
    raise SystemExit('docs/core-contract.md: Current Dynamic reuse wording mismatch')
core.write_text(text.replace(old, new, 1))

print('Applied v0.5.29 Current Dynamic source-reuse release patch.')
