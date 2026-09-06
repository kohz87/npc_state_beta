import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const exists = path => fs.existsSync(path);
const manifest = JSON.parse(read('manifest.json'));

if (manifest.version !== '0.4.35') {
    console.log('NPC State v0.4.35 release parity verification skipped on pre-0.4.35 source checkout');
    process.exit(0);
}

const workflow = read('.github/workflows/seed-beta.yml');
const recoveryUi = read('v03/branch-recovery-ui.js');
const readme = read('README.md');
const changelog = read('CHANGELOG.md');

assert.equal(manifest.version, '0.4.35', 'Manifest is not v0.4.35');
assert(workflow.includes('name: Build NPC State 0.4.35 Beta'), 'Workflow title is not v0.4.35');
assert(workflow.includes('for patch in $(seq 2 35); do'), 'Cold replay does not include v0.4.35');
assert(workflow.includes("# node beta/bump-0.4.35.mjs ; -name 'phase*-0.4.35.mjs'"), 'Workflow lacks v0.4.35 source marker');

for (const path of [
    'beta/bump-0.4.35.mjs',
    'beta/phase72-responsive-recovery-controls-0.4.35.mjs',
    'beta/verify-phase72-responsive-recovery-controls-0.4.35.mjs',
    'beta/verify-phase73-release-source-parity-0.4.35.mjs',
]) assert(exists(path), 'Missing v0.4.35 source-owned file: ' + path);

assert(recoveryUi.includes('PHASE72_RESPONSIVE_RECOVERY_CONTROLS'), 'Generated runtime lacks responsive recovery marker');
assert(recoveryUi.includes('grid-template-columns:repeat(2,minmax(0,1fr))'), 'Generated runtime lacks bounded recovery action grid');
assert(recoveryUi.includes('white-space:normal!important'), 'Generated runtime does not allow recovery button label wrapping');
assert(recoveryUi.includes('@media(max-width:720px)'), 'Generated runtime lacks narrow recovery layout');

assert(readme.startsWith('# NPC State Beta 0.4.35'), 'README title is not v0.4.35');
assert(readme.includes('## Responsive recovery controls'), 'README lacks v0.4.35 recovery UI documentation');
assert(changelog.includes('## v0.4.35'), 'CHANGELOG lacks v0.4.35 entry');
assert(changelog.includes('Force Timeline Rebase'), 'CHANGELOG lacks recovery overflow fix description');

console.log('NPC State v0.4.35 release source parity verified');
