import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase-6 marker: ' + label);
    return source.replace(from, to);
}

// ---------------------------------------------------------------------------
// Optional structured-content adapter. It activates ONLY for a Megumin-style
// <Blocks> master block. Arbitrary XML/custom tags outside that wrapper are
// untouched, so non-Megumin chats keep byte-for-byte evidence text.
// ---------------------------------------------------------------------------
write('v03/evidence-adapter.js', `function clean(value, max = 50000) {
    return String(value ?? '').replace(/\\u0000/g, '').trim().slice(0, max);
}

function normalizeTag(value) {
    return String(value || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizePhrase(value) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\\s\\p{P}\\p{S}]+/gu, ' ').trim();
}

const WORLD_TAGS = new Set(['worldstate']);
const INNER_TAGS = new Set(['npcinnerchatter']);

export function analyzeStructuredEvidence(value) {
    const source = String(value ?? '');
    const masters = [];
    const masterPattern = /<Blocks\\b[^>]*>([\\s\\S]*?)<\\/Blocks\\s*>/gi;
    let match;
    while ((match = masterPattern.exec(source))) masters.push({ full: match[0], body: match[1] || '' });
    if (!masters.length) {
        return { detected: false, visibleText: source, worldStateText: '', innerChatterText: '', excludedText: '', excludedTags: [] };
    }

    let visibleText = source;
    const world = [];
    const inner = [];
    const excluded = [];
    const excludedTags = [];
    for (const master of masters) {
        visibleText = visibleText.replace(master.full, '\\n');
        const childPattern = /<([A-Za-z][A-Za-z0-9_-]*)\\b[^>]*>([\\s\\S]*?)<\\/\\1\\s*>/g;
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
        visibleText: clean(visibleText, 50000),
        worldStateText: clean(world.join('\\n'), 50000),
        innerChatterText: clean(inner.join('\\n'), 50000),
        excludedText: clean(excluded.join('\\n'), 50000),
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
    if (view.visibleText) parts.push('[VISIBLE NARRATIVE | full event evidence]\\n' + view.visibleText);
    if (view.worldStateText) parts.push('[MEGUMIN World_State | live location/status/off-screen context only; NOT proof of in-chat presence, exchange action, or a new NPC introduction]\\n' + view.worldStateText);
    if (view.innerChatterText) parts.push('[MEGUMIN NPC_Inner_Chatter | private goals/thoughts/attitudes/relationship context only; NOT proof of in-chat presence, exchange action, speech, gesture, or visible reaction]\\n' + view.innerChatterText);
    if (view.excludedTags.length) parts.push('[MEGUMIN reference/control blocks excluded from ordinary event evidence: ' + view.excludedTags.join(', ') + ']');
    return parts.join('\\n\\n');
}

export function relationshipEvidenceText(value) {
    const view = analyzeStructuredEvidence(value);
    if (!view.detected) return String(value ?? '');
    return [view.visibleText, view.innerChatterText].filter(Boolean).join('\\n');
}

export function profileEvidenceText(value) {
    const view = analyzeStructuredEvidence(value);
    return view.detected ? view.visibleText : String(value ?? '');
}

export function retentionEvidenceText(value) {
    const view = analyzeStructuredEvidence(value);
    if (!view.detected) return String(value ?? '');
    return [view.visibleText, view.worldStateText, view.innerChatterText].filter(Boolean).join('\\n');
}

export function buildExchangeEvidencePolicy(exchange) {
    const user = analyzeStructuredEvidence(exchange?.user?.mes || '');
    const assistant = analyzeStructuredEvidence(exchange?.assistant?.mes || '');
    return {
        detected: user.detected || assistant.detected,
        visibleText: [user.visibleText, assistant.visibleText].filter(Boolean).join('\\n'),
        worldStateText: [user.worldStateText, assistant.worldStateText].filter(Boolean).join('\\n'),
        innerChatterText: [user.innerChatterText, assistant.innerChatterText].filter(Boolean).join('\\n'),
        excludedText: [user.excludedText, assistant.excludedText].filter(Boolean).join('\\n'),
        excludedTags: [...new Set([...(user.excludedTags || []), ...(assistant.excludedTags || [])])],
    };
}

function containsReference(text, variants) {
    const haystack = ' ' + normalizePhrase(text) + ' ';
    if (!haystack.trim()) return false;
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
        '- Other children of the Megumin <Blocks> master wrapper, including Story Tracker, Character Sheet, CYOA, Bonds, New_NPC, NPC_Update, and custom/reference blocks, are NOT current-event evidence for ordinary NPC State scanning. Do not create/update dossiers merely because those blocks contain a fact.',
        '- Do not convert private thought into visible behavior. A thought that someone is frightening is not evidence that the NPC visibly flinched, spoke, or acted unless the visible narrative says so.',
    ];
}
`);

