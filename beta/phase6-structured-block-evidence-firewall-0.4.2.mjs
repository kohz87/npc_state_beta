import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function rep(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase-6 marker: ' + label);
    return source.replace(from, to);
}

write('v03/evidence-adapter.js', String.raw`function clean(value, max = 50000) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}
function normalizeTag(value) {
    return String(value || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '');
}
function normalizePhrase(value) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ').trim();
}
const WORLD_TAGS = new Set(['worldstate']);
const INNER_TAGS = new Set(['npcinnerchatter']);

export function analyzeStructuredEvidence(value) {
    const source = String(value ?? '');
    const masters = [];
    const masterPattern = /<Blocks\b[^>]*>([\s\S]*?)<\/Blocks\s*>/gi;
    let match;
    while ((match = masterPattern.exec(source))) masters.push({ full: match[0], body: match[1] || '' });
    if (!masters.length) return { detected: false, visibleText: source, worldStateText: '', innerChatterText: '', excludedText: '', excludedTags: [] };
    let visibleText = source;
    const world = [];
    const inner = [];
    const excluded = [];
    const excludedTags = [];
    for (const master of masters) {
        visibleText = visibleText.replace(master.full, '\n');
        const childPattern = /<([A-Za-z][A-Za-z0-9_-]*)\b[^>]*>([\s\S]*?)<\/\1\s*>/g;
        let child;
        while ((child = childPattern.exec(master.body))) {
            const tag = String(child[1] || '');
            const body = clean(child[2], 30000);
            const key = normalizeTag(tag);
            if (WORLD_TAGS.has(key)) world.push(body);
            else if (INNER_TAGS.has(key)) inner.push(body);
            else {
                if (body) excluded.push(body);
                if (tag && !excludedTags.includes(tag)) excludedTags.push(tag);
            }
        }
    }
    return {
        detected: true,
        visibleText: clean(visibleText),
        worldStateText: clean(world.join('\n')),
        innerChatterText: clean(inner.join('\n')),
        excludedText: clean(excluded.join('\n')),
        excludedTags: excludedTags.slice(0, 40),
    };
}
export function hasRecognizedStructuredBlocks(value) {
    return analyzeStructuredEvidence(value).detected;
}
export function scannerEvidenceText(value) {
    const view = analyzeStructuredEvidence(value);
    if (!view.detected) return String(value ?? '');
    const parts = [];
    if (view.visibleText) parts.push('[VISIBLE NARRATIVE | full event evidence]\n' + view.visibleText);
    if (view.worldStateText) parts.push('[MEGUMIN World_State | live location/status/off-screen context only; NOT proof of in-chat presence, exchange action, or new-NPC introduction]\n' + view.worldStateText);
    if (view.innerChatterText) parts.push('[MEGUMIN NPC_Inner_Chatter | private goals/thoughts/attitudes/relationship context only; NOT proof of in-chat presence, exchange action, speech, gesture, or visible reaction]\n' + view.innerChatterText);
    if (view.excludedTags.length) parts.push('[MEGUMIN reference/control blocks excluded from ordinary event evidence: ' + view.excludedTags.join(', ') + ']');
    return parts.join('\n\n');
}
export function relationshipEvidenceText(value) {
    const view = analyzeStructuredEvidence(value);
    return view.detected ? [view.visibleText, view.innerChatterText].filter(Boolean).join('\n') : String(value ?? '');
}
export function profileEvidenceText(value) {
    const view = analyzeStructuredEvidence(value);
    return view.detected ? view.visibleText : String(value ?? '');
}
export function retentionEvidenceText(value) {
    const view = analyzeStructuredEvidence(value);
    return view.detected ? [view.visibleText, view.worldStateText, view.innerChatterText].filter(Boolean).join('\n') : String(value ?? '');
}
export function buildExchangeEvidencePolicy(exchange) {
    const user = analyzeStructuredEvidence(exchange?.user?.mes || '');
    const assistant = analyzeStructuredEvidence(exchange?.assistant?.mes || '');
    return {
        detected: user.detected || assistant.detected,
        visibleText: [user.visibleText, assistant.visibleText].filter(Boolean).join('\n'),
        worldStateText: [user.worldStateText, assistant.worldStateText].filter(Boolean).join('\n'),
        innerChatterText: [user.innerChatterText, assistant.innerChatterText].filter(Boolean).join('\n'),
        excludedText: [user.excludedText, assistant.excludedText].filter(Boolean).join('\n'),
        excludedTags: [...new Set([...(user.excludedTags || []), ...(assistant.excludedTags || [])])],
    };
}
function containsReference(text, variants) {
    const haystack = ' ' + normalizePhrase(text) + ' ';
    return (Array.isArray(variants) ? variants : [variants]).some(value => {
        const needle = normalizePhrase(value);
        return Boolean(needle && haystack.includes(' ' + needle + ' '));
    });
}
export function evidenceReferenceScope(policy, variants) {
    if (!policy?.detected) return 'unrestricted';
    if (containsReference(policy.visibleText, variants)) return 'visible';
    if (containsReference(policy.worldStateText, variants)) return 'world';
    if (containsReference(policy.innerChatterText, variants)) return 'inner';
    if (containsReference(policy.excludedText, variants)) return 'excluded';
    return 'unmentioned';
}
export function structuredEvidencePromptRules() {
    return [
        'STRUCTURED BLOCK EVIDENCE FIREWALL (active because a Megumin <Blocks> master block is present):',
        '- Visible narrative outside <Blocks> is ordinary full event evidence.',
        '- <World_State> may ground live location/status/off-screen world activity, but by itself NEVER proves exchange action, In chat participation, speech, direct perception, or a new NPC introduction.',
        '- <NPC_Inner_Chatter> may ground private goals, thoughts, attitudes, or relationship context, but by itself NEVER proves In chat presence, exchange action, spoken dialogue, gesture, or a visible emotional reaction.',
        '- Other children of <Blocks>, including Story Tracker, Character Sheet, CYOA, Bonds, New_NPC, NPC_Update, and custom/reference blocks, are NOT current-event evidence for ordinary NPC State scanning.',
        '- Never convert private thought into visible behavior unless visible narrative independently establishes that behavior.',
    ];
}
`);

