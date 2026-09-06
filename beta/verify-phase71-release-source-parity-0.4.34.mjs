import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const exists = path => fs.existsSync(path);
const manifest = JSON.parse(read('manifest.json'));

if (manifest.version !== '0.4.34') {
    console.log('NPC State v0.4.34 release parity verification skipped on pre-0.4.34 source checkout');
    process.exit(0);
}

const workflow = read('.github/workflows/seed-beta.yml');
const scanner = read('v03/scanner.js');
const injection = read('v03/injection.js');
const readme = read('README.md');
const changelog = read('CHANGELOG.md');

assert.equal(manifest.version, '0.4.34', 'Manifest is not v0.4.34');
assert(workflow.includes('name: Build NPC State 0.4.34 Beta'), 'Workflow title is not v0.4.34');
assert(workflow.includes('for patch in $(seq 2 34); do'), 'Cold replay does not include v0.4.34');
assert(workflow.includes("# node beta/bump-0.4.34.mjs ; -name 'phase*-0.4.34.mjs'"), 'Workflow lacks v0.4.34 source marker');

for (const path of [
    'beta/bump-0.4.34.mjs',
    'beta/phase70-terminal-status-life-state-reconciliation-0.4.34.mjs',
    'beta/verify-phase70-terminal-status-life-state-reconciliation-0.4.34.mjs',
    'beta/verify-phase71-release-source-parity-0.4.34.mjs',
]) assert(exists(path), 'Missing v0.4.34 source-owned file: ' + path);

assert(scanner.includes('status: npc.status'), 'Recovery scanner roster still omits Status');
assert(scanner.includes('lifeState: npc.lifeState'), 'Recovery scanner roster still omits Life state');
assert(scanner.includes('function lifeStateEvidenceMatchesStoredStatus(evidence, storedStatus)'), 'Stored-status evidence helper is missing');
assert(scanner.includes('proof === stored'), 'Stored-status evidence is not exact normalized equality');
assert(scanner.includes("const storedStatusDeathRepair = lifeState === 'dead'"), 'Stored-status evidence is not death-repair-only');
assert(scanner.includes('storedStatus: storedStatusBeforePatch'), 'Scanner does not preserve pre-patch stored Status for reconciliation');
assert(scanner.includes('STORED TERMINAL-STATUS RECONCILIATION'), 'Recovery scanner prompt lacks stored terminal-status rule');
assert(scanner.includes('Stored Status is NEVER sufficient evidence for livingReturn'), 'Recovery scanner does not isolate stored Status from resurrection');
assert(!scanner.includes('AFFIRMATIVE_DEATH_CUE'), 'Hardcoded death cue grammar remains');
assert(!scanner.includes('clauseAssertsNpcDeath'), 'Hardcoded death sentence parser remains');
assert(!scanner.includes('affirmativeDeathEvidence'), 'Hardcoded death semantic gate remains');

assert(injection.includes("field('Status', npc.status)"), 'Foreground continuity omits Status');
assert(injection.includes("field('Life state', npc.lifeState)"), 'Foreground continuity omits Life state');
assert(injection.includes("const lifecycle = deceased ? 'deceased'"), 'Foreground identity directory does not expose deceased lifecycle');
assert(injection.includes('STORED TERMINAL-STATUS RECONCILIATION'), 'Foreground capture lacks stored terminal-status rule');
assert(injection.includes('WORLD-ACTIVE CONSISTENCY'), 'Foreground capture lacks dead/worldActive rule');
assert(injection.includes('Stored Status can NEVER authorize livingReturn'), 'Foreground capture does not isolate stored Status from resurrection');

assert(readme.startsWith('# NPC State Beta 0.4.34'), 'README title is not v0.4.34');
assert(readme.includes('## Terminal-status lifecycle reconciliation'), 'README lacks v0.4.34 reconciliation documentation');
assert(changelog.includes('## v0.4.34'), 'CHANGELOG lacks v0.4.34 entry');
assert(changelog.includes('stored activity/condition'), 'CHANGELOG lacks terminal-status mismatch description');

console.log('NPC State v0.4.34 release source parity verified');
