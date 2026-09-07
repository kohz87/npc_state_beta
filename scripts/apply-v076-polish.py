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

# Keep mandatory foreground guidance compact enough that context still fits the
# established budgets. Identity + extraction are shared, but not duplicated prose.
p = 'src/scan-helpers.js'
s = read(p)
old_identity = """const DOSSIER_IDENTITY_BOOTSTRAP_RULES = Object.freeze([
    'IDENTITY HANDOFF: EXISTING NPC patches use the supplied stable id. NEW NPC patches leave id empty, use the canonical human-facing name (or unique readable role label while genuinely unnamed), and reference that exact name/label in activity arrays. NPC State assigns the stored id locally.',
    'NEW DOSSIER BOOTSTRAP: for a newly admitted relevant NPC, capture every supported fact established by the current exchange, including live state and grounded role/species/appearance/profile/canon/collection facts. Do not invent age, species, personality, relationships, or any other unsupported fact; empty/unknown is correct when evidence is absent.',
    'NAME-ONLY ENRICHMENT: a dossier that already exists but has only identity remains an EXISTING dossier. Keep its stable id and enrich grounded missing fields through normal semanticUpdates; never create a duplicate just to fill Unknown fields.',
]);
"""
new_identity = """const DOSSIER_IDENTITY_BOOTSTRAP_RULES = Object.freeze([
    'IDENTITY HANDOFF: EXISTING NPCs use supplied stable ids. NEW NPCs leave id empty, use their canonical human-facing name/readable unique role label in activity references, and let NPC State assign the stored id.',
    'BOOTSTRAP/ENRICHMENT: new relevant NPCs capture supported current-exchange dossier facts; unsupported facts stay unknown. A name-only stored dossier is EXISTING and enriches through semanticUpdates, never duplicate admission.',
]);
"""
s = replace_once(s, old_identity, new_identity, 'compact identity/bootstrap rules')
old_extract = """export function dossierExtractionPromptRules({ includeNew = true, includeExisting = true } = {}) {
    const rows = [
        `DOSSIER EXTRACTION MAP: ${dossierExtractionGroupSummary()}.`,
    ];
    if (includeNew) rows.push(
        'NEW DOSSIER EXTRACTION: for every newly admitted individually relevant NPC, inspect the CURRENT exchange across identity, canon/appearance, profile, live state, important memories, non-player ties, and NPC-to-player Current Dynamic. Populate every supported fact now; leave unsupported facts unknown. Do not stop after name, personality, speech, or the four live fields.',
        'FIRST-SCENE PROFILE: a clearly demonstrated working/social tendency may support a restrained behaviorProfile entry. An observed gesture may be recorded as the observed gesture when useful, but one isolated gesture does not prove a lifelong recurring mannerism. Never invent age, species, backstory, motives, relationships, or habits from genre expectations.',
    );
    if (includeExisting) rows.push(
        'EXISTING DOSSIER EXTRACTION: compare supplied stored values with permitted evidence and enrich supported missing fields through semanticUpdates. Preserve unrelated values and collection entries, locks, identity ownership, and source rules. contextCoverage.unavailable lists fields hidden by budget compaction; an ordinary field absent from the compact dossier but NOT listed unavailable is known empty. contextCoverage.partial means only part of that stored field was supplied, so never infer absence/removal from omitted entries.',
    );
    rows.push(
        'FIELD EVALUATION DETAIL: fieldEvaluations={unchanged:[],insufficient:[],unavailable:[]} uses canonical field ids only. Proposed fields belong in direct NEW bootstrap or semanticUpdates and should not be repeated there. insufficient means the field was actually considered but permitted evidence did not support a proposal; unavailable means required stored context was not supplied. evaluatedGroups remains backward-compatible group-level metadata and never proves that every field in a group was individually checked.',
        'PRIVATE COMPLETENESS CHECK: after composing the visible narrative and before emitting the NPC State payload, silently review each relevant NPC against the extraction map and add any still-missing supported proposals/evaluations. Do not reveal reasoning, a checklist, or chain-of-thought; emit only the normal visible narrative and structured payload.',
    );
    return rows;
}
"""
new_extract = """export function dossierExtractionPromptRules({ includeNew = true, includeExisting = true } = {}) {
    const modes = [];
    if (includeNew) modes.push('NEW: inspect the CURRENT exchange and fill every supported identity/canon+appearance/profile/live/memory/NPC-tie/Current-Dynamic fact; unsupported stays unknown');
    if (includeExisting) modes.push('EXISTING: compare only supplied context, enrich missing facts via semanticUpdates, preserve unrelated values/entries/locks');
    return [
        `DOSSIER EXTRACTION: ${dossierExtractionGroupSummary()}. ${modes.join('. ')}.`,
        'EVALUATION: fieldEvaluations={unchanged:[],insufficient:[],unavailable:[]} uses field ids; proposed fields stay in bootstrap/semanticUpdates. evaluatedGroups is group-only. contextCoverage.unavailable/partial means compacted/truncated stored context, not an empty field.',
        'SAME-GENERATION CHECK: after visible narrative and before the payload, silently verify supported appearance/profile/live/memories/ties/Current Dynamic were considered. A demonstrated tendency may be described narrowly; an observed gesture may be recorded as observed, never promoted to a lifelong habit. Do not output reasoning/checklists.',
    ];
}
"""
s = replace_once(s, old_extract, new_extract, 'compact shared extraction rules')
write(p, s)