let scanner = read('v03/scanner.js');
scanner = rep(scanner,
    "import {\n    DEFAULT_RELATIONSHIP_CAPS,",
    "import { evidenceReferenceScope, hasRecognizedStructuredBlocks, scannerEvidenceText, structuredEvidencePromptRules } from './evidence-adapter.js';\nimport {\n    DEFAULT_RELATIONSHIP_CAPS,",
    'scanner import');
scanner = rep(scanner,
    'text: compactText(message.mes, 7000),',
    'text: compactText(scannerEvidenceText(message.mes), 7000),',
    'history transform');
scanner = rep(scanner,
    '    const limits = normalizeDossierLimits(dossierLimits);\n    const contract = {',
    "    const limits = normalizeDossierLimits(dossierLimits);\n    const structuredDetected = [exchange.user?.mes, exchange.assistant?.mes, ...nonSystemMessages(chat).slice(-Math.max(2, Math.min(30, Number(scanDepth) || 8))).map(message => message.mes)].some(hasRecognizedStructuredBlocks);\n    const contract = {",
    'recovery detection');
scanner = rep(scanner,
    "        '- DURABLE PROFILE EVOLUTION: a new NPC may establish grounded foundational personality/behavior/speech/mannerisms from its first rich scene. For an EXISTING established field, never rewrite personality, behaviorProfile, speech, or mannerisms merely because one scene looks different. Any genuine change requires a matching profileChanges entry with field, mode, stable concept label, and concrete evidence. refine adds compatible detail only and must not smuggle no-longer/became/increasingly transitions or morality flips. gradual development requires the same concept to be independently supported on a later scan. explicit requires narration that clearly establishes a lasting/corrective change. batch requires an actual narrated time skip plus development across that skipped period. A one-off gesture is not a permanent mannerism; mannerism seeding needs recurring/habit language or repeated confirmation.',\n        '',",
    "        '- DURABLE PROFILE EVOLUTION: a new NPC may establish grounded foundational personality/behavior/speech/mannerisms from its first rich scene. For an EXISTING established field, never rewrite personality, behaviorProfile, speech, or mannerisms merely because one scene looks different. Any genuine change requires a matching profileChanges entry with field, mode, stable concept label, and concrete evidence. refine adds compatible detail only and must not smuggle no-longer/became/increasingly transitions or morality flips. gradual development requires the same concept to be independently supported on a later scan. explicit requires narration that clearly establishes a lasting/corrective change. batch requires an actual narrated time skip plus development across that skipped period. A one-off gesture is not a permanent mannerism; mannerism seeding needs recurring/habit language or repeated confirmation.',\n        ...(structuredDetected ? structuredEvidencePromptRules() : []),\n        '',",
    'recovery rules');
