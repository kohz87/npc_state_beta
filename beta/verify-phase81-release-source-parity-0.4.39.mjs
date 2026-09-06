import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/seed-beta.yml', 'utf8');
const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
const uiSource = fs.readFileSync('v03/ui.js', 'utf8');
const dossierSource = fs.readFileSync('v03/dossier-view.js', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

assert.equal(manifest.version, '0.4.39', 'Manifest must be v0.4.39');
assert(workflow.includes('name: Build NPC State 0.4.39 Beta'), 'Workflow title must be v0.4.39');
assert(workflow.includes('for patch in $(seq 2 39); do'), 'Cold replay must include patch 39');
assert(workflow.includes("# node beta/bump-0.4.39.mjs ; -name 'phase*-0.4.39.mjs'"), 'Workflow must retain v0.4.39 source-parity marker');
for (const path of [
    'beta/bump-0.4.39.mjs',
    'beta/phase80-dossier-state-projection-performance-0.4.39.mjs',
    'beta/phase80b-legacy-v0438-release-verifier-compat-0.4.39.mjs',
    'beta/phase80c-dossier-action-lookup-projection-0.4.39.mjs',
    'beta/verify-phase80-dossier-state-projection-performance-0.4.39.mjs',
    'beta/verify-phase81-release-source-parity-0.4.39.mjs',
]) assert(fs.existsSync(path), 'Missing v0.4.39 source-owned file: ' + path);

assert(engineSource.includes('PHASE80_DOSSIER_STATE_PROJECTION'), 'Generated runtime must retain dossier projection marker');
assert(engineSource.includes('getDossierIndex,'), 'Generated runtime must expose lightweight dossier index');
assert(engineSource.includes('getDossierNpc,'), 'Generated runtime must expose selected dossier read');
assert(engineSource.includes('getNpcPortraitSource,'), 'Generated runtime must expose one-portrait source read');
assert(uiSource.includes('engine.getDossierIndex(getChatKey())'), 'Generated UI must use projected dossier index');
assert(uiSource.includes('engine.getDossierNpc(reference, getChatKey())'), 'Generated UI must clone only selected dossier');
assert(uiSource.includes('engine.getNpcPortraitSource'), 'Generated UI must lazy-read individual portrait sources');
assert(!uiSource.includes('engine.getState('), 'Generated dossier UI must stay off full-state clone path');
assert(dossierSource.includes('npc?.portraitAvailable'), 'Generated cast renderer must understand projected portrait availability');
assert(readme.includes('## Dossier state projection performance'), 'README must document state projection performance');
assert(changelog.includes('## v0.4.39\n'), 'CHANGELOG must contain v0.4.39');

const legacy38 = fs.readFileSync('beta/verify-phase79-release-source-parity-0.4.38.mjs', 'utf8');
assert(legacy38.includes('Manifest must be v0.4.38+'), 'v0.4.38 release verifier must remain descendant-compatible after patch 39');
assert(legacy38.includes('Workflow title must be v0.4.38+'), 'v0.4.38 workflow verifier must remain descendant-compatible after patch 39');
assert(legacy38.includes('Cold replay must include patch 38 or later'), 'v0.4.38 cold-replay verifier must remain descendant-compatible after patch 39');

console.log('PASS v0.4.39 release source parity');