# Keep field-evaluation diagnostics backward-compatible for consumers that
# compare the legacy zero-count shape exactly: new counters appear only when used.
p = 'src/operation-diagnostics.js'
s = read(p)
s = replace_once(
    s,
    "const summary = { accepted: 0, rejected: 0, unchanged: 0, insufficient: 0, unavailable: 0, omitted: 0, reasons: [] };",
    "const summary = { accepted: 0, rejected: 0, unchanged: 0, omitted: 0, reasons: [] };\n    let insufficient = 0;\n    let unavailable = 0;",
    'diagnostic summary compatibility',
)
s = s.replace("else if (status === 'insufficient-evidence') summary.insufficient += 1;", "else if (status === 'insufficient-evidence') insufficient += 1;")
s = s.replace("else if (status === 'context-unavailable') summary.unavailable += 1;", "else if (status === 'context-unavailable') unavailable += 1;")
s = replace_once(
    s,
    "    summary.reasons = uniqueStrings(reasons);\n    return summary;",
    "    if (insufficient > 0) summary.insufficient = insufficient;\n    if (unavailable > 0) summary.unavailable = unavailable;\n    summary.reasons = uniqueStrings(reasons);\n    return summary;",
    'diagnostic conditional counters',
)
s = s.replace("proposals: { accepted: 0, rejected: 0, unchanged: 0, insufficient: 0, unavailable: 0, omitted: 0, reasons: [] },", "proposals: { accepted: 0, rejected: 0, unchanged: 0, omitted: 0, reasons: [] },")
write(p, s)

