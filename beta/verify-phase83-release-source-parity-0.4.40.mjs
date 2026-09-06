import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/seed-beta.yml', 'utf8');
const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
const indexSource = fs.readFileSync('v03/index.js', 'utf8');
const uiSource = fs.readFileSync('v03/ui.js', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

assert.equal(manifest.version, '0.4.40', 'Manifest must be v0.4.40');
assert(workflow.includes('name: Build NPC State 0.4.40 Beta'), 'Workflow title must be v0.4.40');
assert(workflow.includes('for patch in $(seq 2 40); do'), 'Cold replay must include patch 40');
assert(workflow.includes("# node beta/bump-0.4.40.mjs ; -name 'phase*-0.4.40.mjs'"), 'Workflow must retain v0.4.40 source-parity marker');
for (const path of [
    'beta/bump-0.4.40.mjs',
    'beta/phase82-foreground-hot-path-performance-0.4.40.mjs',
    'beta/phase82b-legacy-v0439-release-verifier-compat-0.4.40.mjs',
    'beta/verify-phase82-foreground-hot-path-performance-0.4.40.mjs',
    'beta/verify-phase83-release-source-parity-0.4.40.mjs',
]) assert(fs.existsSync(path), 'Missing v0.4.40 source-owned file: ' + path);

assert(engineSource.includes('PHASE82_FOREGROUND_HOT_PATH_PROJECTION'), 'Generated runtime must retain foreground hot-path projection marker');
assert(engineSource.includes('getInjectionState,'), 'Generated runtime must expose injection projection read');
assert(engineSource.includes('stateChangeSnapshot ? structuredClone(state) : null'), 'Generated engine must keep optional snapshot compatibility');
assert(indexSource.includes('engine.getInjectionState(key)'), 'Generated foreground injection must use projected state');
assert(indexSource.includes('stateChangeSnapshot: false,'), 'Installed runtime must avoid unused state-change snapshots');
assert(uiSource.includes('inlineRosterSignature'), 'Generated UI must reuse unchanged in-chat roster DOM');
assert(uiSource.includes('existing?.dataset.signature === signature'), 'Generated UI must no-op unchanged inline rebuilds');
assert(readme.includes('## Foreground hot-path performance'), 'README must document foreground hot-path performance');
assert(changelog.includes('## v0.4.40\n'), 'CHANGELOG must contain v0.4.40');

const legacy39 = fs.readFileSync('beta/verify-phase81-release-source-parity-0.4.39.mjs', 'utf8');
assert(legacy39.includes('Manifest must be v0.4.39+'), 'v0.4.39 release verifier must remain descendant-compatible after patch 40');
assert(legacy39.includes('Workflow title must be v0.4.39+'), 'v0.4.39 workflow verifier must remain descendant-compatible after patch 40');
assert(legacy39.includes('Cold replay must include patch 39 or later'), 'v0.4.39 cold-replay verifier must remain descendant-compatible after patch 40');

console.log('PASS v0.4.40 release source parity');
