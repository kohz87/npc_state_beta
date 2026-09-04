import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing Phase 5 marker: ' + label);
    return source.replace(from, to);
}

// 5A: extract only explicit New_NPC/NPC_Update children from Megumin master blocks.
let evidence = fs.readFileSync('v03/evidence-adapter.js', 'utf8');
evidence += `

const STRUCTURED_DOSSIER_TAGS = new Map([
    ['newnpc', 'New_NPC'],
    ['npcupdate', 'NPC_Update'],
]);

export function extractStructuredDossierBlocks(value) {
    const source = String(value ?? '');
    const out = [];
    const masterPattern = /<Blocks\\b[^>]*>([\\s\\S]*?)<\\/Blocks\\s*>/gi;
    let master;
    while ((master = masterPattern.exec(source))) {
        const childPattern = /<([A-Za-z][A-Za-z0-9_-]*)\\b[^>]*>([\\s\\S]*?)<\\/\\1\\s*>/g;
        let child;
        while ((child = childPattern.exec(master[1] || ''))) {
            const tag = STRUCTURED_DOSSIER_TAGS.get(normalizeTag(child[1]));
            const body = clean(child[2], 30000);
            if (tag && body) out.push({ tag, body });
        }
    }
    return out.slice(0, 80);
}

export function structuredDossierBlocksForNpc(chat = [], npc = {}, depth = 30) {
    const variants = [...new Set([npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : []), npc?.role]
        .map(value => String(value || '').trim()).filter(Boolean))];
    if (!variants.length) return [];
    const rows = [];
    const source = Array.isArray(chat) ? chat : [];
    const start = Math.max(0, source.length - Math.max(2, Math.min(80, Math.round(Number(depth) || 30))));
    for (let messageId = start; messageId < source.length; messageId += 1) {
        const message = source[messageId];
        if (!message || message.is_system) continue;
        for (const block of extractStructuredDossierBlocks(message.mes)) {
            if (!containsReference(block.body, variants)) continue;
            rows.push({ messageId, role: message.is_user ? 'USER' : 'ASSISTANT', tag: block.tag, body: block.body });
        }
    }
    return rows.slice(-24);
}
`;
fs.writeFileSync('v03/evidence-adapter.js', evidence);

