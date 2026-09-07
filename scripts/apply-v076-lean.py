from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text)

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)

# Shared rules stay mandatory, but remove repeated prose and keep stable markers
# used by prior compatibility tests and local diagnostics.
p = 'src/scan-helpers.js'
s = read(p)
s = replace_once(
    s,
    """const DOSSIER_IDENTITY_BOOTSTRAP_RULES = Object.freeze([
    'IDENTITY HANDOFF: EXISTING NPCs use supplied stable ids. NEW NPCs leave id empty, use their canonical human-facing name/readable unique role label in activity references, and let NPC State assign the stored id.',
    'BOOTSTRAP/ENRICHMENT: new relevant NPCs capture supported current-exchange dossier facts; unsupported facts stay unknown. A name-only stored dossier is EXISTING and enriches through semanticUpdates, never duplicate admission.',
]);
""",
    """const DOSSIER_IDENTITY_BOOTSTRAP_RULES = Object.freeze([
    'IDENTITY HANDOFF: EXISTING NPC patches use supplied stable ids; name-only dossiers enrich via semanticUpdates. NEW NPC patches leave id empty, use the canonical human-facing name/readable unique role label in activity refs, and let NPC State assign the stored id.',
]);
""",
    'lean identity rule',
)
s = replace_once(
    s,
    """function dossierExtractionGroupSummary() {
    return DOSSIER_EVALUATION_GROUPS.map(group => {
        const fields = DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field]?.group === group);
        return `${group}=[${fields.join(',')}]`;
    }).join(' ');
}
""",
    """function dossierExtractionGroupSummary() {
    return DOSSIER_EVALUATION_GROUPS.map(group => {
        const fields = DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field]?.group === group);
        return `${group}:${fields.join(',')}`;
    }).join(';');
}
""",
    'lean extraction map',
)
s = replace_once(
    s,
    """export function dossierExtractionPromptRules({ includeNew = true, includeExisting = true } = {}) {
    const modes = [];
    if (includeNew) modes.push('NEW: inspect the CURRENT exchange and fill every supported identity/canon+appearance/profile/live/memory/NPC-tie/Current-Dynamic fact; unsupported stays unknown');
    if (includeExisting) modes.push('EXISTING: compare only supplied context, enrich missing facts via semanticUpdates, preserve unrelated values/entries/locks');
    return [
        `DOSSIER EXTRACTION: ${dossierExtractionGroupSummary()}. ${modes.join('. ')}.`,
        'EVALUATION: fieldEvaluations={unchanged:[],insufficient:[],unavailable:[]} uses field ids; proposed fields stay in bootstrap/semanticUpdates. evaluatedGroups is group-only. contextCoverage.unavailable/partial means compacted/truncated stored context, not an empty field.',
        'SAME-GENERATION CHECK: after visible narrative and before the payload, silently verify supported appearance/profile/live/memories/ties/Current Dynamic were considered. A demonstrated tendency may be described narrowly; an observed gesture may be recorded as observed, never promoted to a lifelong habit. Do not output reasoning/checklists.',
    ];
}
""",
    """export function dossierExtractionPromptRules({ includeNew = true, includeExisting = true } = {}) {
    const modes = [];
    if (includeNew) modes.push('NEW: fill every supported current identity/appearance/profile/live/memory/NPC-tie/Current-Dynamic fact; unsupported stays unknown');
    if (includeExisting) modes.push('EXISTING: compare supplied context, enrich missing facts via semanticUpdates, preserve unrelated values/locks');
    return [
        `DOSSIER EXTRACTION MAP: ${dossierExtractionGroupSummary()}. ${modes.join('. ')}.`,
        'EVALUATION: fieldEvaluations={unchanged:[],insufficient:[],unavailable:[]} uses field ids; evaluatedGroups is group-only. contextCoverage.unavailable/partial means compacted/truncated stored context, not empty.',
        'PRIVATE COMPLETENESS CHECK: after visible narrative and before payload, silently verify supported appearance/profile/live/memories/ties/Current Dynamic. Narrow observed gestures/tendencies are allowed; never promote one observation to a lifelong habit or output reasoning.',
    ];
}
""",
    'lean extraction rules',
)
write(p, s)

