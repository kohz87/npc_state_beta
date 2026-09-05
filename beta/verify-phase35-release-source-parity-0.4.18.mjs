import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scanner = read('v03/scanner.js');
const injection = read('v03/injection.js');
const dossier = read('v03/dossier-view.js');
const ui = read('v03/ui.js');
const phase33 = read('beta/phase33-relationship-evaluation-observability-0.4.18.mjs');
const phase34 = read('beta/phase34-legacy-v0417-verifier-compat-0.4.18.mjs');
const verify33 = read('beta/verify-phase33-relationship-evaluation-observability-0.4.18.mjs');
const verify30 = read('beta/verify-phase30-relationship-progression-0.4.17.mjs');
const verify32 = read('beta/verify-phase32-release-source-parity-0.4.17.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

assert.equal(manifest.version, '0.4.18', 'Release source is not v0.4.18');
assert(ui.includes('NPC State <span class="npc-state-version">0.4.18</span>'), 'Committed runtime UI version is not v0.4.18');

assert(scanner.includes('RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds'), 'Recovery scanner relationship-evaluation mandate is missing');
assert(injection.includes('RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds'), 'Foreground scanner relationship-evaluation mandate is missing');
assert(scanner.includes('relationshipChange.evaluated to true'), 'Recovery scanner evaluated flag contract is missing');
assert(injection.includes('relationshipChange.evaluated to true'), 'Foreground scanner evaluated flag contract is missing');
assert(scanner.includes('function relationshipEvaluationDiagnostic'), 'Runtime evaluation diagnostic helper is missing');
assert(scanner.includes("['evaluated-no-change']"), 'Runtime deliberate-zero diagnostic is missing');
assert(scanner.includes("['evaluation-missing']"), 'Runtime missing-evaluation diagnostic is missing');
assert(scanner.includes("['evaluation-invalid']"), 'Runtime invalid-evaluation diagnostic is missing');
assert(scanner.includes('if (applyRelationship && exchangeSet.has(npc.id) && !patch)'), 'Runtime does not diagnose an exchange-active NPC omitted from npcs patches');
assert(dossier.includes('Gate status and recent relationship evaluations'), 'Dossier relationship diagnostic label is stale');
assert(dossier.includes('Evaluated; no relationship movement warranted.'), 'Dossier deliberate-zero message is missing');
assert(dossier.includes('Required relationship evaluation was omitted by the scanner.'), 'Dossier omission message is missing');

assert(phase33.includes('relationshipEvaluationDiagnostic'), 'v0.4.18 transform source lacks evaluation diagnostics');
assert(phase33.includes('evaluated-no-change'), 'v0.4.18 transform source lacks deliberate-zero telemetry');
assert(phase33.includes('evaluation-missing'), 'v0.4.18 transform source lacks omission telemetry');
assert(phase33.includes('relationshipChange.evaluated to true'), 'v0.4.18 transform source lacks prompt contract');
assert(phase34.includes('v0.4.17 relationship verifiers forward-compatible'), 'v0.4.17 compatibility transform is missing');

assert(verify33.includes('Explicit no-change evaluation polluted relationship history'), 'No-change history-isolation regression is not persisted');
assert(verify33.includes('Missing active-NPC relationship evaluation was silent'), 'Missing-evaluation regression is not persisted');
assert(verify33.includes('Malformed attempted relationship change was not diagnosed'), 'Invalid-evaluation regression is not persisted');
assert(verify33.includes('Presence-only NPC received spurious missing-evaluation telemetry'), 'Presence-only regression is not persisted');
assert(verify33.includes('Relationship-disabled rescan duplicated evaluation telemetry'), 'Rescan telemetry regression is not persisted');
assert(verify30.includes('Manifest regressed below v0.4.17'), 'v0.4.17 progression verifier is not descendant-compatible');
assert(verify32.includes('Release source regressed below v0.4.17'), 'v0.4.17 parity verifier is not descendant-compatible');

assert(workflow.includes('Build NPC State 0.4.18 Beta'), 'Workflow is not versioned for v0.4.18');
assert(workflow.includes('node beta/bump-0.4.18.mjs'), 'Workflow does not apply the v0.4.18 bump');
assert(workflow.includes("-name 'phase*-0.4.18.mjs'"), 'Workflow does not apply v0.4.18 phases');
assert(workflow.includes('relationshipEvaluationDiagnostic'), 'Architecture gate does not guard evaluation diagnostics');
assert(workflow.includes('evaluated-no-change'), 'Architecture gate does not guard deliberate-zero telemetry');
assert(workflow.includes('Persistent NPC State 0.4.18 database'), 'Architecture gate does not guard the v0.4.18 runtime surface');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks deterministic source/runtime parity detection');

console.log('NPC State 0.4.18 release source parity verified');