scanner = rep(scanner,
    "compactText(exchange.user?.mes || '', 10000)",
    "compactText(scannerEvidenceText(exchange.user?.mes || ''), 10000)",
    'current user evidence');
scanner = rep(scanner,
    "compactText(exchange.assistant?.mes || '', 14000)",
    "compactText(scannerEvidenceText(exchange.assistant?.mes || ''), 14000)",
    'current assistant evidence');
scanner = rep(scanner,
    ".map(message => ({ id: message.id, role: message.is_user ? 'USER' : 'ASSISTANT', text: compactText(message.mes, 8000) }));\n    const activePlayerName",
    ".map(message => ({ id: message.id, role: message.is_user ? 'USER' : 'ASSISTANT', text: compactText(scannerEvidenceText(message.mes), 8000) }));\n    const structuredDetected = nonSystemMessages(chat).slice(-Math.max(2, Math.min(30, Math.round(Number(scanDepth) || 12)))).some(message => hasRecognizedStructuredBlocks(message.mes));\n    const activePlayerName",
    'targeted history');
scanner = rep(scanner,
    "        'DURABLE PROFILE EVOLUTION: for established personality/behaviorProfile/speech/mannerisms, include a profileChanges entry only when the supplied chat actually supports refine, gradual, explicit, or batch development. refine must remain compatible with existing identity; gradual requires repeated same-concept evidence; explicit requires a lasting/correction cue; batch requires a real narrated time skip. One-off gestures are not mannerisms. Sparse blank fields may be seeded when the evidence directly establishes them.',",
    "        'DURABLE PROFILE EVOLUTION: for established personality/behaviorProfile/speech/mannerisms, include a profileChanges entry only when the supplied chat actually supports refine, gradual, explicit, or batch development. refine must remain compatible with existing identity; gradual requires repeated same-concept evidence; explicit requires a lasting/correction cue; batch requires a real narrated time skip. One-off gestures are not mannerisms. Sparse blank fields may be seeded when the evidence directly establishes them.',\n        ...(structuredDetected ? structuredEvidencePromptRules() : []),",
    'targeted rules');

