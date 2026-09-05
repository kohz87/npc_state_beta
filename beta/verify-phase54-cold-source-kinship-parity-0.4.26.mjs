import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scanner = read('v03/scanner.js');
const injection = read('v03/injection.js');
const workflow = read('.github/workflows/seed-beta.yml');
const transform = read('beta/phase52-general-kinship-projection-0.4.26.mjs');

const patchVersion = Number(String(manifest.version || '').split('.').at(-1));
assert(/^0\.4\.\d+$/.test(String(manifest.version || '')) && patchVersion >= 26, 'Cold-source parity guard requires v0.4.26 or a descendant');
assert(scanner.includes('const FAMILY_KINSHIP_GROUPS'), 'Generated scanner lost general kinship groups');
assert(scanner.includes('function reciprocalFamilyRelation'), 'Generated scanner lost reciprocal kinship mapping');
assert(scanner.includes('function resolveFamilySlotMember'), 'Generated scanner lost generic slot resolution');
assert(scanner.includes('function upsertFamilyRelationship'), 'Generated scanner lost reciprocal Key relationship projection');
assert(scanner.includes('groundedFamilyMemberNames'), 'v0.4.25 public-evidence member grounding regressed');
assert(scanner.includes('visibleShortActivityIdentityMention'), 'v0.4.24 presence grounding regressed');
assert(injection.includes('COUNTABLE FAMILY FACTS / GENERAL KINSHIP'), 'Generated foreground prompt lost general kinship guidance');
assert(injection.includes('\"members\":[\"explicitly named members from current visible evidence\"]'), 'Generated foreground familyFacts shape lost members');
assert(transform.includes('never guess an unknown gender'), 'Source transform lost conservative reciprocal policy');
assert(/for patch in \$\(seq 2 \d+\); do/.test(workflow), 'Cold-build workflow lost numeric release replay');
assert(workflow.includes('# node beta/bump-0.4.26.mjs'), 'Cold-build workflow lost v0.4.26 release marker');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Cold-build workflow lacks zero-diff parity exit');

console.log('NPC State 0.4.26 cold-source kinship parity verified on descendant release');
