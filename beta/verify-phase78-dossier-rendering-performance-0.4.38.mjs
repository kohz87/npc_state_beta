import assert from 'node:assert/strict';
import fs from 'node:fs';
import { castRailHtml, dossierHtml } from '../v03/dossier-view.js';

const uiSource = fs.readFileSync('v03/ui.js', 'utf8');
const dossierSource = fs.readFileSync('v03/dossier-view.js', 'utf8');
const styleSource = fs.readFileSync('v03/style.css', 'utf8');

assert(uiSource.includes('function hydrateVisibleCastPortraits(overlay, rows = [])'), 'Cast portraits must hydrate near the visible rail');
assert(uiSource.includes("rootMargin: '0px 360px'"), 'Cast portrait observer must preload a bounded near-viewport margin');
assert(uiSource.includes('renderLibrary({ centerSelected = false, railOnly = false, detailOnly = false } = {})'), 'Library renderer must support partial surfaces');
assert(uiSource.includes("addEventListener('input', scheduleLibraryRailRender)"), 'Search updates must be frame-coalesced');
assert(uiSource.includes("renderLibrary({ centerSelected: true, detailOnly: true })"), 'Cast selection must rerender only the dossier detail');
assert(uiSource.includes("renderLibrary({ detailOnly: true })"), 'Dossier-only settings changes must avoid rebuilding the cast rail');
assert(uiSource.includes("function closeLibrary() {\n        disconnectCastPortraitObserver();"), 'Closing the library must disconnect cast portrait observation');
assert(!uiSource.includes("rail?.querySelectorAll('.npc-state-v3-cast-card').forEach(button => button.addEventListener"), 'Cast cards must not receive a new listener on every rail render');
assert(dossierSource.includes('deferSource = false'), 'Portrait helper must support deferred sources');
assert(dossierSource.includes('npc-state-v3-deferred-portrait'), 'Cast portraits must emit deferred image placeholders');
assert(!styleSource.includes('backdrop-filter:blur(3px)'), 'Full-screen dossier backdrop blur must be removed');
assert(styleSource.includes('.npc-state-v3-library-overlay{backdrop-filter:none;-webkit-backdrop-filter:none;background:rgba(0,0,0,.88)}'), 'Dossier overlay must use non-blurred dimming');
assert(styleSource.includes('PHASE78_DOSSIER_RENDERING_PERFORMANCE'), 'Performance CSS marker missing');

const portrait = 'data:image/png;base64,PERF_SENTINEL_' + 'A'.repeat(8192);
const rows = Array.from({ length: 160 }, (_, index) => ({
    id: 'npc-perf-' + index,
    name: 'Performance NPC ' + index,
    role: 'Tester',
    species: 'Human',
    portrait: { dataUrl: portrait + index },
    relationship: { trust: 0, affection: 0, desire: 0, tension: 0 },
    relationshipProgress: { trust: 0, affection: 0, desire: 0, tension: 0 },
    relationshipMilestones: {},
    relationshipHistory: [],
    relationshipEvidenceHistory: [],
    relationshipDiagnostics: [],
    lifeStateDiagnostics: [],
    appearanceForms: [],
    memories: [],
    mannerisms: [],
    keyRelationships: [],
    behaviorProfile: [],
    present: index === 0,
    worldActive: false,
    archived: false,
}));

const railHtml = castRailHtml(rows, rows[0].id);
assert(!railHtml.includes('PERF_SENTINEL_'), 'Initial cast rail HTML must not duplicate stored portrait data URLs');
assert.equal((railHtml.match(/npc-state-v3-deferred-portrait/g) || []).length, rows.length, 'Each portrait-bearing cast card must use a deferred image placeholder');
assert(railHtml.length < 250000, 'Large-roster rail HTML grew unexpectedly despite deferred portrait sources');

const detailHtml = dossierHtml(rows[0]);
assert(detailHtml.includes('PERF_SENTINEL_'), 'Selected dossier hero must still render its portrait immediately');
assert(!detailHtml.includes('Life-state diagnostics'), 'v0.4.37 hidden-by-default diagnostics behavior must remain intact');

console.log('PASS v0.4.38 dossier rendering performance hardening');