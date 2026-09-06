import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNpcStateEngine } from '../v03/engine.js';
import { chatLineage, ensureBranchBase } from '../v03/branches.js';
import { applyConfirmedDeathTransition, createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';
import { encodeV3Payload } from '../v03/storage.js';

const scannerSource = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
const engineSource = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
if (!scannerSource.includes('function lifeStateEvidenceGrounded(evidence, context)') || !engineSource.includes('authoritativeManualDeath')) {
    console.log('NPC State v0.4.33 life-state verification skipped on pre-transform source checkout');
    process.exit(0);
}

function npc(state) { return state.npcs.find(item => item.id === 'npc-mira-life'); }

function aliveState(key = 'life-semantics') {
    const state = createEmptyState(key);
    state.npcs = [normalizeNpc({
        id: 'npc-mira-life',
        name: 'Mira',
        role: 'Messenger',
        lifeState: 'alive',
        archived: false,
        present: true,
        worldActive: true,
        relationship: { trust: 7, affection: 3, desire: 0, tension: -1 },
        relationshipHistory: [{ impact: 'ordinary', delta: { trust: 1, affection: 0, desire: 0, tension: 0 }, reason: 'Existing relationship history.', at: 10 }],
        memories: ['Kept the eastern gate ledger safe.'],
    }, { now: 20 })];
    return state;
}

function deathResult(reason, certainty = 'explicit') {
    return {
        exchangeActiveNpcIds: ['Mira'],
        inChatNpcIds: [],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-mira-life',
            name: 'Mira',
            lifeState: 'dead',
            lifeStateCertainty: certainty,
            lifeStateReason: reason,
        }],
        socialEdges: [],
        familyFacts: [],
    };
}

function applyDeath(text, certainty = 'explicit', reason = text) {
    return applyScanResult(aliveState(), deathResult(reason, certainty), {
        sourceMessageId: 5,
        turn: 5,
        applyReturnedNpcPatches: true,
        profileContext: text,
    }).state;
}

// Backend life-state validation must not encode its own English death grammar. All of these
// model judgments are accepted because their evidence is grounded in permitted source text.
for (const [text, certainty] of [
    ['The messenger confirmed that Mira died last night.', 'explicit'],
    ["The messenger confirmed Mira's death.", 'strong'],
    ['Mira was found dead.', 'explicit'],
    ['Mira is deceased.', 'explicit'],
    ['Mira passed away last night.', 'strong'],
    ['Mira lay on the bed. She died during the night.', 'explicit'],
]) {
    const state = applyDeath(text, certainty);
    const mira = npc(state);
    assert.equal(mira.lifeState, 'dead', 'Grounded model death judgment was rejected: ' + text);
    assert.equal(mira.archived, true, 'Confirmed death did not archive immediately: ' + text);
    assert.equal(mira.archiveReason, 'deceased', 'Confirmed death did not use deceased archive reason: ' + text);
    assert.equal(mira.present, false, 'Confirmed death left NPC present: ' + text);
    assert.equal(mira.worldActive, false, 'Confirmed death left NPC world-active: ' + text);
    assert.equal(mira.relationship.trust, 7, 'Confirmed death damaged relationship meters');
    assert.equal(mira.relationshipHistory.length, 1, 'Confirmed death discarded relationship history');
    assert.deepEqual(mira.memories, ['Kept the eastern gate ledger safe.'], 'Confirmed death discarded dossier memories');
}

// Provenance remains strict. A semantically plausible but ungrounded model assertion is rejected
// and the rejection becomes inspectable instead of silently disappearing.
{
    const state = applyScanResult(aliveState(), deathResult('Mira is deceased.', 'explicit'), {
        sourceMessageId: 6,
        turn: 6,
        applyReturnedNpcPatches: true,
        profileContext: 'Mira is alive and speaking at the gate.',
    }).state;
    const mira = npc(state);
    assert.equal(mira.lifeState, 'alive', 'Ungrounded death evidence was accepted');
    assert.equal(mira.archived, false, 'Ungrounded death archived the dossier');
    assert.equal(mira.lifeStateDiagnostics.at(-1)?.code, 'unverifiable-evidence', 'Ungrounded death rejection was not diagnosed');
    assert.equal(mira.lifeStateDiagnostics.at(-1)?.sourceMessageId, 6, 'Life-state diagnostic lost source message provenance');
}