// ---------------------------------------------------------------------------
// Scanner input uses the adapter locally. No Megumin master block means the
// input text is returned unchanged. Backend activity admission additionally
// rejects new/block-only identities and re-entry sourced only from restricted
// blocks, while preserving already-in-chat continuity and World_State offscreen.
// ---------------------------------------------------------------------------
let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "import {\n    DEFAULT_RELATIONSHIP_CAPS,",
    "import { evidenceReferenceScope, hasRecognizedStructuredBlocks, scannerEvidenceText, structuredEvidencePromptRules } from './evidence-adapter.js';\nimport {\n    DEFAULT_RELATIONSHIP_CAPS,",
    'evidence adapter scanner import',
);
scanner = replaceRequired(
    scanner,
    "            text: compactText(message.mes, 7000),",
    "            text: compactText(scannerEvidenceText(message.mes), 7000),",
    'history evidence view',
);
scanner = replaceRequired(
    scanner,
    "    const limits = normalizeDossierLimits(dossierLimits);\n    const contract = {",
    "    const limits = normalizeDossierLimits(dossierLimits);\n    const structuredDetected = [exchange.user?.mes, exchange.assistant?.mes, ...nonSystemMessages(chat).slice(-Math.max(2, Math.min(30, Number(scanDepth) || 8))).map(message => message.mes)].some(hasRecognizedStructuredBlocks);\n    const contract = {",
    'scan structured detection',
);
scanner = replaceRequired(
    scanner,
    "        '- DURABLE PROFILE EVOLUTION: a new NPC may establish grounded foundational personality/behavior/speech/mannerisms from its first rich scene. For an EXISTING established field, never rewrite personality, behaviorProfile, speech, or mannerisms merely because one scene looks different. Any genuine change requires a matching profileChanges entry with field, mode, stable concept label, and concrete evidence. refine adds compatible detail only and must not smuggle no-longer/became/increasingly transitions or morality flips. gradual development requires the same concept to be independently supported on a later scan. explicit requires narration that clearly establishes a lasting/corrective change. batch requires an actual narrated time skip plus development across that skipped period. A one-off gesture is not a permanent mannerism; mannerism seeding needs recurring/habit language or repeated confirmation.',\n        '',",
    "        '- DURABLE PROFILE EVOLUTION: a new NPC may establish grounded foundational personality/behavior/speech/mannerisms from its first rich scene. For an EXISTING established field, never rewrite personality, behaviorProfile, speech, or mannerisms merely because one scene looks different. Any genuine change requires a matching profileChanges entry with field, mode, stable concept label, and concrete evidence. refine adds compatible detail only and must not smuggle no-longer/became/increasingly transitions or morality flips. gradual development requires the same concept to be independently supported on a later scan. explicit requires narration that clearly establishes a lasting/corrective change. batch requires an actual narrated time skip plus development across that skipped period. A one-off gesture is not a permanent mannerism; mannerism seeding needs recurring/habit language or repeated confirmation.',\n        ...(structuredDetected ? structuredEvidencePromptRules() : []),\n        '',",
    'recovery firewall rules',
);
scanner = replaceRequired(
    scanner,
    "        `CURRENT USER MESSAGE:\\n${compactText(exchange.user?.mes || '', 10000)}`,\n        `CURRENT ASSISTANT MESSAGE:\\n${compactText(exchange.assistant?.mes || '', 14000)}`,
",
    "        `CURRENT USER MESSAGE:\\n${compactText(scannerEvidenceText(exchange.user?.mes || ''), 10000)}`,\n        `CURRENT ASSISTANT MESSAGE:\\n${compactText(scannerEvidenceText(exchange.assistant?.mes || ''), 14000)}`,
",
    'current evidence views',
);
// Targeted history and conditional firewall.
scanner = replaceRequired(
    scanner,
    "        .map(message => ({ id: message.id, role: message.is_user ? 'USER' : 'ASSISTANT', text: compactText(message.mes, 8000) }));\n    const activePlayerName",
    "        .map(message => ({ id: message.id, role: message.is_user ? 'USER' : 'ASSISTANT', text: compactText(scannerEvidenceText(message.mes), 8000) }));\n    const structuredDetected = nonSystemMessages(chat).slice(-Math.max(2, Math.min(30, Math.round(Number(scanDepth) || 12)))).some(message => hasRecognizedStructuredBlocks(message.mes));\n    const activePlayerName",
    'targeted structured detection',
);
scanner = replaceRequired(
    scanner,
    "        'DURABLE PROFILE EVOLUTION: for established personality/behaviorProfile/speech/mannerisms, include a profileChanges entry only when the supplied chat actually supports refine, gradual, explicit, or batch development. refine must remain compatible with existing identity; gradual requires repeated same-concept evidence; explicit requires a lasting/correction cue; batch requires a real narrated time skip. One-off gestures are not mannerisms. Sparse blank fields may be seeded when the evidence directly establishes them.',",
    "        'DURABLE PROFILE EVOLUTION: for established personality/behaviorProfile/speech/mannerisms, include a profileChanges entry only when the supplied chat actually supports refine, gradual, explicit, or batch development. refine must remain compatible with existing identity; gradual requires repeated same-concept evidence; explicit requires a lasting/correction cue; batch requires a real narrated time skip. One-off gestures are not mannerisms. Sparse blank fields may be seeded when the evidence directly establishes them.',\n        ...(structuredDetected ? structuredEvidencePromptRules() : []),",
    'targeted firewall rules',
);
// Backend evidence scope helpers before applyScanResult.
scanner = replaceRequired(
    scanner,
    "export function applyScanResult(stateInput, resultInput, options = {}) {",
    `function npcEvidenceVariants(npc, patch = null) {
    return [...new Set([
        npc?.name,
        ...(npc?.aliases || []),
        patch?.name,
        ...(Array.isArray(patch?.aliases) ? patch.aliases : []),
        patch?.role,
    ].map(value => String(value || '').trim()).filter(Boolean))];
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
    if (!policy?.detected) return true;
    if (findNpcByReference(state, patch?.name || '')) return true;
    return restrictedEvidenceScope(state, patch, policy) !== 'world'
        && restrictedEvidenceScope(state, patch, policy) !== 'inner'
        && restrictedEvidenceScope(state, patch, policy) !== 'excluded';
}

function applyPrivateEvidencePatch(npc, patch) {
    const next = structuredClone(npc);
    for (const field of ['mood', 'goal']) {
        const value = String(patch?.[field] ?? '').trim();
        if (value) next[field] = value;
    }
    return next;
}

export function applyScanResult(stateInput, resultInput, options = {}) {`,
    'backend evidence scope helpers',
);
scanner = replaceRequired(
    scanner,
    "    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds);\n    const presentRefs = uniqueStrings(result.finalPresentNpcIds);\n    const worldRefs = uniqueStrings(result.worldActiveNpcIds);",
    "    const evidencePolicy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;\n    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy));\n    const presentRefs = uniqueStrings(result.finalPresentNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy));\n    const worldRefs = uniqueStrings(result.worldActiveNpcIds);",
    'activity evidence filtering',
);
scanner = replaceRequired(
    scanner,
    "            return !knownId && name && !findNpcByReference(state, name);",
    "            return !knownId && name && !findNpcByReference(state, name) && newPatchAllowedByEvidence(state, patch, evidencePolicy);",
    'bootstrap evidence gate',
);
scanner = replaceRequired(
    scanner,
    "        if (!npc && referenced) {\n            const created = createFromPatch(patch, sourceMessageId, identityRefs);",
    "        if (!npc && referenced && newPatchAllowedByEvidence(state, patch, evidencePolicy)) {\n            const created = createFromPatch(patch, sourceMessageId, identityRefs);",
    'first create evidence gate',
);
scanner = replaceRequired(
    scanner,
    "                    if (!npc) {\n                        const created = createFromPatch(patch, sourceMessageId, [...identityRefs, ref]);",
    "                    if (!npc && newPatchAllowedByEvidence(state, patch, evidencePolicy)) {\n                        const created = createFromPatch(patch, sourceMessageId, [...identityRefs, ref]);",
    'resolve create evidence gate',
);
scanner = replaceRequired(
    scanner,
    "    const returnedPatchSet = new Set([...patchByNpcId.keys()].filter(id => !worldSet.has(id) || targetSet.has(id)));",
    `    const privateEvidenceSet = new Set();
    const excludedEvidenceSet = new Set();
    for (const [id, patch] of patchByNpcId.entries()) {
        const existing = state.npcs.find(npc => npc.id === id);
        const scope = evidenceReferenceScope(evidencePolicy, npcEvidenceVariants(existing, patch));
        if (scope === 'inner' && !targetSet.has(id) && !worldSet.has(id)) privateEvidenceSet.add(id);
        if (scope === 'excluded' && !targetSet.has(id) && !worldSet.has(id)) excludedEvidenceSet.add(id);
    }
    const returnedPatchSet = new Set([...patchByNpcId.keys()].filter(id => (!worldSet.has(id) || targetSet.has(id)) && !privateEvidenceSet.has(id) && !excludedEvidenceSet.has(id)));`,
    'private/excluded patch sets',
);
scanner = replaceRequired(
    scanner,
    "        } else if (patch && worldSet.has(npc.id)) {\n            // Off-screen activity may update current whereabouts/status and explicit life-state",
    "        } else if (patch && privateEvidenceSet.has(npc.id)) {\n            // Private inner chatter may ground internal mood/goal, but it cannot manufacture\n            // visible activity, speech, mannerisms, or durable event participation.\n            npc = applyPrivateEvidencePatch(npc, patch);\n            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);\n        } else if (patch && worldSet.has(npc.id)) {\n            // Off-screen activity may update current whereabouts/status and explicit life-state",
    'private evidence patch path',
);
write('v03/scanner.js', scanner);

