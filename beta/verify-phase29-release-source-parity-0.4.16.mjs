import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const ui = read('v03/ui.js');
const scanner = read('v03/scanner.js');
const evidence = read('v03/relationship-evidence.js');
const phase28 = read('beta/phase28-relationship-semantic-grounding-0.4.16.mjs');
const verify28 = read('beta/verify-phase28-relationship-semantic-grounding-0.4.16.mjs');
const verify25 = read('beta/verify-phase25-worldstate-identity-bridge-0.4.15.mjs');
const verify27 = read('beta/verify-phase27-release-source-parity-0.4.15.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

assert.equal(manifest.version, '0.4.16', 'Release source is not v0.4.16');
assert(ui.includes('NPC State <span class="npc-state-version">0.4.16</span>'), 'Committed runtime UI version is not v0.4.16');

assert(evidence.includes('ordinaryTrustSemanticGrounding'), 'Committed relationship evidence lacks semantic ordinary Trust grounding');
assert(evidence.includes('TRUST_PERFORMANCE_FAILURE'), 'Committed relationship evidence lacks fail-closed performance rejection');
assert(evidence.includes("String(expectations.impact || '').trim().toLocaleLowerCase() !== 'ordinary'"), 'Semantic fallback is no longer ordinary-only');
assert(evidence.includes("moving.length !== 1 || moving[0][0] !== 'trust' || Number(moving[0][1]) <= 0"), 'Semantic fallback is no longer narrow positive single-axis Trust');
assert(evidence.includes("semanticEventActorKind(clause, expectations) !== 'expected'"), 'Semantic fallback no longer requires a player-attributed event');
assert(scanner.includes('impact: change.impact') && scanner.includes('delta: change.delta'), 'Scanner does not pass relationship movement semantics into grounding');

assert(phase28.includes('ordinaryTrustSemanticGrounding'), 'v0.4.16 transform source lacks semantic grounding');
assert(verify28.includes('A concrete player-attributed bounty completion paraphrase was rejected as ungrounded'), 'Reported paraphrase regression is not persisted in source');
assert(verify28.includes('Another NPC performance was incorrectly credited to Lucien'), 'Wrong-actor negative regression is not persisted');
assert(verify28.includes('Actorless task completion incorrectly grounded a player Trust change'), 'Actorless negative regression is not persisted');
assert(verify28.includes('Failed or damaged work incorrectly grounded positive Trust'), 'Failed-performance negative regression is not persisted');
assert(verify28.includes('Meaningful Trust improperly inherited the ordinary semantic fallback'), 'Higher-impact isolation regression is not persisted');
assert(verify28.includes('Performance evidence leaked into Desire grounding'), 'Desire-isolation regression is not persisted');

assert(verify25.includes('Manifest regressed below v0.4.15'), 'v0.4.15 identity verifier descendant compatibility is not persisted');
assert(verify27.includes('Release source regressed below v0.4.15'), 'v0.4.15 parity verifier descendant compatibility is not persisted');

assert(workflow.includes('Build NPC State 0.4.16 Beta'), 'Workflow is not versioned for v0.4.16');
assert(workflow.includes('node beta/bump-0.4.16.mjs'), 'Workflow does not apply the v0.4.16 bump');
assert(workflow.includes("-name 'phase*-0.4.16.mjs'"), 'Workflow does not apply v0.4.16 phases');
assert(workflow.includes('ordinaryTrustSemanticGrounding'), 'Architecture gate does not guard semantic relationship grounding');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks source/runtime parity detection');

console.log('NPC State 0.4.16 release source parity verified');