const helpers = String.raw`function npcEvidenceVariants(npc, patch = null) {
    return [...new Set([npc?.name, ...(npc?.aliases || []), patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : []), patch?.role].map(value => String(value || '').trim()).filter(Boolean))];
}
function restrictedEvidenceScope(state, patch, policy) {
    if (!policy?.detected) return 'unrestricted';
    const patchId = String(patch?.id || '').trim();
    const existing = patchId ? state.npcs.find(npc => npc.id === patchId) : findNpcByReference(state, patch?.name || '');
    return evidenceReferenceScope(policy, npcEvidenceVariants(existing, patch));
}
function referenceAllowedForActivity(state, reference, policy) {
    if (!policy?.detected) return true;
    const npc = findNpcByReference(state, reference);
    const scope = evidenceReferenceScope(policy, npc ? npcEvidenceVariants(npc) : [reference]);
    if (!['world', 'inner', 'excluded'].includes(scope)) return true;
    return npc?.present === true;
}
function newPatchAllowedByEvidence(state, patch, policy) {
    if (!policy?.detected || findNpcByReference(state, patch?.name || '')) return true;
    const scope = restrictedEvidenceScope(state, patch, policy);
    return !['world', 'inner', 'excluded'].includes(scope);
}
function applyPrivateEvidencePatch(npc, patch) {
    const next = structuredClone(npc);
    for (const field of ['mood', 'goal']) {
        const value = String(patch?.[field] ?? '').trim();
        if (value) next[field] = value;
    }
    return next;
}

`;
scanner = rep(scanner, 'export function applyScanResult(stateInput, resultInput, options = {}) {', helpers + 'export function applyScanResult(stateInput, resultInput, options = {}) {', 'backend helpers');
scanner = rep(scanner,
    '    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds);\n    const presentRefs = uniqueStrings(result.finalPresentNpcIds);\n    const worldRefs = uniqueStrings(result.worldActiveNpcIds);',
    "    const evidencePolicy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;\n    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy));\n    const presentRefs = uniqueStrings(result.finalPresentNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy));\n    const worldRefs = uniqueStrings(result.worldActiveNpcIds);",
    'activity filter');
scanner = rep(scanner,
    'return !knownId && name && !findNpcByReference(state, name);',
    'return !knownId && name && !findNpcByReference(state, name) && newPatchAllowedByEvidence(state, patch, evidencePolicy);',
    'bootstrap filter');
scanner = rep(scanner,
    'if (!npc && referenced) {\n            const created = createFromPatch',
    'if (!npc && referenced && newPatchAllowedByEvidence(state, patch, evidencePolicy)) {\n            const created = createFromPatch',
    'create filter');
scanner = rep(scanner,
    'if (!npc) {\n                        const created = createFromPatch',
    'if (!npc && newPatchAllowedByEvidence(state, patch, evidencePolicy)) {\n                        const created = createFromPatch',
    'resolve create filter');
scanner = rep(scanner,
    '    const returnedPatchSet = new Set([...patchByNpcId.keys()].filter(id => !worldSet.has(id) || targetSet.has(id)));',
    "    const privateEvidenceSet = new Set();\n    const excludedEvidenceSet = new Set();\n    for (const [id, patch] of patchByNpcId.entries()) {\n        const existing = state.npcs.find(npc => npc.id === id);\n        const scope = evidenceReferenceScope(evidencePolicy, npcEvidenceVariants(existing, patch));\n        if (scope === 'inner' && !targetSet.has(id) && !worldSet.has(id)) privateEvidenceSet.add(id);\n        if (scope === 'excluded' && !targetSet.has(id) && !worldSet.has(id)) excludedEvidenceSet.add(id);\n    }\n    const returnedPatchSet = new Set([...patchByNpcId.keys()].filter(id => (!worldSet.has(id) || targetSet.has(id)) && !privateEvidenceSet.has(id) && !excludedEvidenceSet.has(id)));",
    'restricted patch sets');
scanner = rep(scanner,
    '        } else if (patch && worldSet.has(npc.id)) {\n            // Off-screen activity may update current whereabouts/status and explicit life-state',
    "        } else if (patch && privateEvidenceSet.has(npc.id)) {\n            npc = applyPrivateEvidencePatch(npc, patch);\n            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);\n        } else if (patch && worldSet.has(npc.id)) {\n            // Off-screen activity may update current whereabouts/status and explicit life-state",
    'private patch path');
write('v03/scanner.js', scanner);

