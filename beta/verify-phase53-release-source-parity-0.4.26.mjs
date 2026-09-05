import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scanner = read('v03/scanner.js');
const injection = read('v03/injection.js');
const schema = read('v03/schema.js');
const phase52 = read('beta/phase52-general-kinship-projection-0.4.26.mjs');
const verify52 = read('beta/verify-phase52-general-kinship-projection-0.4.26.mjs');
const verify50 = read('beta/verify-phase50-named-family-key-relationships-0.4.25.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

assert.equal(manifest.version, '0.4.26', 'Release source is not v0.4.26');
for (const marker of [
    'const FAMILY_KINSHIP_GROUPS',
    'reciprocalFamilyRelation',
    'resolveFamilySlotMember',
    'upsertFamilyRelationship',
    'projectFamilySlotMembers',
    'groundedFamilyMemberNames',
]) assert(scanner.includes(marker), 'General kinship runtime marker missing: ' + marker);
assert(schema.includes('memberNames'), 'v0.4.25 named-member persistence regressed');
assert(scanner.includes('visibleShortActivityIdentityMention'), 'v0.4.24 presence short-name bridge regressed');
assert(scanner.includes("const relation = isTwin ? 'twin sibling' : 'sibling';"), 'Shared-parent sibling/twin inference regressed');
assert(scanner.includes("members: ['explicitly named members from visible evidence; [] when unnamed']"), 'Recovery named-member evidence contract regressed');

for (const marker of ['sister', 'uncle', 'niece', 'nephew', 'cousin', 'grandparent', 'grandchild', 'spouse', 'guardian', 'ward', 'in-law']) {
    assert(scanner.includes(marker), 'Recovery kinship vocabulary missing: ' + marker);
    assert(injection.includes(marker), 'Foreground kinship vocabulary missing: ' + marker);
}
assert(injection.includes('COUNTABLE FAMILY FACTS / GENERAL KINSHIP'), 'Foreground general-kinship rule missing');
assert(injection.includes('"members":["explicitly named members from current visible evidence"]'), 'Foreground familyFacts JSON members field missing');
assert(injection.includes('never guess an unknown gender'), 'Reciprocal gender-safety guidance missing');
assert(injection.includes('MUST NOT create NPC dossiers by themselves'), 'Named-relative admission isolation regressed');
assert(injection.includes('Never source member names only from World_State, NPC_Inner_Chatter, control blocks, or older continuity'), 'Family evidence firewall regressed');

for (const marker of [
    'kinship-sibling-reciprocal',
    'kinship-uncle',
    'kinship-cousin',
    'kinship-grandparent',
    'kinship-spouse',
    'kinship-guardian',
    'kinship-in-law',
    'kinship-twin-sibling',
    'kinship-non-family',
    'kinship-counterpart-lock',
    'kinship-child-regression',
]) assert(verify52.includes(marker), 'v0.4.26 regression pack lacks scenario: ' + marker);
assert(verify52.includes("'Mara Vane - sibling'"), 'Sibling reciprocal assertion missing');
assert(verify52.includes("'Lyra Vane - niece/nephew'"), 'Aunt/uncle reciprocal assertion missing');
assert(verify52.includes("'Anna Reed - spouse'"), 'Spouse reciprocal assertion missing');
assert(verify52.includes("'Nia Vale - ward'"), 'Guardian/ward reciprocal assertion missing');
assert(verify52.includes("'Oren Pike - child-in-law'"), 'In-law reciprocal assertion missing');

// v0.4.25 exact named-daughter coverage remains part of the suite.
assert(verify50.includes('greta-named-twins'), 'v0.4.25 Greta named-twin regression disappeared');
assert(verify50.includes("'Lyra - daughter'"), 'v0.4.25 named daughter projection regression disappeared');
assert(phase52.includes('FAMILY_KINSHIP_GROUPS'), 'v0.4.26 transform source lacks general kinship classifier');
assert(phase52.includes('reciprocalFamilyRelation'), 'v0.4.26 transform source lacks reciprocal mapping');
assert(phase52.includes('COUNTABLE FAMILY FACTS / GENERAL KINSHIP'), 'v0.4.26 transform source lacks foreground prompt integration');

assert(workflow.includes('Build NPC State 0.4.26 Beta'), 'Workflow is not versioned for v0.4.26');
assert(workflow.includes('for patch in $(seq 2 26); do'), 'Workflow does not cold-replay through v0.4.26');
assert(workflow.includes('# node beta/bump-0.4.26.mjs'), 'Workflow lacks v0.4.26 source marker');
assert(workflow.includes("-name 'phase*-0.4.26.mjs'"), 'Workflow does not apply v0.4.26 phases');
for (const marker of ['FAMILY_KINSHIP_GROUPS', 'reciprocalFamilyRelation', 'resolveFamilySlotMember', 'upsertFamilyRelationship']) {
    assert(workflow.includes(marker), 'Architecture gate lacks v0.4.26 marker: ' + marker);
}
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks zero-diff parity detection');

console.log('NPC State 0.4.26 release source parity verified');
