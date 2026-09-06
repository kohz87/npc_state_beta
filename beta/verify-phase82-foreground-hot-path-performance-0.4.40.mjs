import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dossierIndexProjection, injectionStateProjection } from '../v03/engine.js';
import { buildInjection } from '../v03/injection.js';
import { inlineRosterSignature } from '../v03/ui.js';

const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
const indexSource = fs.readFileSync('v03/index.js', 'utf8');
const uiSource = fs.readFileSync('v03/ui.js', 'utf8');

assert(engineSource.includes('PHASE82_FOREGROUND_HOT_PATH_PROJECTION'), 'Foreground hot-path projection marker missing');
assert(engineSource.includes('function getInjectionState(chatKey = getChatKey())'), 'Engine must expose an injection-specific read');
assert(engineSource.includes('getInjectionState,'), 'Engine public surface must expose injection state');
assert(engineSource.includes('const stateChangeSnapshot = adapters.stateChangeSnapshot !== false;'), 'Engine must preserve compatibility snapshot delivery by default');
assert(engineSource.includes('onStateChanged(chatKey, stateChangeSnapshot ? structuredClone(state) : null);'), 'State-change emitter must clone only when the consumer requested snapshots');
assert(!engineSource.includes('onStateChanged(chatKey, structuredClone('), 'Direct unconditional state-change snapshot clones must be removed');
assert(indexSource.includes('const state = key === \'no-chat\' ? null : engine.getInjectionState(key);'), 'Foreground injection must use projected state');
assert(indexSource.includes('stateChangeSnapshot: false,'), 'Installed runtime must opt out of the unused state-change snapshot');
assert(!indexSource.includes('const state = key === \'no-chat\' ? null : engine.getState(key);'), 'Foreground injection must stay off the full-state clone path');
assert(indexSource.includes('if (result?.ok && result?.skipped) refreshSurfaces();'), 'Embedded skip path must retain no-write refresh');
assert(indexSource.includes('if (result?.discarded) refreshSurfaces();'), 'Discarded recovery scan must retain surface catch-up');
assert(!indexSource.includes('if (result?.ok || result?.discarded) refreshSurfaces();'), 'Successful recovery commits must not double-refresh after persistence');
assert(uiSource.includes('export function inlineRosterSignature'), 'Inline roster signature helper missing');
assert(uiSource.includes('if (existing?.dataset.signature === signature && existing.parentElement === target) return;'), 'Unchanged MESSAGE_UPDATED events must reuse the existing inline strip');
assert(uiSource.includes('holder.dataset.signature = signature;'), 'New inline strip must record its observable signature');
assert(uiSource.includes('loading="lazy" decoding="async"'), 'Inline portraits must decode asynchronously when a rebuild is needed');

const portrait = 'data:image/webp;base64,HOT_PATH_SENTINEL_' + 'P'.repeat(350000);
const baseNpc = index => ({
    id: 'npc-hot-' + index,
    name: 'Hot Path NPC ' + index,
    aliases: ['Alias ' + index],
    role: index % 2 ? 'Scout' : 'Merchant',
    species: 'Human',
    age: String(20 + index),
    apparentAge: '~' + (20 + index),
    birthday: '1 Redleaf',
    appearance: 'Distinct ordinary appearance ' + index,
    currentForm: index === 1 ? 'Winged' : '',
    appearanceForms: index === 1 ? [{ name: 'Winged', appearance: 'Temporary winged form' }] : [],
    personality: 'Reserved',
    behaviorProfile: ['Careful', 'Observant'],
    speech: 'Measured',
    goal: 'Continue scene ' + index,
    status: 'Talking with Lucien',
    lifeState: 'alive',
    lifeStateCertainty: 'explicit',
    keyRelationships: ['Sibling: Example'],
    relationship: { trust: 10 + index, affection: index, desire: 0, tension: 0 },
    relationshipSummary: 'Known acquaintance',
    mannerisms: ['Taps a finger'],
    memories: ['A durable memory ' + index],
    mood: 'Calm',
    location: 'Rimecross',
    background: 'Background ' + index,
    present: index < 4,
    worldActive: index === 4,
    archived: false,
    archiveReason: '',
    minor: false,
    importance: index,
    lastInteractionMessageId: 50 - index,
    updatedAt: 1000 + index,
    portrait: index < 3 ? { dataUrl: portrait + index, width: 1024, height: 1024 } : null,
    relationshipHistory: Array.from({ length: 24 }, (_, i) => ({ reason: 'history ' + i, evidence: portrait.slice(0, 120) })),
    relationshipEvidenceHistory: Array.from({ length: 12 }, (_, i) => ({ evidence: 'evidence ' + i })),
    relationshipDiagnostics: Array.from({ length: 12 }, (_, i) => ({ detail: 'diagnostic ' + i })),
    lifeStateDiagnostics: Array.from({ length: 12 }, (_, i) => ({ detail: 'life diagnostic ' + i })),
});