// The model owns semantic certainty too. Grounded but uncertain death is not a confirmed death.
{
    const text = 'The messenger suspects Mira may have died during the night.';
    const state = applyDeath(text, 'uncertain');
    const mira = npc(state);
    assert.equal(mira.lifeState, 'alive', 'Uncertain death proposal was treated as confirmed');
    assert.equal(mira.lifeStateDiagnostics.at(-1)?.code, 'insufficient-certainty', 'Uncertain death rejection was not diagnosed');
}

// A confirmed-dead dossier cannot be resurrected by plain lifeState=alive. The rejection explains
// that livingReturn is required, while grounded livingReturn remains available without phrase parsing.
{
    let state = applyDeath('Mira is deceased.', 'explicit');
    state = applyScanResult(state, {
        exchangeActiveNpcIds: ['Mira'], inChatNpcIds: ['Mira'], worldActiveNpcIds: [],
        npcs: [{ id: 'npc-mira-life', name: 'Mira', lifeState: 'alive', lifeStateCertainty: 'strong', lifeStateReason: 'The physician confirms she survived after all.', livingReturn: false }],
        socialEdges: [], familyFacts: [],
    }, { sourceMessageId: 7, turn: 7, applyReturnedNpcPatches: true, profileContext: 'The physician confirms she survived after all.' }).state;
    assert.equal(npc(state).lifeState, 'dead', 'Plain alive proposal resurrected a confirmed-dead dossier');
    assert.equal(npc(state).lifeStateDiagnostics.at(-1)?.code, 'living-return-required', 'Missing livingReturn rejection was not diagnosed');

    state = applyScanResult(state, {
        exchangeActiveNpcIds: ['Mira'], inChatNpcIds: ['Mira'], worldActiveNpcIds: [],
        npcs: [{ id: 'npc-mira-life', name: 'Mira', lifeState: 'alive', lifeStateCertainty: 'strong', lifeStateReason: 'The physician confirms she survived after all.', livingReturn: true }],
        socialEdges: [], familyFacts: [],
    }, { sourceMessageId: 8, turn: 8, applyReturnedNpcPatches: true, profileContext: 'The physician confirms she survived after all.' }).state;
    assert.equal(npc(state).lifeState, 'alive', 'Grounded livingReturn was rejected');
    assert.equal(npc(state).archived, false, 'Grounded livingReturn remained archived');
}

// Normalization is a defensive invariant for legacy or external paths: dead can never remain
// unarchived, and data/history survives the repair.
{
    const repaired = normalizeNpc({
        id: 'npc-mira-life', name: 'Mira', lifeState: 'dead', archived: false,
        memories: ['Legacy dossier memory.'],
        relationship: { trust: 9, affection: 4, desire: 1, tension: 0 },
        relationshipHistory: [{ impact: 'ordinary', delta: { trust: 1, affection: 0, desire: 0, tension: 0 }, reason: 'Legacy history.', at: 15 }],
    }, { now: 100 });
    assert.equal(repaired.archived, true, 'normalizeNpc allowed dead-but-unarchived state');
    assert.equal(repaired.archiveReason, 'deceased', 'normalizeNpc did not repair dead archive reason');
    assert.equal(repaired.archivedAt, 100, 'normalizeNpc did not establish deceased archive timestamp');
    assert.deepEqual(repaired.memories, ['Legacy dossier memory.'], 'Legacy death repair discarded dossier memory');
    assert.equal(repaired.relationship.trust, 9, 'Legacy death repair changed relationship state');
    assert.equal(repaired.relationshipHistory.length, 1, 'Legacy death repair discarded relationship history');
}

// Reapplying the shared death transition must preserve the original deceased timestamp.
{
    const first = applyConfirmedDeathTransition({ id: 'npc-mira-life', name: 'Mira', lifeState: 'alive' }, { certainty: 'explicit', reason: 'Confirmed.', at: 200 });
    const second = applyConfirmedDeathTransition(first, { certainty: 'explicit', reason: 'Confirmed again.', at: 300 });
    assert.equal(first.archivedAt, 200, 'Initial confirmed-death timestamp is wrong');
    assert.equal(second.archivedAt, 200, 'Repeated confirmed-death transition churned archivedAt');
}