# Remove duplication from the foreground-only contract. Shared extraction rules
# above retain the new obligations under every budget level.
p = 'src/foreground-contract.js'
s = read(p)
s = replace_once(
    s,
    "        `ONE DOSSIER UPDATE PIPELINE: for an EXISTING dossier, ordinary changes use semanticUpdates only for ${fields}. Operations are ${SEMANTIC_UPDATE_OPERATIONS.join('|')}. Do not also emit legacy profileChanges/canonChanges/ageChange/appearanceFormChanges/keyRelationshipChanges or direct replacements for those fields. New NPC bootstrap may still use direct grounded fields.`,",
    "        `ONE DOSSIER PIPELINE: EXISTING extraction-map fields use semanticUpdates (${SEMANTIC_UPDATE_OPERATIONS.join('|')}) only; never also emit legacy/direct replacements. NEW bootstrap may use grounded direct fields.`,",
    'lean foreground pipeline',
)
s = replace_once(
    s,
    "        `COVERAGE: for an exchange-active existing NPC, inspect every dossier group visible in its supplied context and include evaluatedGroups from ${groups}. Use fieldEvaluations for field-level unchanged/insufficient/unavailable outcomes; a group declaration alone is not field-level proof. The live group specifically means every supplied first-pass live value (${firstPassLiveFields}) was considered. Do not claim unavailable compacted context was checked.`,",
    "        `COVERAGE: exchange-active EXISTING NPCs list evaluatedGroups for supplied groups and fieldEvaluations for unchanged/insufficient/unavailable fields; group-only is not field proof. ${firstPassLiveFields} remain required comparisons.`,",
    'lean foreground coverage',
)
s = replace_once(
    s,
    "        'PROFILE/CANON: sleeping, unconsciousness, silence while asleep, isolated reactions, poses, temporary moods/forms and one-off gestures are not durable personality/speech/canon. Later grounded characterization may replace obsolete temporary placeholders. Form-specific traits stay scoped. Chronological age is separate from apparentAge; replacing established age needs ageKind birthday|elapsed|correction and the resulting grounded number.',",
    "        'PROFILE/CANON: temporary states/poses do not become durable personality/speech/canon. Later grounded characterization may replace obsolete placeholders; form traits stay scoped. age is separate from apparentAge and established age replacement needs grounded ageKind birthday|elapsed|correction.',",
    'lean foreground profile',
)
s = replace_once(
    s,
    "        `FIRST-PASS LIVE STATE: ${firstPassLiveFields} are never budget-pruned for a selected existing dossier. Compare all four with current evidence. Use establish/replace only when current truth warrants it, remove only when the stored value conclusively ended without replacement, and emit no cosmetic update when it remains valid or evidence is insufficient. A missing value in supplied context means the stored value is empty, not compacted away. currentForm is also a live semantic scalar. Status is activity/condition, never presence/lifecycle.`,",
    "        `FIRST-PASS LIVE STATE: ${firstPassLiveFields} are never pruned for selected EXISTING dossiers; compare them, preserve on insufficient evidence, remove only when conclusively ended. currentForm is live too; status is activity/condition, not presence.`,",
    'lean foreground live',
)
s = replace_once(
    s,
    "        'COLLECTIONS: behaviorProfile, mannerisms, keyRelationships and memories preserve unrelated entries. Important Memories are durable distinct events/facts, not paraphrase logs. keyRelationships is NON-PLAYER ties only.',",
    "        'COLLECTIONS: behaviorProfile/mannerisms/keyRelationships/memories preserve unrelated entries. Memories are distinct durable events/facts; keyRelationships is NON-PLAYER only.',",
    'lean foreground collections',
)
s = replace_once(
    s,
    "        'LIFECYCLE/PLAYER RELATIONSHIP: death/return uses lifeStateUpdates; dead-to-alive requires livingReturn:true. Every exchange-active NPC has relationshipChange.evaluated=true; nonzero trust/affection/desire/tension needs exact current-exchange evidence. relationshipSummary is a separate descriptive NPC-to-PLAYER Current Dynamic: a new/materially changed current proposal uses relationshipSummaryEvidence={excerpts:[1-3 exact permitted current excerpts],explanation}; zero numeric deltas are valid and preferred when the interaction does not justify score movement. Never infer desire from friendliness.',",
    "        'LIFECYCLE/PLAYER RELATIONSHIP: death/return uses lifeStateUpdates; dead-to-alive requires livingReturn:true. Exchange-active NPCs evaluate relationshipChange; nonzero axes need exact current evidence. Current Dynamic is separate: changed relationshipSummary uses relationshipSummaryEvidence={excerpts:[1-3 exact permitted current excerpts],explanation}; zero deltas are valid. Never infer desire from friendliness.',",
    'lean foreground relationship',
)
s = replace_once(
    s,
    "        'OUTPUT keys: exchangeActiveNpcIds,inChatNpcIds,worldActiveNpcIds,npcs,socialEdges,familyFacts,lifeStateUpdates. NPC patches may include evaluatedGroups + compact fieldEvaluations; existing ordinary changes use semanticUpdates, while new NPCs may include grounded direct bootstrap fields. Current Dynamic proposals include relationshipSummaryEvidence. Emit the block even when there are no changes; no markdown fences.',",
    "        'OUTPUT: exchangeActiveNpcIds,inChatNpcIds,worldActiveNpcIds,npcs,socialEdges,familyFacts,lifeStateUpdates. NPC patches use evaluatedGroups/fieldEvaluations plus semanticUpdates or grounded NEW bootstrap; changed Current Dynamic includes relationshipSummaryEvidence. Emit even with no changes; no fences.',",
    'lean foreground output',
)
write(p, s)

# Do not spend foreground bytes saying coverage is empty. Only emit it when
# compaction actually hides or truncates stored material.
p = 'src/foreground-context.js'
s = read(p)
s = replace_once(
    s,
    "        recentProfileEvidence: profileEvidence,\n        contextCoverage: { unavailable, partial },\n    };",
    "        recentProfileEvidence: profileEvidence,\n        ...(unavailable.length || partial.length ? { contextCoverage: {\n            ...(unavailable.length ? { unavailable } : {}),\n            ...(partial.length ? { partial } : {}),\n        } } : {}),\n    };",
    'conditional context coverage',
)
write(p, s)

# Deliberate contract-version changes are part of this release.
for p in ['tests/dossier-pipeline-consolidation.test.mjs', 'tests/live-state-semantic-updates.test.mjs']:
    s = read(p)
    s = s.replace('assert.equal(FOREGROUND_CONTRACT_VERSION, 4);', 'assert.equal(FOREGROUND_CONTRACT_VERSION, 5);')
    write(p, s)

print('Applied v0.7.6 lean foreground consolidation.')
