import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE,
    RELATIONSHIP_JUDGMENT_EVAL_FIXTURES,
} from './relationship-judgment-eval-fixtures-0.4.22.mjs';

const fixtureSource = fs.readFileSync(new URL('./relationship-judgment-eval-fixtures-0.4.22.mjs', import.meta.url), 'utf8');
const promptVerifier = fs.readFileSync(new URL('./verify-phase44-relationship-judgment-rubric-0.4.22.mjs', import.meta.url), 'utf8');

assert(RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE.purpose.includes('Live/offline model judgment calibration'), 'Evaluation-fixture purpose is not explicit');
assert(RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE.purpose.includes('not deterministic runtime scoring'), 'Evaluation fixtures could be mistaken for runtime scoring rules');
assert(fixtureSource.includes('NOT deterministic runtime expectations'), 'Fixture source does not state the live-model evaluation limitation');
assert(promptVerifier.includes('do NOT prove that a live LLM will make better semantic judgments'), 'Deterministic prompt tests are not clearly separated from live model evaluation');
assert(!fixtureSource.includes("from '../v03/scanner.js'"), 'Offline semantic fixtures became coupled to runtime scoring');
assert(RELATIONSHIP_JUDGMENT_EVAL_FIXTURES.some(item => item.acceptance.class === 'clear-move'), 'Live evaluation pack lacks justified movement cases');
assert(RELATIONSHIP_JUDGMENT_EVAL_FIXTURES.some(item => item.acceptance.class === 'justified-zero'), 'Live evaluation pack lacks justified zero cases');
assert(RELATIONSHIP_JUDGMENT_EVAL_FIXTURES.some(item => item.acceptance.class === 'ambiguous-small-or-zero'), 'Live evaluation pack lacks calibrated ambiguity cases');

console.log('NPC State 0.4.22 live-model evaluation boundary verified');
