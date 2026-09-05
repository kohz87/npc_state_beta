import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const ui = read('v03/ui.js');
const scanner = read('v03/scanner.js');
const evidence = read('v03/relationship-evidence.js');
const phase30 = read('beta/phase30-relationship-progression-0.4.17.mjs');
const phase31 = read('beta/phase31-legacy-v0416-verifier-compat-0.4.17.mjs');
const verify30 = read('beta/verify-phase30-relationship-progression-0.4.17.mjs');
const verify28 = read('beta/verify-phase28-relationship-semantic-grounding-0.4.16.mjs');
const verify29 = read('beta/verify-phase29-release-source-parity-0.4.16.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

assert.equal(manifest.version, '0.4.17', 'Release source is not v0.4.17');
assert(ui.includes('NPC State <span class="npc-state-version">0.4.17</span>'), 'Committed runtime UI version is not v0.4.17');

const deepeningBlock = scanner.slice(scanner.indexOf('function relationshipInertiaFactor'), scanner.indexOf("    if (impact === 'extreme') return 1;", scanner.indexOf('function relationshipInertiaFactor')));
assert(deepeningBlock.includes('if (magnitude < 25) return 1;'), '0–24 inertia band is not ×1.00');
assert(deepeningBlock.includes('if (magnitude < 50) return 0.8;'), '25–49 inertia band is not ×0.80');
assert(deepeningBlock.includes('if (magnitude < 75) return 0.6;'), '50–74 inertia band is not ×0.60');
assert(deepeningBlock.includes('if (magnitude < 90) return 0.4;'), '75–89 inertia band is not ×0.40');
assert(deepeningBlock.includes('return 0.25;'), '90–100 inertia band is not ×0.25');
assert(scanner.includes("if (impact === 'major')") && scanner.includes("if (impact === 'meaningful')"), 'Movement-toward-neutral recovery curve was removed');
assert(scanner.includes('RELATIONSHIP_MILESTONE_MIN_RAW'), 'Milestone raw evidence minima disappeared');

assert(evidence.includes('relationshipSemanticGrounding'), 'Generic semantic relationship grounding is missing');
assert(evidence.includes('semanticMentionsTarget'), 'Semantic grounding no longer binds the target NPC');
assert(evidence.includes("semanticEventActorKind(clause, expectations) !== 'expected'"), 'Semantic grounding no longer binds the player actor');
assert(evidence.includes("movement.axis === 'desire'"), 'Desire is no longer isolated from broad semantic grounding');
assert(evidence.includes('TRUST_PERFORMANCE_FAILURE'), 'Positive Trust failure guard disappeared');
assert(evidence.includes('relationshipOutcomesConflict(proof, clause)'), 'Semantic contradiction guard disappeared');

assert(phase30.includes('magnitude < 25') && phase30.includes('return 0.25'), 'v0.4.17 transform source lacks aligned inertia');
assert(phase30.includes('relationshipSemanticGrounding'), 'v0.4.17 transform source lacks generalized semantic grounding');
assert(phase30.includes('semanticMentionsTarget'), 'v0.4.17 transform source lacks target binding');
assert(phase31.includes('v0.4.16 relationship verifiers forward-compatible'), 'v0.4.16 verifier compatibility transform is missing');

assert(verify30.includes('25–49 deepening multiplier is not ×0.80'), 'Second-band progression regression is not persisted');
assert(verify30.includes('50–74 deepening multiplier is not ×0.60'), 'Third-band progression regression is not persisted');
assert(verify30.includes('90–100 deepening multiplier is not ×0.25'), 'Final-band progression regression is not persisted');
assert(verify30.includes('Movement toward neutral is no longer easier than deepening'), 'Neutral-recovery regression is not persisted');
assert(verify30.includes('Ordinary evidence crossed a locked 25 gate'), 'Milestone-lock regression is not persisted');
assert(verify30.includes('Another NPC performance was credited to Lucien'), 'Wrong-actor semantic regression is not persisted');
assert(verify30.includes('event that never connected the target NPC'), 'Target-binding semantic regression is not persisted');
assert(verify30.includes('Broad semantic performance evidence leaked into Desire'), 'Desire-isolation semantic regression is not persisted');

assert(verify28.includes('Manifest regressed below v0.4.16'), 'v0.4.16 behavior verifier is not descendant-compatible');
assert(verify28.includes('Meaningful Trust paraphrase regressed after grounding/difficulty separation'), 'v0.4.16 grounding verifier did not evolve with the new evidence/difficulty separation');
assert(verify29.includes('Release source regressed below v0.4.16'), 'v0.4.16 release parity verifier is not descendant-compatible');
assert(verify29.includes('semanticMovingAxis'), 'v0.4.16 release parity verifier still assumes ordinary-only Trust grounding');

assert(workflow.includes('Build NPC State 0.4.17 Beta'), 'Workflow is not versioned for v0.4.17');
assert(workflow.includes('node beta/bump-0.4.17.mjs'), 'Workflow does not apply the v0.4.17 bump');
assert(workflow.includes("-name 'phase*-0.4.17.mjs'"), 'Workflow does not apply v0.4.17 phases');
assert(workflow.includes('relationshipSemanticGrounding'), 'Architecture gate does not guard generalized semantic grounding');
assert(workflow.includes('Persistent NPC State 0.4.17 database'), 'Architecture gate does not guard the v0.4.17 runtime surface');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks deterministic source/runtime parity detection');

console.log('NPC State 0.4.17 release source parity verified');