// 5B: dedicated import prompt and a strict durable-only sanitizer.
let scanner = fs.readFileSync('v03/scanner.js', 'utf8');
const insertMarker = `export function buildTargetedRefreshPrompt({ npc, chat, assistantMessageId, scanDepth = 12, memoryCriteria = '', playerName = '', dossierLimits = {} }) {`;
if (!scanner.includes(insertMarker)) throw new Error('Missing Phase 5 scanner import-prompt insertion marker');
const importHelpers = `export function sanitizeStructuredDossierPatch(patch = {}, npc = {}) {
    const out = {
        id: String(npc?.id || patch?.id || '').trim(),
        name: String(npc?.name || patch?.name || '').trim(),
        relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' },
    };
    for (const field of [
        'aliases', 'role', 'species', 'age', 'ageChange', 'apparentAge', 'appearance', 'appearanceForms', 'appearanceFormChanges',
        'personality', 'behaviorProfile', 'speech', 'mannerisms', 'profileChanges', 'canonChanges', 'background',
        'keyRelationships', 'keyRelationshipChanges', 'memories',
    ]) {
        if (Object.prototype.hasOwnProperty.call(patch || {}, field)) out[field] = structuredClone(patch[field]);
    }
    return out;
}

export function buildStructuredDossierImportPrompt({ npc, blocks = [], memoryCriteria = '', dossierLimits = {} }) {
    const limits = normalizeDossierLimits(dossierLimits);
    const sources = (Array.isArray(blocks) ? blocks : []).slice(-24).map(block => ({
        messageId: Number.isInteger(block?.messageId) ? block.messageId : null,
        role: String(block?.role || ''),
        tag: String(block?.tag || ''),
        body: compactText(block?.body, 12000),
    }));
    return [
        'You are NPC State v0.4.3 performing a DELIBERATE STRUCTURED DOSSIER IMPORT for one existing NPC.',
        'Return JSON only. This is reference-data reconciliation, NOT a current scene/event scan.',
        'Only the supplied Megumin New_NPC / NPC_Update blocks are authoritative sources for this operation.',
        'TARGET DOSSIER: ' + JSON.stringify(rosterForPrompt({ npcs: [npc] })[0]),
        'STRUCTURED DOSSIER SOURCES: ' + JSON.stringify(sources),
        'IMPORT AUTHORITY RULES:',
        '- Import durable identity/profile facts only: aliases, role, species, actual/apparent age, appearance/forms, personality, behavior, speech, mannerisms, background, non-player Key Relationships, and durable Important Memories.',
        '- NEVER infer current In-chat presence, exchange activity, off-screen activity, Mood, Location, Goal, Status, currentForm, life/death/archive state, Importance, or any other live state from these reference blocks.',
        '- NEVER create or change Trust/Affection/Desire/Tension, relationshipChange, relationshipSummary, or relationship history from structured dossier import.',
        '- Preserve established canon when the blocks merely phrase it differently. For a real correction/revelation/revision of established Appearance/Species/Background/Role, return canonChanges with concrete evidence quoted/paraphrased from the source block.',
        '- For established Personality/Behavior/Speech/Mannerisms revisions, use profileChanges and source-block evidence under the normal durable-evolution rules. A structured profile description may seed an empty field, but it does not waive contradiction safeguards.',
        '- Existing appearanceForms remain sticky; add genuinely new forms normally and use appearanceFormChanges only when the structured source explicitly corrects/changes a known form.',
        '- Existing actual Age remains sticky; use ageChange only when the structured source explicitly establishes a correction/birthday/elapsed-time result with the resulting numeric age.',
        ...dossierCollectionRules(limits),
        'MEMORY SEMANTIC HYGIENE: collapse paraphrases of the same durable event/fact, while preserving genuinely different events.',
        memoryCriteria ? 'IMPORTANT MEMORY RUBRIC:\\n' + compactText(memoryCriteria, 6000) : '',
        'OUTPUT CONTRACT: ' + JSON.stringify({
            exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [],
            npcs: [{
                id: npc.id, name: npc.name, aliases: null, role: '', species: '', age: '', ageChange: null, apparentAge: '',
                appearance: '', appearanceForms: null, appearanceFormChanges: null,
                personality: '', behaviorProfile: null, speech: '', mannerisms: null, profileChanges: null,
                canonChanges: null, background: '', keyRelationships: null, keyRelationshipChanges: null, memories: null,
                relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' },
            }], socialEdges: [], familyFacts: [],
        }),
    ].filter(Boolean).join('\\n\\n');
}

`;
scanner = scanner.replace(insertMarker, importHelpers + insertMarker);
fs.writeFileSync('v03/scanner.js', scanner);

