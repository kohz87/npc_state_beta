import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scanner = read('v03/scanner.js');
const injection = read('v03/injection.js');
const ui = read('v03/ui.js');
const phase36 = read('beta/phase36-per-axis-relationship-grounding-0.4.19.mjs');
const phase37 = read('beta/phase37-legacy-v0418-verifier-compat-0.4.19.mjs');
const verify36 = read('beta/verify-phase36-per-axis-relationship-grounding-0.4.19.mjs');
const verify33 = read('beta/verify-phase33-relationship-evaluation-observability-0.4.18.mjs');
const verify35 = read('beta/verify-phase35-release-source-parity-0.4.18.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

assert.equal(manifest.version, '0.4.19', 'Release source is not v0.4.19');
assert(ui.includes('NPC State <span class="npc-state-version">0.4.19</span>'), 'Committed runtime UI version is not v0.4.19');

assert(scanner.includes('function relationshipAxisGrounding'), 'Runtime per-axis grounding helper is missing');
assert(scanner.includes("reasons.push(axis + ':' + rejection)"), 'Runtime axis-specific rejection diagnostics are missing');
assert(scanner.includes("axis + ':evidence-polarity'"), 'Runtime axis-specific polarity rejection is missing');
assert(scanner.includes('const groundedChange = { ...change, delta: { ...filteredDelta } };'), 'Duplicate detection is not based on the grounded subset');
assert(scanner.includes("reasons.includes('partial-applied')"), 'Runtime partial-application diagnostics are missing');
assert(scanner.includes('MULTI-AXIS RELATIONSHIP EVIDENCE'), 'Recovery scanner per-axis evidence contract is missing');
assert(injection.includes('MULTI-AXIS RELATIONSHIP EVIDENCE'), 'Foreground scanner per-axis evidence contract is missing');

assert(phase36.includes('relationshipAxisGrounding'), 'v0.4.19 transform source lacks per-axis grounding');
assert(phase36.includes('partial-applied'), 'v0.4.19 transform source lacks partial application telemetry');
assert(phase37.includes('v0.4.18 relationship verifiers forward-compatible'), 'v0.4.18 compatibility transform is missing');
assert(verify36.includes('Grounded Trust was discarded because another axis was weak'), 'Mixed-axis regression is not persisted');
assert(verify36.includes('Grounded Tension reduction was discarded with unsupported Desire'), 'Desire isolation regression is not persisted');
assert(verify33.includes('Manifest regressed below v0.4.18'), 'v0.4.18 evaluation verifier is not descendant-compatible');
assert(verify35.includes('Release source regressed below v0.4.18'), 'v0.4.18 parity verifier is not descendant-compatible');

assert(workflow.includes('Build NPC State 0.4.19 Beta'), 'Workflow is not versioned for v0.4.19');
assert(workflow.includes('node beta/bump-0.4.19.mjs'), 'Workflow does not apply the v0.4.19 bump');
assert(workflow.includes("-name 'phase*-0.4.19.mjs'"), 'Workflow does not apply v0.4.19 phases');
assert(workflow.includes('relationshipAxisGrounding'), 'Architecture gate does not guard per-axis grounding');
assert(workflow.includes('partial-applied'), 'Architecture gate does not guard partial-application diagnostics');
assert(workflow.includes('Persistent NPC State 0.4.19 database'), 'Architecture gate does not guard the v0.4.19 runtime surface');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks deterministic source/runtime parity detection');

console.log('NPC State 0.4.19 release source parity verified');
