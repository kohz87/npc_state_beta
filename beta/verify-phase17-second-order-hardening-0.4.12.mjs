import fs from 'node:fs';
import assert from 'node:assert/strict';
import { applyScanResult, parseScanJson } from '../v03/scanner.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { relationshipEvidenceGrounding, relationshipEvidencePolarityConflict } from '../v03/relationship-evidence.js';
import { rollbackRebasedRelationship } from '../v03/branches.js';
import { createNpcStateEngine } from '../v03/engine.js';
import { writeV3Sidecar } from '../v03/storage.js';

function payload(overrides = {}) {
    return {
        exchangeActiveNpcIds: [],
        inChatNpcIds: [],
        worldActiveNpcIds: [],
        npcs: [],
        socialEdges: [],
        ...overrides,
    };
}

function apply(state, patch, context, messageId = 1, extra = {}) {
    return applyScanResult(state, payload({
        exchangeActiveNpcIds: ['npc-mira'],
        inChatNpcIds: ['npc-mira'],
        npcs: [patch],
    }), {
        sourceMessageId: messageId,
        turn: messageId,
        profileContext: context,
        relationshipContext: context,
        playerName: 'Lucien',
        applyReturnedNpcPatches: true,
        ...extra,
    }).state;
}

// Member-invalid payloads reject atomically, including already-parsed object application.
{
    const malformed = payload({ npcs: [false] });
    assert.throws(() => parseScanJson(JSON.stringify(malformed)), /invalid payload structure or members/i);
    const state = createEmptyState('malformed-member');
    state.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', present: true })];
    assert.throws(() => applyScanResult(state, malformed, { sourceMessageId: 1 }), /invalid payload structure or members/i);
    assert.equal(state.npcs[0].present, true, 'Rejected object payload mutated the caller state');
}

// Pending identity changes reserve their future names before any patch is applied.
{
    const state = createEmptyState('same-scan-collision');
    state.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira' }), normalizeNpc({ id: 'npc-sora', name: 'Sora' })];
    assert.throws(() => applyScanResult(state, payload({
        exchangeActiveNpcIds: ['npc-mira', 'npc-sora'],
        inChatNpcIds: ['npc-mira', 'npc-sora'],
        npcs: [
            { id: 'npc-mira', name: 'Aria' },
            { id: 'npc-sora', name: 'Aria' },
        ],
    }), { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true }), /identity collision inside one observation/i);
    assert.equal(state.npcs[0].name, 'Mira');
    assert.equal(state.npcs[1].name, 'Sora');
}

// Death evidence must identify Mira as the completed victim, not merely place her near death language.
{
    const base = createEmptyState('death-victim');
    base.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', lifeState: 'alive' })];
    const wrongVictim = apply(base, {
        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'Mira killed Lucien.',
    }, 'Mira killed Lucien.', 1);
    assert.equal(wrongVictim.npcs[0].archived, false);

    const hypothetical = apply(base, {
        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'Mira might die tonight.',
    }, 'Mira might die tonight.', 2);
    assert.equal(hypothetical.npcs[0].archived, false);

    const actualVictim = apply(base, {
        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'Lucien killed Mira.',
    }, 'Lucien killed Mira.', 3);
    assert.equal(actualVictim.npcs[0].archived, true);
    assert.equal(actualVictim.npcs[0].lifeState, 'dead');
}

// Relationship evidence naming another known NPC cannot move Mira's meter.
{
    assert.equal(relationshipEvidenceGrounding(
        'Sora trusts Lucien completely.',
        'Sora trusts Lucien completely.',
        { subjectNames: ['Mira'], objectNames: ['Lucien'], otherSubjectNames: ['Sora'] },
    ), 'wrong-direction');

    const state = createEmptyState('relationship-owner');
    state.npcs = [
        normalizeNpc({ id: 'npc-mira', name: 'Mira', relationship: { trust: 10 } }),
        normalizeNpc({ id: 'npc-sora', name: 'Sora' }),
    ];
    const next = applyScanResult(state, payload({
        exchangeActiveNpcIds: ['npc-mira'], inChatNpcIds: ['npc-mira'],
        npcs: [{ id: 'npc-mira', name: 'Mira', relationshipChange: {
            impact: 'meaningful', delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
            evidence: 'Sora trusts Lucien completely.', reason: 'Trust deepens.',
        } }],
    }), {
        sourceMessageId: 2, turn: 2, relationshipContext: 'Sora trusts Lucien completely.',
        playerName: 'Lucien', applyReturnedNpcPatches: true,
    }).state;
    const mira = next.npcs.find(npc => npc.id === 'npc-mira');
    assert.equal(mira.relationship.trust, 10);
    assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('wrong-direction'));
}

