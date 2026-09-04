import fs from 'node:fs';

const path = 'beta/phase6-admission-and-observability-0.4.3.mjs';
let source = fs.readFileSync(path, 'utf8');
const oldAge = "aliases: [], role: '', species: '', age: 'actual chronological numeric age only: N, ~N, or N days/weeks/months; never child/adult/elderly', apparentAge: '~N only, e.g. ~25, or empty'";
const currentAge = "aliases: [], role: '', species: '', age: 'initial actual chronological numeric age only, or same-value refinement; use ageChange for an established age changing', ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence that states the new age' }, apparentAge: '~N only, e.g. ~25, or empty'";
const matches = source.split(oldAge).length - 1;
if (matches !== 2) throw new Error('Expected two legacy age-contract literals inside Phase 6, found ' + matches);
source = source.replaceAll(oldAge, currentAge);
fs.writeFileSync(path, source);
console.log('Prepared Phase 6 identityKind patch for the current age + ageChange contract');
