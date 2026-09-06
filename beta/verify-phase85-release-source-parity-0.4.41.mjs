import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/seed-beta.yml', 'utf8');
const settingsSource = fs.readFileSync('v03/settings-layout.js', 'utf8');
const recoverySource = fs.readFileSync('v03/branch-recovery-ui.js', 'utf8');
const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
const indexSource = fs.readFileSync('v03/index.js', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

assert.equal(manifest.version, '0.4.41', 'Manifest must be v0.4.41');
assert(workflow.includes('name: Build NPC State 0.4.41 Beta'), 'Workflow title must be v0.4.41');
assert(workflow.includes('for patch in $(seq 2 41); do'), 'Cold replay must include patch 41');
assert(workflow.includes("# node beta/bump-0.4.41.mjs ; -name 'phase*-0.4.41.mjs'"), 'Workflow must retain v0.4.41 source-parity marker');
for (const path of [
    'beta/bump-0.4.41.mjs',
    'beta/phase84-settings-observer-recovery-hotpath-0.4.41.mjs',
    'beta/phase84b-legacy-v0440-release-verifier-compat-0.4.41.mjs',
    'beta/verify-phase84-settings-observer-recovery-hotpath-0.4.41.mjs',
    'beta/verify-phase85-release-source-parity-0.4.41.mjs',
]) assert(fs.existsSync(path), 'Missing v0.4.41 source-owned file: ' + path);

assert(settingsSource.includes('PHASE84_SETTINGS_OBSERVER_RECOVERY_HOTPATH'), 'Generated settings runtime must retain v0.4.41 marker');
assert(settingsSource.includes("setTextIfChanged(label, 'Relationship Rubric');"), 'Generated settings runtime must guard relationship label writes');
assert(settingsSource.includes("setTextIfChanged(label, 'Memory Rubric');"), 'Generated settings runtime must guard memory label writes');
assert(engineSource.includes('branchSafetyStatus,'), 'Generated engine must expose narrow branch-safety status');
assert(indexSource.includes('branchSafetyStatus: () => engine.branchSafetyStatus(getChatKey()),'), 'Generated global API must expose narrow branch-safety status');
assert(!recoverySource.includes('NPCState?.getState?.()'), 'Generated recovery UI must not use full-state overlay reads');
assert(recoverySource.includes('function recovery() { return readRecoveryStatus(); }'), 'Generated recovery UI must use null-safe recovery status helper');
assert(readme.includes('## Settings observer and recovery UI performance'), 'README must document v0.4.41 performance fix');
assert(changelog.includes('## v0.4.41\n'), 'CHANGELOG must contain v0.4.41');

const legacy40 = fs.readFileSync('beta/verify-phase83-release-source-parity-0.4.40.mjs', 'utf8');
assert(legacy40.includes('Manifest must be v0.4.40+'), 'v0.4.40 release verifier must remain descendant-compatible after patch 41');
assert(legacy40.includes('Workflow title must be v0.4.40+'), 'v0.4.40 workflow verifier must remain descendant-compatible after patch 41');
assert(legacy40.includes('Cold replay must include patch 40 or later'), 'v0.4.40 cold-replay verifier must remain descendant-compatible after patch 41');

console.log('PASS v0.4.41 release source parity');
