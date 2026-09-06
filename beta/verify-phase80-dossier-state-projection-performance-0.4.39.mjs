import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dossierIndexProjection } from '../v03/engine.js';
import { castRailHtml, dossierHtml } from '../v03/dossier-view.js';

const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
const uiSource = fs.readFileSync('v03/ui.js', 'utf8');
const dossierSource = fs.readFileSync('v03/dossier-view.js', 'utf8');

assert(engineSource.includes('PHASE80_DOSSIER_STATE_PROJECTION'), 'Engine projection architecture marker missing');
assert(engineSource.includes('function getDossierIndex(chatKey = getChatKey())'), 'Engine must expose a lightweight dossier roster read');
assert(engineSource.includes('function getDossierNpc(reference, chatKey = getChatKey())'), 'Engine must clone only one selected dossier on demand');
assert(engineSource.includes('function getNpcPortraitSource(reference, chatKey = getChatKey())'), 'Engine must expose a one-portrait immutable source read');
assert(engineSource.includes('getDossierIndex,'), 'Engine public surface must expose dossier index');
assert(engineSource.includes('getDossierNpc,'), 'Engine public surface must expose selected dossier read');
assert(engineSource.includes('getNpcPortraitSource,'), 'Engine public surface must expose portrait source read');
assert(engineSource.includes('getState: chatKey => cache.has(chatKey || getChatKey()) ? structuredClone(cache.get(chatKey || getChatKey())) : null'), 'Compatibility getState must remain an immutable full snapshot');

assert(!uiSource.includes('engine.getState('), 'Dossier UI must not clone the full sidecar during normal rendering');
assert(!uiSource.includes('function state()'), 'Legacy full-state UI helper must not survive the projection migration');
assert(!uiSource.includes('findNpcByReference(state()'), 'Dossier actions must not clone full state for one NPC lookup');
assert(!uiSource.includes('filterDossierNpcs(state()?.npcs'), 'Dossier filtering must use lightweight projected rows');
assert(uiSource.includes('function dossierIndex() { return engine.getDossierIndex(getChatKey()); }'), 'UI must use lightweight roster projection');
assert(uiSource.includes('function dossierNpc(reference) { return engine.getDossierNpc(reference, getChatKey()); }'), 'UI must use selected-NPC clone path');
assert(uiSource.includes("engine.getNpcPortraitSource(String(card.dataset.npcId || ''), getChatKey())"), 'Cast portraits must request only the individual visible source');
assert(uiSource.includes('const indexRows = dossierIndex() || [];'), 'Library render must acquire one projected roster');
assert.equal((uiSource.match(/const indexRows = dossierIndex\(\) \|\| \[\];/g) || []).length, 1, 'Library render must acquire the projected roster once per render path');
assert(uiSource.includes("const railRows = query.trim() ? filteredNpcs(allRows, query) : allRows;"), 'Library search must reuse the projected roster');
assert(uiSource.includes('const npc = railOnly ? null : dossierNpc(selectedNpcId);'), 'Rail-only search must not clone selected dossier detail');
assert(dossierSource.includes('const available = Boolean(src || npc?.portraitAvailable);'), 'Deferred cast portrait markup must understand source-free roster projections');

const portrait = 'data:image/webp;base64,PERF_SENTINEL_' + 'A'.repeat(100000);
const fullNpc = {
    id: 'npc-projection-test',
    name: 'Projection Test',
    aliases: ['P. Test'],
    role: 'Performance Tester',
    species: 'Human',
    age: '31',
    apparentAge: '~30',
    birthday: '1 January',
    present: true,
    worldActive: false,
    archived: false,
    archiveReason: '',
    lifeState: 'alive',
    minor: false,
    portrait: { dataUrl: portrait, width: 1536, height: 1536 },
    relationship: { trust: 12, affection: 4, desire: 0, tension: -1 },
    relationshipProgress: { trust: 0.75, affection: 0, desire: 0, tension: 0 },
    relationshipMilestones: [],
    relationshipHistory: Array.from({ length: 24 }, (_, i) => ({ impact: 'ordinary', delta: { trust: 1 }, reason: 'history ' + i })),
    relationshipEvidenceHistory: Array.from({ length: 6 }, (_, i) => ({ evidence: 'evidence ' + i })),
    relationshipDiagnostics: Array.from({ length: 12 }, (_, i) => ({ reason: 'diagnostic ' + i })),
    lifeStateDiagnostics: Array.from({ length: 12 }, (_, i) => ({ detail: 'life diagnostic ' + i })),
    appearanceForms: [],
    memories: ['A durable memory'],
    mannerisms: ['Taps desk'],
    keyRelationships: ['Friend: Mira'],
    behaviorProfile: ['Careful'],
    personality: 'Reserved',
    speech: 'Measured',
    background: 'Background',
    mood: 'Calm',
    location: 'Office',
    goal: 'Test performance',
    status: 'Working',
};

const projected = dossierIndexProjection(fullNpc);
assert.equal(projected.id, fullNpc.id);
assert.equal(projected.name, fullNpc.name);
assert.equal(projected.portraitAvailable, true, 'Projection must retain only portrait availability');
assert.deepEqual(projected.aliases, ['P. Test']);
assert.notEqual(projected.aliases, fullNpc.aliases, 'Projection aliases must not expose the cached mutable array');
assert(!Object.hasOwn(projected, 'portrait'), 'Projection must omit portrait payload');
assert(!Object.hasOwn(projected, 'relationshipHistory'), 'Projection must omit relationship history');
assert(!Object.hasOwn(projected, 'relationshipDiagnostics'), 'Projection must omit relationship diagnostics');
assert(!Object.hasOwn(projected, 'lifeStateDiagnostics'), 'Projection must omit life-state diagnostics');
assert(!JSON.stringify(projected).includes('PERF_SENTINEL_'), 'Projection must not copy portrait data URLs');
const projectedBytes = JSON.stringify(projected).length;
const fullBytes = JSON.stringify(fullNpc).length;
assert(projectedBytes < 2000, 'Single dossier projection grew unexpectedly large');
assert(projectedBytes * 20 < fullBytes, 'Projection must remain dramatically smaller than a portrait-bearing full dossier');

const roster = Array.from({ length: 160 }, (_, index) => dossierIndexProjection({
    ...fullNpc,
    id: 'npc-projection-' + index,
    name: 'Projected NPC ' + index,
    portrait: { dataUrl: portrait + index },
}));
const rosterJson = JSON.stringify(roster);
assert(!rosterJson.includes('PERF_SENTINEL_'), 'Large projected roster must contain no portrait bytes');
assert(rosterJson.length < 250000, 'Large projected roster grew unexpectedly large');

const railHtml = castRailHtml(roster, roster[0].id);
assert.equal((railHtml.match(/npc-state-v3-deferred-portrait/g) || []).length, roster.length, 'Projected portrait availability must still create deferred cast images');
assert(!railHtml.includes('PERF_SENTINEL_'), 'Projected rail HTML must contain no portrait bytes');

const detailHtml = dossierHtml(fullNpc);
assert(detailHtml.includes('PERF_SENTINEL_'), 'Selected full dossier must still render its hero portrait immediately');
assert(!detailHtml.includes('Life-state diagnostics'), 'Diagnostics must remain hidden by default');

console.log('PASS v0.4.39 dossier state projection performance hardening');