// A locally negated affection predicate cannot authorize positive affection movement.
{
    assert.equal(relationshipEvidencePolarityConflict('Mira does not love Lucien.', { affection: 1 }), true);
    const state = createEmptyState('relationship-polarity');
    state.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', relationship: { affection: 10 } })];
    const next = applyScanResult(state, payload({
        exchangeActiveNpcIds: ['npc-mira'], inChatNpcIds: ['npc-mira'],
        npcs: [{ id: 'npc-mira', name: 'Mira', relationshipChange: {
            impact: 'meaningful', delta: { trust: 0, affection: 1, desire: 0, tension: 0 },
            evidence: 'Mira does not love Lucien.', reason: 'Affection deepens.',
        } }],
    }), {
        sourceMessageId: 3, turn: 3, relationshipContext: 'Mira does not love Lucien.',
        playerName: 'Lucien', applyReturnedNpcPatches: true,
    }).state;
    const mira = next.npcs[0];
    assert.equal(mira.relationship.affection, 10);
    assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('evidence-polarity'));
}

// Manual relationship edits are anchors: later discarded automation reverses; earlier automation is not subtracted twice.
{
    const anchored = normalizeNpc({
        id: 'npc-mira', name: 'Mira', relationship: { trust: 11 }, relationshipProgress: { trust: 0 },
        relationshipHistory: [
            { impact: 'manual', delta: { trust: 5 }, sourceMessageId: 5, at: 100, reason: 'Manual dossier adjustment by player.' },
            { impact: 'meaningful', delta: { trust: 1 }, sourceMessageId: 6, at: 200, evidence: 'Later branch event.' },
        ],
        relationshipDiagnostics: [{
            impact: 'meaningful', sourceMessageId: 6, at: 200,
            before: { trust: 10 }, after: { trust: 11 }, proposed: { trust: 1 }, applied: { trust: 1 },
            progressBefore: { trust: 0 }, progressAfter: { trust: 0 }, reasons: ['applied'], unlocks: [],
        }],
    });
    const rolled = rollbackRebasedRelationship(anchored, 5);
    assert.equal(rolled.relationship.trust, 10, 'Later discarded automatic gain survived manual anchor');
    assert.equal(rolled.relationshipHistory.filter(event => event.impact === 'manual').length, 1);
    assert.equal(rolled.relationshipHistory.some(event => event.impact === 'meaningful'), false);

    const overwritten = normalizeNpc({
        id: 'npc-mira', name: 'Mira', relationship: { trust: 10 }, relationshipProgress: { trust: 0 },
        relationshipHistory: [
            { impact: 'meaningful', delta: { trust: 2 }, sourceMessageId: 5, at: 100, evidence: 'Earlier abandoned gain.' },
            { impact: 'manual', delta: { trust: 3 }, sourceMessageId: 6, at: 200, reason: 'Manual dossier adjustment by player.' },
        ],
    });
    const preserved = rollbackRebasedRelationship(overwritten, 5);
    assert.equal(preserved.relationship.trust, 10, 'Automatic gain already overwritten by a later manual edit was subtracted twice');
}

function server() {
    const files = new Map();
    const response = (status, data) => ({ ok: status >= 200 && status < 300, status, text: async () => typeof data === 'string' ? data : JSON.stringify(data), json: async () => data });
    return async (url, options = {}) => {
        if (url === '/api/files/upload') {
            const body = JSON.parse(options.body);
            const path = '/user/files/' + body.name;
            files.set(path, Buffer.from(body.data, 'base64').toString());
            return response(200, { path });
        }
        if (url === '/api/files/delete') { files.delete(JSON.parse(options.body).path); return response(200, {}); }
        return files.has(url) ? response(200, files.get(url)) : response(404, '');
    };
}