let engine = read('v03/engine.js');
engine = rep(engine,
    "import { bestCheckpoint, ensureBranchBase, fingerprintMessage, rebaseToCurrentChat, reconcileToCurrentBranch, recordCheckpoint } from './branches.js';",
    "import { bestCheckpoint, ensureBranchBase, fingerprintMessage, rebaseToCurrentChat, reconcileToCurrentBranch, recordCheckpoint } from './branches.js';\nimport { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText, retentionEvidenceText } from './evidence-adapter.js';",
    'engine import');
engine = rep(engine,
    "rows.push(profileEvidenceText(message.mes || '').slice(0, 8000));",
    "rows.push(profileEvidenceText(message.mes || '').slice(0, 8000));",
    'phase3 profile helper exists');
engine = rep(engine,
    "return [exchange.user?.mes, exchange.assistant?.mes].map(value => String(value || '').trim()).filter(Boolean).join('\\n');",
    "return [exchange.user?.mes, exchange.assistant?.mes].map(value => relationshipEvidenceText(value).trim()).filter(Boolean).join('\\n');",
    'relationship context');
engine = engine.replaceAll(
    'profileContext: relationshipContextForExchange(exchange),',
    "profileContext: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),\n                evidencePolicy: buildExchangeEvidencePolicy(exchange),"
);
engine = engine.replaceAll(
    'const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, exchange);',
    "const retentionExchange = { ...exchange, user: exchange.user ? { ...exchange.user, mes: retentionEvidenceText(exchange.user.mes) } : null, assistant: exchange.assistant ? { ...exchange.assistant, mes: retentionEvidenceText(exchange.assistant.mes) } : null };\n            const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, retentionExchange);"
);
write('v03/engine.js', engine);

let injection = read('v03/injection.js');
injection = rep(injection,
    'function field(label, value) {',
    "import { structuredEvidencePromptRules } from './evidence-adapter.js';\n\nfunction field(label, value) {",
    'injection import');
injection = rep(injection,
    "        'The PLAYER/current user persona is never an NPC. keyRelationships and socialEdges are NPC-to-NPC only.',",
    "        ...(settings.structuredEvidenceDetected === true ? structuredEvidencePromptRules() : []),\n        'The PLAYER/current user persona is never an NPC. keyRelationships and socialEdges are NPC-to-NPC only.',",
    'conditional foreground rules');
write('v03/injection.js', injection);

let index = read('v03/index.js');
index = rep(index,
    "import { consumeNpcStateControl } from './foreground.js';",
    "import { consumeNpcStateControl } from './foreground.js';\nimport { hasRecognizedStructuredBlocks } from './evidence-adapter.js';",
    'index import');
index = rep(index,
    "const prompt = state ? buildInjection(state, settings) : '';",
    "const structuredEvidenceDetected = (ctx.chat || []).slice(-30).some(message => hasRecognizedStructuredBlocks(message?.mes));\n    const prompt = state ? buildInjection(state, { ...settings, structuredEvidenceDetected }) : '';",
    'conditional foreground detection');
write('v03/index.js', index);

let changelog = read('CHANGELOG.md');
const line = '- Phase 6 adds a narrowly auto-detected Megumin <Blocks> evidence adapter. Non-Megumin text is unchanged and gets no extra foreground rules. World_State may ground live/off-screen state but not In-chat/action/new-NPC admission; NPC_Inner_Chatter may ground private mood/goal/relationship context but not presence/action/speech/visible reaction; other master-block children are excluded from ordinary event evidence. Backend activity/new-NPC admission, relationship/profile grounding, and stale-reference retention use the same authority filter.';
if (!changelog.includes(line)) changelog = rep(changelog, '## v0.4.2\n\n', '## v0.4.2\n\n' + line + '\n', 'changelog');
write('CHANGELOG.md', changelog);
console.log('Applied NPC State 0.4.2 phase 6 structured-block evidence firewall');
