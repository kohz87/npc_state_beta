import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/seed-beta.yml', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const indexSource = fs.readFileSync('v03/index.js', 'utf8');
const coordinatorSource = fs.readFileSync('v03/completeness-coordinator.js', 'utf8');

assert.equal(manifest.version, '0.4.43', 'Manifest must be v0.4.43');
assert(workflow.includes('name: Build NPC State 0.4.43 Beta'), 'Workflow title must be v0.4.43');
assert(workflow.includes('for patch in $(seq 2 43); do'), 'Cold replay must include patch 43');
assert(workflow.includes("# node beta/bump-0.4.43.mjs ; -name 'phase*-0.4.43.mjs'"), 'Workflow must retain v0.4.43 source-parity marker');
for (const path of [
    'beta/bump-0.4.43.mjs',
    'beta/phase88-completion-toggle-render-stability-0.4.43.mjs',
    'beta/phase88b-legacy-v0442-release-verifier-compat-0.4.43.mjs',
    'beta/verify-phase88-completion-toggle-render-stability-0.4.43.mjs',
    'beta/verify-phase89-release-source-parity-0.4.43.mjs',
]) assert(fs.existsSync(path), 'Missing v0.4.43 source-owned file: ' + path);

assert(indexSource.includes('PHASE88_RENDERLESS_COMPLETION_METADATA'), 'Renderless completion metadata runtime marker missing');
assert(indexSource.includes('persistMessageMetadata(ctx);'), 'Completion metadata must use save-only persistence');
assert(coordinatorSource.includes('PHASE88_COMPLETENESS_TOGGLE_GATE'), 'Completeness toggle runtime marker missing');
assert(coordinatorSource.includes('rememberEmbeddedOnly(source.identity, disabled)'), 'Disabled completeness must use in-memory dedupe');
assert(readme.includes('## Post-response scan toggle and block-render stability'), 'README must document v0.4.43');
assert(changelog.includes('## v0.4.43\n'), 'CHANGELOG must contain v0.4.43');

const legacy42 = fs.readFileSync('beta/verify-phase87-release-source-parity-0.4.42.mjs', 'utf8');
assert(legacy42.includes('Manifest must be v0.4.42+'), 'v0.4.42 release verifier must remain descendant-compatible after patch 43');
assert(legacy42.includes('Workflow title must be v0.4.42+'), 'v0.4.42 workflow verifier must remain descendant-compatible after patch 43');
assert(legacy42.includes('Cold replay must include patch 42 or later'), 'v0.4.42 cold-replay verifier must remain descendant-compatible after patch 43');

console.log('PASS v0.4.43 release source parity');