# Resolve the player identity once from the same chat/exchange used for model
# prompting, and pass it into deterministic summary/evidence validation.
p = 'src/engine.js'
s = read(p)
s = replace_once(
    s,
    "import { createOperationDiagnostics, operationHistoryIdentity, summarizeProposalDiagnostics } from './operation-diagnostics.js';",
    "import { createOperationDiagnostics, operationHistoryIdentity, summarizeProposalDiagnostics } from './operation-diagnostics.js';\nimport { resolvePlayerName } from './scan-helpers.js';",
    'engine player identity import',
)
# Current Scan and first pass.
s = replace_once(s, "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                relationshipContext: relationshipContextForExchange(exchange),", "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                playerName: resolvePlayerName('', chat, messageId),\n                relationshipContext: relationshipContextForExchange(exchange),", 'scan player identity')
s = replace_once(s, "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                relationshipContext: relationshipContextForExchange(exchange),", "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                playerName: resolvePlayerName('', chat, messageId),\n                relationshipContext: relationshipContextForExchange(exchange),", 'embedded player identity')
# Completeness uses the same current exchange but no numeric relationship mutation.
s = replace_once(s, "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                relationshipContext: '',", "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                playerName: resolvePlayerName('', liveChat, messageId),\n                relationshipContext: '',", 'completeness player identity')
# Targeted Refresh reconciliation receives the target chat identity too.
s = replace_once(s, "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                dossierLimits: settings.dossierLimits,", "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                playerName: resolvePlayerName('', liveChat, messageId),\n                dossierLimits: settings.dossierLimits,", 'refresh player identity')
# Historical replay must validate the same NPC-to-player target as the original exchange.
s = replace_once(s, "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                relationshipContext: relationshipContextForExchange(exchange),", "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                playerName: resolvePlayerName('', historicalChat, nextMessageId),\n                relationshipContext: relationshipContextForExchange(exchange),", 'recovery player identity')
write(p, s)

# Retain the established anti-placeholder instruction while adding zero-delta evidence.
p = 'src/scan-prompts.js'
s = read(p)
s = replace_once(
    s,
    "Zero deltas and impact none are correct when descriptive context changes without score-worthy movement. Do not rewrite for style or invent numeric movement just to qualify a summary.',",
    "Zero deltas and impact none are correct when descriptive context changes without score-worthy movement. Never copy schema instructions, field descriptions, placeholders, or labels into the summary. Do not rewrite for style or invent numeric movement just to qualify a summary.',",
    'scan placeholder guard',
)
s = replace_once(
    s,
    "This targeted refresh may reconcile relationshipSummary without changing any relationship score. Never rewrite merely for style.',",
    "This targeted refresh may reconcile relationshipSummary without changing any relationship score. Never copy an output-schema instruction or placeholder into the field; never rewrite merely for style.',",
    'refresh placeholder guard',
)
write(p, s)

# Align the semantic contract with the acceptance rule for observed gestures:
# store what was actually observed without declaring it a durable habit.
p = 'src/model/semantic-updates.js'
s = read(p)
s = replace_once(
    s,
    "        'Profile fields are personality, behaviorProfile, speech and mannerisms. Mannerisms represent durable recurring tendencies, not isolated gestures. Form-specific traits stay scoped when relevant.',",
    "        'Profile fields are personality, behaviorProfile, speech and mannerisms. A directly observed distinctive gesture may be recorded when phrased as that observation; one observation never proves a recurring/lifelong habit. Form-specific traits stay scoped when relevant.',",
    'observed gesture semantics',
)
write(p, s)

# Version-bearing regression assertions intentionally advance with the changed
# model/foreground contracts. Behavioral expectations otherwise stay intact.
for p in ['tests/dossier-pipeline-consolidation.test.mjs', 'tests/live-state-semantic-updates.test.mjs']:
    s = read(p)
    s = s.replace('assert.equal(NPC_STATE_MODEL_CONTRACT_VERSION, 3);', 'assert.equal(NPC_STATE_MODEL_CONTRACT_VERSION, 4);')
    write(p, s)

p = 'tests/model-led-updates.test.mjs'
s = read(p).replace('/NPC STATE DOSSIER UPDATE CONTRACT v3/', '/NPC STATE DOSSIER UPDATE CONTRACT v4/')
write(p, s)

p = 'tests/foreground-injection.test.mjs'
s = read(p).replace('/FOREGROUND CONTRACT v4/g', '/FOREGROUND CONTRACT v5/g')
write(p, s)

# The first pass live-state contract version is asserted in one more focused test.
p = 'tests/first-pass-live-state.test.mjs'
s = read(p).replace('/FOREGROUND CONTRACT v4/', '/FOREGROUND CONTRACT v5/')
write(p, s)

print('Applied v0.7.6 polish changes.')
