import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/seed-beta.yml', 'utf8');
const indexSource = fs.readFileSync('v03/index.js', 'utf8');
const uiSource = fs.readFileSync('v03/ui.js', 'utf8');
const dossierSource = fs.readFileSync('v03/dossier-view.js', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

assert(/^0\.4\.(?:3[7-9]|[4-9]\d+)$/.test(manifest.version), 'Manifest must be v0.4.37+');
assert(/name: Build NPC State 0\.4\.(?:3[7-9]|[4-9]\d+) Beta/.test(workflow), 'Workflow title must be v0.4.37+');
assert(/for patch in \$\(seq 2 (?:3[7-9]|[4-9]\d+)\); do/.test(workflow), 'Cold replay must include patch 37 or later');
assert(workflow.includes("# node beta/bump-0.4.37.mjs ; -name 'phase*-0.4.37.mjs'"), 'Workflow must retain v0.4.37 source-parity marker');
assert(workflow.includes('showDossierDiagnostics: false'), 'Architecture gate must assert hidden-by-default diagnostics');
assert(workflow.includes('npc_state_v3_show_diagnostics'), 'Architecture gate must assert diagnostics settings control');
assert(workflow.includes('npc-state-v3-toggle-diagnostics'), 'Architecture gate must assert dossier quick toggle');

for (const path of [
    'beta/bump-0.4.37.mjs',
    'beta/phase76-dossier-diagnostics-toggle-0.4.37.mjs',
    'beta/phase76b-legacy-diagnostics-verifier-compat-0.4.37.mjs',
    'beta/verify-phase76-dossier-diagnostics-toggle-0.4.37.mjs',
    'beta/verify-phase77-release-source-parity-0.4.37.mjs',
]) assert(fs.existsSync(path), 'Missing v0.4.37 source-owned file: ' + path);

assert(indexSource.includes('showDossierDiagnostics: false'), 'Runtime must default diagnostics hidden');
assert(indexSource.includes('settings.showDossierDiagnostics = settings.showDossierDiagnostics === true;'), 'Runtime must normalize diagnostics opt-in');
assert(uiSource.includes('npc_state_v3_show_diagnostics'), 'Runtime settings UI must expose diagnostics toggle');
assert(uiSource.includes('npc-state-v3-toggle-diagnostics'), 'Runtime dossier must expose quick diagnostics toggle');
assert(uiSource.includes('dossierHtml(npc, { showDiagnostics })'), 'Runtime must pass visibility into dossier renderer');
assert(dossierSource.includes('dossierHtml(npc, { showDiagnostics = false } = {})'), 'Runtime dossier must default raw diagnostics hidden');
assert(dossierSource.includes("showDiagnostics ? block('Life-state diagnostics'"), 'Life-state diagnostics must not render while hidden');
assert(dossierSource.includes("showDiagnostics ? block('Relationship evaluation & scoring'"), 'Relationship diagnostics must not render while hidden');

const phase12 = fs.readFileSync('beta/verify-phase12-relationship-recovery-0.4.7.mjs', 'utf8');
const phase42 = fs.readFileSync('beta/verify-phase42-relationship-history-remarks-0.4.21.mjs', 'utf8');
assert(phase12.includes('dossierHtml(npc(state), { showDiagnostics: true })'), 'Historical relationship diagnostics verifier must explicitly opt in');
assert(phase42.includes('dossierHtml(npc, { showDiagnostics: true })'), 'Historical rejected-axis diagnostics verifier must explicitly opt in');

assert(readme.includes('## Dossier diagnostics visibility'), 'README must document diagnostics visibility');
assert(changelog.includes('## v0.4.37\n'), 'CHANGELOG must contain v0.4.37');

console.log('PASS v0.4.37 release source parity');