// ---------------------------------------------------------------------------
// Engine deterministic contexts strip reference/control blocks before they can
// satisfy Desire/profile evidence. Inner chatter is retained for relationship
// context only. Stale-reference retention ignores Story Tracker/etc.
// ---------------------------------------------------------------------------
let engine = read('v03/engine.js');
engine = replaceRequired(
    engine,
    "import { bestCheckpoint, ensureBranchBase, fingerprintMessage, rebaseToCurrentChat, reconcileToCurrentBranch, recordCheckpoint } from './branches.js';",
    "import { bestCheckpoint, ensureBranchBase, fingerprintMessage, rebaseToCurrentChat, reconcileToCurrentBranch, recordCheckpoint } from './branches.js';\nimport { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText, retentionEvidenceText } from './evidence-adapter.js';",
    'engine evidence import',
);
engine = replaceRequired(
    engine,
    "        rows.push(String(message.mes || '').slice(0, 8000));",
    "        rows.push(profileEvidenceText(message.mes || '').slice(0, 8000));",
    'profile window evidence',
);
engine = replaceRequired(
    engine,
    "    return [exchange.user?.mes, exchange.assistant?.mes].map(value => String(value || '').trim()).filter(Boolean).join('\\n');",
    "    return [exchange.user?.mes, exchange.assistant?.mes].map(value => relationshipEvidenceText(value).trim()).filter(Boolean).join('\\n');",
    'relationship evidence context',
);
engine = replaceRequired(
    engine,
    "                profileContext: relationshipContextForExchange(exchange),\n                dossierLimits:",
    "                profileContext: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),\n                evidencePolicy: buildExchangeEvidencePolicy(exchange),\n                dossierLimits:",
    'automatic evidence policy',
);
// Embedded occurrence.
engine = engine.replace(
    "                profileContext: relationshipContextForExchange(exchange),\n                dossierLimits: settings.dossierLimits,",
    "                profileContext: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),\n                evidencePolicy: buildExchangeEvidencePolicy(exchange),\n                dossierLimits: settings.dossierLimits,",
);
// Reference retention should not use excluded/control blocks.
engine = replaceRequired(
    engine,
    "            const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, exchange);",
    "            const retentionExchange = { ...exchange, user: exchange.user ? { ...exchange.user, mes: retentionEvidenceText(exchange.user.mes) } : null, assistant: exchange.assistant ? { ...exchange.assistant, mes: retentionEvidenceText(exchange.assistant.mes) } : null };\n            const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, retentionExchange);",
    'automatic retention evidence',
);
engine = engine.replace(
    "            const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, exchange);",
    "            const retentionExchange = { ...exchange, user: exchange.user ? { ...exchange.user, mes: retentionEvidenceText(exchange.user.mes) } : null, assistant: exchange.assistant ? { ...exchange.assistant, mes: retentionEvidenceText(exchange.assistant.mes) } : null };\n            const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, retentionExchange);",
);
write('v03/engine.js', engine);

