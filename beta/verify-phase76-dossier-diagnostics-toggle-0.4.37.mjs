import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dossierHtml } from '../v03/dossier-view.js';

const indexSource = fs.readFileSync('v03/index.js', 'utf8');
const uiSource = fs.readFileSync('v03/ui.js', 'utf8');
const dossierSource = fs.readFileSync('v03/dossier-view.js', 'utf8');

assert(indexSource.includes('showDossierDiagnostics: false'), 'Dossier diagnostics must default hidden');
assert(indexSource.includes('settings.showDossierDiagnostics = settings.showDossierDiagnostics === true;'), 'Dossier diagnostics setting must normalize to explicit opt-in');
assert(uiSource.includes('id="npc_state_v3_show_diagnostics"'), 'Settings UI must expose dossier diagnostics toggle');
assert(uiSource.includes("getSettings().showDossierDiagnostics = Boolean(event.target.checked);"), 'Settings toggle must persist its value');
assert(uiSource.includes("settings.showDossierDiagnostics = settings.showDossierDiagnostics !== true;"), 'Dossier quick toggle must persist its value');
assert(uiSource.includes('dossierHtml(npc, { showDiagnostics })'), 'Dossier renderer must receive the visibility setting');
assert(dossierSource.includes('dossierHtml(npc, { showDiagnostics = false } = {})'), 'Dossier rendering must default diagnostics off');
assert(dossierSource.includes("showDiagnostics ? block('Life-state diagnostics'"), 'Life-state diagnostics must be conditionally rendered');
assert(dossierSource.includes("showDiagnostics ? block('Relationship evaluation & scoring'"), 'Relationship scoring diagnostics must be conditionally rendered');

const npc = {
    id: 'npc-test-mira',
    name: 'Mira',
    aliases: [],
    role: 'Mage',
    species: 'Human',
    age: '~27',
    apparentAge: '~27',
    birthday: '',
    mood: 'calm',
    location: 'Library',
    goal: 'study',
    status: 'reading',
    appearance: 'Dark hair and grey eyes.',
    appearanceForms: [],
    currentForm: '',
    personality: 'Reserved.',
    behaviorProfile: [],
    speech: '',
    mannerisms: [],
    keyRelationships: [],
    memories: [],
    background: '',
    relationshipSummary: 'Neutral acquaintance.',
    relationship: { trust: 1, affection: 0, desire: 0, tension: 0 },
    relationshipProgress: { trust: 0.25, affection: 0, desire: 0, tension: 0 },
    relationshipMilestones: {},
    relationshipHistory: [],
    relationshipEvidenceHistory: [],
    relationshipDiagnostics: [{
        impact: 'none', reasons: ['evaluated-no-change'], priority: [], unlocks: [],
        proposed: {}, capped: {}, applied: {}, axisEvidence: {}, axisReasons: {},
        progressBefore: {}, progressAfter: {}, verifiedSources: {}, reason: 'No new shift.',
    }],
    lifeState: 'alive',
    lifeStateDiagnostics: [{
        proposedState: 'dead', certainty: 'uncertain', code: 'certainty-insufficient',
        detail: 'Rejected test diagnostic marker.', evidence: 'Mira may be hurt.',
    }],
    present: false,
    worldActive: false,
    archived: false,
    archiveReason: '',
    retentionProtected: false,
    manualProfileFields: [],
    minor: false,
};

const diagnosticSnapshot = JSON.stringify({
    lifeStateDiagnostics: npc.lifeStateDiagnostics,
    relationshipDiagnostics: npc.relationshipDiagnostics,
});

const hidden = dossierHtml(npc);
assert(hidden.includes('Show diagnostics'), 'Hidden dossier must expose Show diagnostics quick action');
assert(!hidden.includes('Life-state diagnostics'), 'Hidden dossier must omit life-state diagnostics block');
assert(!hidden.includes('Relationship evaluation &amp; scoring'), 'Hidden dossier must omit relationship scoring diagnostics block');
assert(!hidden.includes('Rejected test diagnostic marker.'), 'Hidden dossier must not render diagnostic payload content');
assert(!hidden.includes('Gate status and recent relationship evaluations'), 'Hidden dossier must not build relationship diagnostic detail HTML');
assert(hidden.includes('Recent relationship changes'), 'Relationship history must remain visible when diagnostics are hidden');
assert.equal(JSON.stringify({ lifeStateDiagnostics: npc.lifeStateDiagnostics, relationshipDiagnostics: npc.relationshipDiagnostics }), diagnosticSnapshot, 'Hiding diagnostics must not erase or mutate stored diagnostic state');

const explicitHidden = dossierHtml(npc, { showDiagnostics: false });
assert.equal(explicitHidden, hidden, 'Default hidden behavior must match an explicit false visibility option');

const shown = dossierHtml(npc, { showDiagnostics: true });
assert(shown.includes('Hide diagnostics'), 'Visible dossier must expose Hide diagnostics quick action');
assert(shown.includes('Life-state diagnostics'), 'Visible dossier must render life-state diagnostics block');
assert(shown.includes('Relationship evaluation &amp; scoring'), 'Visible dossier must render relationship scoring diagnostics block');
assert(shown.includes('Rejected test diagnostic marker.'), 'Visible dossier must render stored diagnostic content');
assert(shown.includes('Gate status and recent relationship evaluations'), 'Visible dossier must render relationship diagnostic detail HTML');
assert(shown.includes('Recent relationship changes'), 'Relationship history must remain visible when diagnostics are shown');
assert.equal(JSON.stringify({ lifeStateDiagnostics: npc.lifeStateDiagnostics, relationshipDiagnostics: npc.relationshipDiagnostics }), diagnosticSnapshot, 'Showing diagnostics must also remain presentation-only');

console.log('PASS v0.4.37 dossier diagnostics visibility toggle');