// Manual Actual/Apparent Age edits reset the accumulated visual-aging baseline.
{
    const key = 'manual-age-baseline';
    const state = createEmptyState(key);
    state.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', age: '25', apparentAge: '~25', ageProgressionBaselineAge: '25' })];
    const chat = [{ is_user: true, mes: 'I check the record.' }, { is_user: false, mes: 'Mira reviews her dossier.' }];
    const fetchFn = server();
    let pointer = (await writeV3Sidecar({ chatKey: key, state, pointer: null, fetchFn, headers: {} })).pointer;
    const settings = { enabled: true, autoScan: true, staleManagementEnabled: false };
    const engine = createNpcStateEngine({
        getContext: () => ({ chat }), getChatKey: () => key, getSettings: () => settings,
        getPointer: () => pointer, setPointer: (_, p) => { pointer = p; }, getStablePointer: () => null,
        persistSettings() {}, getHeaders: () => ({}), fetchFn, generate: async () => JSON.stringify(payload()),
    });
    await engine.loadChat();
    const edited = await engine.updateNpc('npc-mira', { age: '100', apparentAge: '~100' });
    assert.equal(edited.ok, true);
    const afterEdit = edited.state.npcs.find(npc => npc.id === 'npc-mira');
    assert.equal(afterEdit.ageProgressionBaselineAge, '100');

    const evidence = 'On her birthday, Mira turned 101.';
    const afterBirthday = applyScanResult(edited.state, payload({
        exchangeActiveNpcIds: ['npc-mira'], inChatNpcIds: ['npc-mira'],
        npcs: [{
            id: 'npc-mira', name: 'Mira',
            ageChange: { age: '101', kind: 'birthday', evidence },
            ageProgression: { maturation: 'ordinary', meaningful: true, basis: 'Human ordinary maturation.', evidence, affectsShared: false, affectedForms: [] },
            apparentAge: '~120',
        }],
    }), { sourceMessageId: 2, turn: 2, profileContext: evidence, applyReturnedNpcPatches: true }).state;
    const mira = afterBirthday.npcs.find(npc => npc.id === 'npc-mira');
    assert.equal(mira.age, '101');
    assert.equal(mira.apparentAge, '~100', 'Stale maturation baseline authorized an oversized visual-age jump');
}

// Targeted-style scanner application can explicitly suppress global family reconciliation.
{
    const state = createEmptyState('target-family-isolation');
    state.npcs = [
        normalizeNpc({ id: 'npc-brina', name: 'Brina' }),
        normalizeNpc({ id: 'npc-mira', name: 'Mira', keyRelationships: [] }),
        normalizeNpc({ id: 'npc-sora', name: 'Sora', keyRelationships: [] }),
    ];
    state.familySlots = [{
        id: 'family:npc-brina:child:twins', ownerId: 'npc-brina', relation: 'child', count: 2,
        resolvedNpcIds: ['npc-mira', 'npc-sora'], descriptor: 'twin daughters', twinGroup: 'twins',
        evidence: 'Brina is mother to Mira and Sora.', provenance: 'explicit', confidence: 1,
    }];
    const next = applyScanResult(state, payload({ npcs: [{ id: 'npc-mira', name: 'Mira', mood: 'Calm' }] }), {
        sourceMessageId: 3, turn: 3, preservePresence: true, preserveObservation: true,
        allowHistoricalProfilePatches: true, applyReturnedNpcPatches: true, reconcileFamilyGraph: false,
    }).state;
    assert.deepEqual(next.npcs.find(npc => npc.id === 'npc-sora')?.keyRelationships, []);
    assert.equal(next.socialGraph.length, 0);

    const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
    const targeted = engineSource.slice(engineSource.indexOf("const parsedRaw = await invokeJson(prompt, `targeted-${npc.id}`);"), engineSource.indexOf('async function mutate'));
    assert(targeted.includes('reconcileFamilyGraph: false'), 'Targeted Refresh does not disable global family reconciliation');
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const manifestMatch = String(manifest.version || '').match(/^0\.4\.(\d+)$/);
assert(manifestMatch && Number(manifestMatch[1]) >= 12, 'Manifest regressed below v0.4.12');
console.log('NPC State 0.4.12 second-order hardening verified');
