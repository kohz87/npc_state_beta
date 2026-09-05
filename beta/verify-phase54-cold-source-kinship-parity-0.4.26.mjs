import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scanner = read('v03/scanner.js');
const injection = read('v03/injection.js');
const workflow = read('.github/workflows/seed-beta.yml');
const transform = read('beta/phase52-general-kinship-projection-0.4.26.mjs');

assert.equal(manifest.version, '0.4.26', 'Cold-source parity guard requires v0.4.26');
assert(scanner.includes('const FAMILY_KINSHIP_GROUPS'), 'Generated scanner lost general kinship groups');
assert(scanner.includes('function reciprocalFamilyRelation'), 'Generated scanner lost reciprocal kinship mapping');
assert(scanner.includes('function resolveFamilySlotMember'), 'Generated scanner lost generic slot resolution');
assert(scanner.includes('function upsertFamilyRelationship'), 'Generated scanner lost reciprocal Key relationship projection');
assert(scanner.includes('groundedFamilyMemberNames'), 'v0.4.25 public-evidence member grounding regressed');
assert(scanner.includes('visibleShortActivityIdentityMention'), 'v0.4.24 presence grounding regressed');
assert(injection.includes('COUNTABLE FAMILY FACTS / GENERAL KINSHIP'), 'Generated foreground prompt lost general kinship guidance');
assert(injection.includes('"members":["explicitly named members from current visible evidence"]'), 'Generated foreground familyFacts shape lost members');
assert(transform.includes('never guess an unknown gender'), 'Source transform lost conservative reciprocal policy');
assert(workflow.includes('for patch in $(seq 2 26); do'), 'Cold-build workflow does not replay v0.4.26');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Cold-build workflow lacks zero-diff parity exit');

console.log('NPC State 0.4.26 cold-source kinship parity verified');