// 5C: explicit engine operation. It exits before any generation when no matching block exists.
let engine = fs.readFileSync('v03/engine.js', 'utf8');
engine = replaceRequired(
    engine,
    "import { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText, retentionEvidenceText } from './evidence-adapter.js';",
    "import { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText, retentionEvidenceText, structuredDossierBlocksForNpc } from './evidence-adapter.js';",
    'engine evidence imports',
);
engine = replaceRequired(
    engine,
`    buildScanPrompt,
    buildTargetedRefreshPrompt,
    currentExchange,
`,
`    buildScanPrompt,
    buildStructuredDossierImportPrompt,
    buildTargetedRefreshPrompt,
    currentExchange,
`,
    'engine structured import prompt import',
);
engine = replaceRequired(
    engine,
`    parseScanJson,
    reconcileFamilyGraphState,
`,
`    parseScanJson,
    reconcileFamilyGraphState,
    sanitizeStructuredDossierPatch,
`,
    'engine structured sanitizer import',
);
const refreshMarker = `    async function refreshDossier(reference) {`;
if (!engine.includes(refreshMarker)) throw new Error('Missing Phase 5 engine insertion marker');
const importMethod = `    async function importStructuredDossier(reference) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        return exclusive(chatKey, async () => {
            const state = await loadChat(chatKey);
            if (state?.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };
            const npc = findNpcByReference(state, reference);
            if (!npc) return { ok: false, reason: 'not-found' };
            const ctx = getContext();
            const chat = ctx.chat || [];
            const settings = getSettings();
            const blocks = structuredDossierBlocksForNpc(chat, npc, Math.max(12, Number(settings.scanDepth) || 8) * 3);
            // Non-Megumin users and chats without a matching structured dossier source stop
            // here. No scanner generation, sidecar mutation, presence change, or prompt cost.
            if (!blocks.length) return { ok: false, reason: 'no-structured-source', npcId: npc.id };
            const messageId = latestAssistantMessageId(chat);
            if (messageId < 0) return { ok: false, reason: 'no-assistant-message' };
            const startEpoch = epoch(chatKey);
            const startFingerprint = fingerprintMessage(chat[messageId] || {});
            const sourceContext = blocks.map(block => block.body).join('\\n');
            const prompt = buildStructuredDossierImportPrompt({
                npc,
                blocks,
                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
            });
            const parsedRaw = await invokeJson(prompt, 'structured-import-' + npc.id);
            const candidate = (parsedRaw.npcs || []).find(patch => {
                const patchId = String(patch?.id || '').trim();
                return patchId ? patchId === npc.id : normalizeName(patch?.name) === normalizeName(npc.name);
            });
            if (!candidate) return { ok: false, reason: 'structured-source-no-target', npcId: npc.id };
            const parsed = {
                exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [],
                npcs: [sanitizeStructuredDossierPatch(candidate, npc)], socialEdges: [], familyFacts: [],
            };
            const liveChat = getContext().chat || [];
            if (getChatKey() !== chatKey || epoch(chatKey) !== startEpoch || fingerprintMessage(liveChat[messageId] || {}) !== startFingerprint) {
                return { ok: false, discarded: true, reason: 'stale-operation' };
            }
            const applied = applyScanResult(state, parsed, {
                sourceMessageId: messageId,
                turn: state.turn,
                preservePresence: true,
                preserveObservation: true,
                applyRelationship: false,
                allowHistoricalProfilePatches: true,
                profileContext: sourceContext,
                relationshipContext: '',
                dossierLimits: settings.dossierLimits,
                applyReturnedNpcPatches: true,
            });
            const committed = recordCheckpoint(applied.state, liveChat, messageId, 'structured-dossier-import');
            const persisted = await persist(chatKey, committed);
            return { ok: true, npcId: npc.id, sourceCount: blocks.length, state: structuredClone(persisted) };
        });
    }

`;
engine = engine.replace(refreshMarker, importMethod + refreshMarker);
engine = replaceRequired(
    engine,
`        refreshDossier,
        addNpc,
`,
`        refreshDossier,
        importStructuredDossier,
        addNpc,
`,
    'engine public method',
);
fs.writeFileSync('v03/engine.js', engine);

// 5D: expose the deliberate operation in the dossier More menu and public API.
let dossier = fs.readFileSync('v03/dossier-view.js', 'utf8');
dossier = replaceRequired(
    dossier,
`          <details class="npc-state-v3-dossier-more"><summary><i class="fa-solid fa-ellipsis"></i><span>More</span></summary><div>
            <button class="menu_button npc-state-v3-generate-image-prompt" data-npc-id="${escapeHtml(npc.id)}"><i class="fa-solid fa-image"></i> Generate image prompt</button>
`,
`          <details class="npc-state-v3-dossier-more"><summary><i class="fa-solid fa-ellipsis"></i><span>More</span></summary><div>
            <button class="menu_button npc-state-v3-import-structured" data-npc-id="${escapeHtml(npc.id)}"><i class="fa-solid fa-file-import"></i> Import New_NPC / NPC_Update</button>
            <button class="menu_button npc-state-v3-generate-image-prompt" data-npc-id="${escapeHtml(npc.id)}"><i class="fa-solid fa-image"></i> Generate image prompt</button>
`,
    'dossier import button',
);
fs.writeFileSync('v03/dossier-view.js', dossier);

