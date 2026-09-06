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
const styleStart = recoveryUi.indexOf('style.textContent = `');
const styleEnd = styleStart >= 0 ? recoveryUi.indexOf('`;', styleStart) : -1;
assert(styleStart >= 0 && styleEnd > styleStart, 'Branch recovery style block could not be isolated');
const styleBlock = recoveryUi.slice(styleStart, styleEnd);
const rowRule = '#${FORCE_ID}{display:grid!important;grid-template-columns:minmax(0,1fr);gap:8px;align-items:start;width:100%;min-width:0;max-width:100%;box-sizing:border-box}';
const actionsRule = '#${FORCE_ID} .npc-state-v3-branch-recovery-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;min-width:0;max-width:100%;box-sizing:border-box}';
const buttonRule = '#${FORCE_ID} button{margin:0;width:100%;min-width:0;max-width:100%;height:auto;min-height:32px;box-sizing:border-box;white-space:normal!important;overflow-wrap:anywhere;line-height:1.25}';
assert(styleBlock.includes(rowRule), 'Force Timeline Rebase row is not locally bounded to one full-width content column');
assert(styleBlock.includes(actionsRule), 'Force Timeline Rebase action grid is not locally bounded');
assert(styleBlock.includes(buttonRule), 'Force Timeline Rebase buttons are not width-bounded and wrapping-safe');
assert(styleBlock.indexOf(rowRule) < styleBlock.indexOf(actionsRule), 'Action grid rule is not scoped under the force-rebase row contract');
assert(styleBlock.indexOf(actionsRule) < styleBlock.indexOf(buttonRule), 'Button wrapping rule is not scoped after the force-rebase action grid');
assert(!styleBlock.includes('#${FORCE_ID} .npc-state-v3-branch-recovery-actions{display:flex'), 'Force rebase actions regressed to an unbounded flex row');
assert(styleBlock.includes('@media(max-width:720px){#${FORCE_ID} .npc-state-v3-branch-recovery-actions{grid-template-columns:1fr}}'), 'Generated runtime lacks narrow single-column recovery actions');

assert(readme.startsWith('# NPC State Beta 0.4.35'), 'README title is not v0.4.35');
assert(readme.includes('## Responsive recovery controls'), 'README lacks v0.4.35 recovery UI documentation');
assert(changelog.includes('## v0.4.35'), 'CHANGELOG lacks v0.4.35 entry');
assert(changelog.includes('Force Timeline Rebase'), 'CHANGELOG lacks recovery overflow fix description');

console.log('NPC State v0.4.35 release source parity verified');
