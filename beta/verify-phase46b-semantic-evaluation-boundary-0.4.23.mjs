import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE,
    RELATIONSHIP_JUDGMENT_EVAL_FIXTURES,
} from './relationship-judgment-eval-fixtures-0.4.23.mjs';

// These checks validate the offline evaluation pack and its isolation only.
// They do not substitute mocked proposals or deterministic assertions for a live LLM evaluation.
const required = new Map([
    ['desire-increase-clear-indirect', ['clear-move', 'desire']],
    ['desire-decrease-clear', ['clear-move', 'desire']],
    ['affection-decrease-clear', ['clear-move', 'affection']],
    ['desire-material-ambiguity-small-or-zero', ['ambiguous-small-or-zero', 'desire']],
    ['unchanged-negative-attitude-zero', ['justified-zero', null]],
]);

for (const [id, [expectedClass, expectedAxis]] of required) {
    const fixture = RELATIONSHIP_JUDGMENT_EVAL_FIXTURES.find(item => item.id === id);
    assert(fixture, 'Missing semantic evaluation fixture: ' + id);
    assert.equal(fixture.acceptance.class, expectedClass, 'Unexpected calibration class for ' + id);
    if (expectedAxis) assert(fixture.acceptance.allowedAxes.includes(expectedAxis), 'Expected axis is not allowed for ' + id);
    assert(!Object.prototype.hasOwnProperty.call(fixture.acceptance, 'exactDelta'), 'Fixture hard-codes an exact numeric score: ' + id);
}

const fixtureSource = fs.readFileSync(new URL('./relationship-judgment-eval-fixtures-0.4.23.mjs', import.meta.url), 'utf8');
const policySource = fs.readFileSync(new URL('../v03/relationship-policy.js', import.meta.url), 'utf8');
const scannerSource = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
assert(RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE.semanticCoverage.includes('Affection decrease'), 'Extended fixture coverage description is incomplete');
assert(fixtureSource.includes('NOT deterministic runtime expectations'), 'Evaluation/live-model boundary is not explicit');
assert(!fixtureSource.includes("from '../v03/scanner.js'"), 'Offline evaluation fixtures import runtime scoring');
for (const id of required.keys()) {
    assert(!policySource.includes(id) && !scannerSource.includes(id), 'Scenario-specific evaluation fixture leaked into production logic: ' + id);
}
assert(!scannerSource.includes('DESIRE_EVIDENCE_CUES'), 'Fixture expansion introduced a Desire keyword gate');
assert(!scannerSource.includes('relationshipEvidenceGrounding('), 'Fixture expansion introduced a semantic runtime veto');

console.log('NPC State 0.4.23 semantic evaluation fixture boundary verified');