let ui = fs.readFileSync('v03/ui.js', 'utf8');
ui = replaceRequired(
    ui,
`        root.querySelector('.npc-state-v3-refresh')?.addEventListener('click', async event => {
            const id = event.currentTarget.dataset.npcId;
            event.currentTarget.disabled = true;
            const result = await safely('dossier scan', () => engine.refreshDossier(id));
            event.currentTarget.disabled = false;
            notify(result.ok ? 'success' : 'warning', result.ok ? 'NPC State: dossier reconciled from recent chat without replaying relationship deltas.' : (result.reason === 'branch-unsafe' ? 'NPC State: timeline rebase required. Open NPC State settings and choose Rebase to current chat.' : \`NPC State: dossier scan did not commit (\${result.reason || 'unknown'}).\`));
            refresh();
        });
`,
`        root.querySelector('.npc-state-v3-refresh')?.addEventListener('click', async event => {
            const id = event.currentTarget.dataset.npcId;
            event.currentTarget.disabled = true;
            const result = await safely('dossier scan', () => engine.refreshDossier(id));
            event.currentTarget.disabled = false;
            notify(result.ok ? 'success' : 'warning', result.ok ? 'NPC State: dossier reconciled from recent chat without replaying relationship deltas.' : (result.reason === 'branch-unsafe' ? 'NPC State: timeline rebase required. Open NPC State settings and choose Rebase to current chat.' : \`NPC State: dossier scan did not commit (\${result.reason || 'unknown'}).\`));
            refresh();
        });
        root.querySelector('.npc-state-v3-import-structured')?.addEventListener('click', async event => {
            const id = event.currentTarget.dataset.npcId;
            event.currentTarget.disabled = true;
            const result = await safely('structured dossier import', () => engine.importStructuredDossier(id));
            event.currentTarget.disabled = false;
            if (result.ok) notify('success', \`NPC State: imported \${result.sourceCount || 0} matching New_NPC / NPC_Update source block\${result.sourceCount === 1 ? '' : 's'} into durable dossier fields.\`);
            else if (result.reason === 'no-structured-source') notify('info', 'NPC State: no matching Megumin New_NPC / NPC_Update source was found for this dossier. Nothing was changed.');
            else notify('warning', \`NPC State: structured dossier import did not commit (\${result.reason || 'unknown'}).\`);
            refresh();
        });
`,
    'ui structured import binding',
);
fs.writeFileSync('v03/ui.js', ui);

let index = fs.readFileSync('v03/index.js', 'utf8');
index = replaceRequired(
    index,
`    refreshFromChat: reference => engine.refreshDossier(reference),
    getState: () => engine.getState(getChatKey()),
`,
`    refreshFromChat: reference => engine.refreshDossier(reference),
    importStructuredDossier: reference => engine.importStructuredDossier(reference),
    getState: () => engine.getState(getChatKey()),
`,
    'public structured import API',
);
fs.writeFileSync('v03/index.js', index);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const line = '- Phase 5 restores deliberate Megumin New_NPC / NPC_Update dossier import without weakening the structured-evidence firewall. An explicit dossier More-menu/API action may reconcile only durable identity/profile/forms/key-relationship/memory fields from matching master-block sources; it cannot alter presence, live state, life/archive state, Importance, player relationship scores/summaries/history, or social activity. Chats without matching Megumin blocks return locally with no model call or write.';
if (!changelog.includes(line)) changelog = changelog.replace('## v0.4.3\n\n', '## v0.4.3\n\n' + line + '\n');
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Applied v0.4.3 Phase 5 deliberate structured dossier import');