function settings() {
    return {
        enabled: true, autoScan: true, scanDepth: 8, scannerResponseTokens: 15000,
        newNpcAdmissionMode: 'balanced', relationshipCriteria: '',
        relationshipCaps: { ordinary: 1, meaningful: 2, major: 5, extreme: 10 },
        relationshipHistoryLimit: 8, memoryCriteria: '',
        dossierLimits: { memories: 5, keyRelationships: 12, mannerisms: 8, behaviorProfile: 8 },
        birthdayFillMode: 'off', birthdayRandomCalendar: '', birthdayRandomDaysPerMonth: 30,
        staleManagementEnabled: true, staleArchiveAfter: 30, staleDeleteAfter: 50, branchRescan: true,
    };
}

function response(status, body = '') {
    return { ok: status >= 200 && status < 300, status,
        async text() { return String(body); },
        async json() { return typeof body === 'string' ? JSON.parse(body || '{}') : body; } };
}

function makeManualEngine() {
    const key = 'v0433-manual-death';
    const chat = [{ is_user: true, mes: 'Check the dossier.' }, { is_user: false, mes: 'The dossier is open.' }];
    const pointers = new Map();
    const files = new Map();
    let uploadId = 0;
    let state = aliveState(key);
    state.branchSafety = { status: 'safe', kind: '', reason: '' };
    state = ensureBranchBase(state, chat);
    state.branchHeadLineage = chatLineage(chat);
    const pointer = { name: key + '.json', path: '/seed/' + key + '.json', revision: 3, updatedAt: 1 };
    pointers.set(key, pointer);
    files.set(pointer.path, encodeV3Payload(key, state, 3));

    const fetchFn = async (url, init = {}) => {
        const method = String(init.method || 'GET').toUpperCase();
        if (method === 'GET') return files.has(url) ? response(200, files.get(url)) : response(404, '');
        if (url === '/api/files/upload' && method === 'POST') {
            const body = JSON.parse(String(init.body || '{}'));
            const text = Buffer.from(String(body.data || ''), 'base64').toString('utf8');
            const path = '/uploaded/' + (++uploadId) + '/' + String(body.name || 'npc.json');
            files.set(path, text);
            return response(200, { path });
        }
        if (method === 'DELETE') { files.delete(url); return response(200, {}); }
        throw new Error('Unexpected fake fetch: ' + method + ' ' + url);
    };

    return createNpcStateEngine({
        getContext: () => ({ chat }), getChatKey: () => key, getSettings: settings,
        getPointer: lookup => pointers.get(lookup) || null,
        setPointer: (lookup, value) => pointers.set(lookup, structuredClone(value)),
        deletePointer: lookup => pointers.delete(lookup), getStablePointer: () => null,
        persistSettings: () => {}, getHeaders: () => ({}), fetchFn,
        generate: async () => '{}', notify: () => {}, onStateChanged: () => {},
        recoverySessionId: 'phase68-session',
    });
}

// Authoritative manual lifeState=dead uses the same invariant and preserves dossier history.
{
    const engine = makeManualEngine();
    const result = await engine.updateNpc('npc-mira-life', { lifeState: 'dead' });
    assert.equal(result.ok, true, 'Manual death update failed');
    const mira = npc(result.state);
    assert.equal(mira.lifeState, 'dead', 'Manual death did not set lifeState');
    assert.equal(mira.archived, true, 'Manual death left dossier unarchived');
    assert.equal(mira.archiveReason, 'deceased', 'Manual death did not use deceased archive reason');
    assert.equal(mira.present, false, 'Manual death left NPC present');
    assert.equal(mira.worldActive, false, 'Manual death left NPC world-active');
    assert.equal(mira.relationship.trust, 7, 'Manual death changed relationship meters');
    assert.equal(mira.relationshipHistory.length, 1, 'Manual death discarded relationship history');
    assert.deepEqual(mira.memories, ['Kept the eastern gate ledger safe.'], 'Manual death discarded dossier memory');
}

// Source-level regression: semantic English phrase parsers must not creep back in.
assert(!scannerSource.includes('AFFIRMATIVE_DEATH_CUE'), 'Hardcoded death cue regex still exists');
assert(!scannerSource.includes('clauseAssertsNpcDeath'), 'Hardcoded death sentence parser still exists');
assert(!scannerSource.includes('affirmativeDeathEvidence'), 'Hardcoded death semantic gate still exists');
assert(scannerSource.includes('lifeStateEvidenceGrounded'), 'Grounded life-state evidence validator is missing');
assert(scannerSource.includes("['explicit', 'strong', 'confirmed']"), 'Scanner certainty contract is not aligned');

console.log('NPC State v0.4.33 grounded life-state semantics and death invariant verified');