const fullState = {
    branchSafety: { status: 'safe', kind: '', reason: '' },
    recovery: null,
    lastObservation: {
        exchangeActiveNpcIds: ['npc-hot-0', 'npc-hot-1'],
        finalPresentNpcIds: ['npc-hot-0', 'npc-hot-1', 'npc-hot-2', 'npc-hot-3'],
        worldActiveNpcIds: ['npc-hot-4'],
    },
    npcs: Array.from({ length: 12 }, (_, index) => baseNpc(index)),
    checkpoints: [{ messageId: 50, snapshot: { payload: portrait } }],
    rebaseBackup: { snapshot: { payload: portrait } },
    relationshipReplayBoundary: { lineage: Array.from({ length: 60 }, (_, i) => 'lineage-' + i) },
};

const projected = injectionStateProjection(fullState);
const projectedJson = JSON.stringify(projected);
assert.equal(projected.npcs.length, 12, 'Projection must retain all 12 NPCs');
assert.equal(projected.npcs[0].name, fullState.npcs[0].name);
assert.equal(projected.npcs[1].appearanceForms[0].name, 'Winged');
assert.deepEqual(projected.lastObservation, fullState.lastObservation, 'Projection must retain active-observation IDs');
assert(!projectedJson.includes('HOT_PATH_SENTINEL_'), 'Injection projection must contain no portrait/checkpoint sentinel bytes');
assert(!Object.hasOwn(projected, 'checkpoints'), 'Injection projection must omit checkpoints');
assert(!Object.hasOwn(projected, 'rebaseBackup'), 'Injection projection must omit rebase backup');
assert(!Object.hasOwn(projected.npcs[0], 'portrait'), 'Injection NPC projection must omit portrait payloads');
assert(!Object.hasOwn(projected.npcs[0], 'relationshipHistory'), 'Injection NPC projection must omit relationship history');
assert(!Object.hasOwn(projected.npcs[0], 'relationshipDiagnostics'), 'Injection NPC projection must omit relationship diagnostics');
assert(projectedJson.length < 60000, '12-NPC injection projection grew unexpectedly large');

const settings = {
    enabled: true,
    autoScan: true,
    inject: true,
    injectLimit: 6,
    injectBudgetTokens: 1800,
    newNpcHistoryEnrichment: false,
    newNpcAdmissionMode: 'balanced',
    foregroundCurrentUserText: 'Hot Path NPC 0',
    foregroundNewNpcHistory: '',
    relationshipCriteria: '',
    memoryCriteria: '',
};
assert.equal(
    buildInjection(projected, settings),
    buildInjection(fullState, settings),
    'Purpose-built injection projection must be behaviorally identical to full state for prompt construction',
);

const dossierRows = fullState.npcs.map(dossierIndexProjection);
assert.equal(dossierRows[0].updatedAt, 1000, 'Dossier projection must expose updatedAt for cheap inline invalidation');
assert(!JSON.stringify(dossierRows).includes('HOT_PATH_SENTINEL_'), 'Dossier rows must still contain no portrait bytes');
const signature = inlineRosterSignature(dossierRows.slice(0, 4), 58);
assert.equal(signature, inlineRosterSignature(dossierRows.slice(0, 4), 58), 'Unchanged inline roster signatures must be stable');
const changedRows = dossierRows.slice(0, 4).map(row => ({ ...row }));
changedRows[0].updatedAt += 1;
assert.notEqual(signature, inlineRosterSignature(changedRows, 58), 'NPC updates must invalidate inline strip signature');
assert.notEqual(signature, inlineRosterSignature(dossierRows.slice(0, 4), 59), 'Message changes must invalidate inline strip signature');

console.log('PASS v0.4.40 foreground hot-path performance hardening');