// ---------------------------------------------------------------------------
// Foreground instructions are added only after Megumin-style blocks have been
// observed in this chat. The first such turn is still protected by backend
// admission/context filtering after generation.
// ---------------------------------------------------------------------------
let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "function field(label, value) {",
    "import { structuredEvidencePromptRules } from './evidence-adapter.js';\n\nfunction field(label, value) {",
    'foreground evidence import',
);
injection = replaceRequired(
    injection,
    "        'The PLAYER/current user persona is never an NPC. keyRelationships and socialEdges are NPC-to-NPC only.',",
    "        ...(settings.structuredEvidenceDetected === true ? structuredEvidencePromptRules() : []),\n        'The PLAYER/current user persona is never an NPC. keyRelationships and socialEdges are NPC-to-NPC only.',",
    'conditional foreground firewall',
);
write('v03/injection.js', injection);

let index = read('v03/index.js');
index = replaceRequired(
    index,
    "import { consumeNpcStateControl } from './foreground.js';",
    "import { consumeNpcStateControl } from './foreground.js';\nimport { hasRecognizedStructuredBlocks } from './evidence-adapter.js';",
    'index evidence import',
);
index = replaceRequired(
    index,
    "    const prompt = state ? buildInjection(state, settings) : '';",
    "    const structuredEvidenceDetected = (ctx.chat || []).slice(-30).some(message => hasRecognizedStructuredBlocks(message?.mes));\n    const prompt = state ? buildInjection(state, { ...settings, structuredEvidenceDetected }) : '';",
    'conditional evidence injection flag',
);
write('v03/index.js', index);

let changelog = read('CHANGELOG.md');
const line = '- Phase 6 adds a narrowly auto-detected Megumin <Blocks> evidence adapter. Non-Megumin text is returned unchanged and receives no extra foreground rules. When detected, visible prose remains full evidence; World_State may ground live/off-screen state but not In-chat/action/new-NPC admission; NPC_Inner_Chatter may ground private mood/goal/relationship context but not presence/action/speech/visible reaction; all other master-block children are excluded from ordinary event evidence. Backend admission blocks block-only new/re-entering NPCs, relationship/profile validators receive authority-filtered text, and Story Tracker/control references no longer reset stale activity.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.2\n\n', '## v0.4.2\n\n' + line + '\n', 'phase-6 changelog');
write('CHANGELOG.md', changelog);
console.log('Applied NPC State 0.4.2 phase 6 structured-block evidence firewall');
