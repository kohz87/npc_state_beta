import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function rep(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase 8D marker: ' + label);
    return source.replace(from, to);
}

let scanner = read('v03/scanner.js');
scanner = rep(scanner,
`        '- Existing form descriptions are sticky continuity facts. Never change an established form because later prose casually uses different dimensions, colors, anatomy, or proportions. Use appearanceFormChanges only when the CURRENT exchange explicitly corrects canon or establishes a real persistent physical change/growth/evolution. Every appearanceFormChanges entry requires concrete evidence; otherwise omit it.',`,
`        '- Existing form descriptions are sticky continuity facts. Never change an established form because later prose casually uses different dimensions, colors, anatomy, or proportions. Normally appearanceFormChanges requires an explicit CURRENT-exchange correction or real persistent physical change/growth/evolution. The only inferred exception is mode age_progression after an accepted birthday/elapsed ageChange and an authorized meaningful maturation interval, and it may touch only forms listed in ageProgression.affectedForms. Every revision still requires grounded transition/change evidence.',`,
'full form authority wording');
scanner = rep(scanner,
`        '- DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, and Role are sticky. Do not restate them with a different value merely because wording drifts. Any real revision must include canonChanges with the same field/value plus grounded evidence. appearance refine adds compatible lasting detail; appearance change needs a lasting physical change; species accepts explicit correction/revelation or a genuine permanent species change; background accepts grounded refinement/revelation/correction; role change needs an actual promotion/reassignment/retirement/etc. Scanner importance is non-authoritative and must not be used to raise dossier priority.',`,
`        '- DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, and Role are sticky. Do not restate them with a different value merely because wording drifts. Any real revision must include canonChanges with the same field/value plus grounded evidence. appearance refine adds compatible lasting detail; appearance change needs a lasting physical change; appearance age_progression is allowed only by the accepted birthday/elapsed maturation gate above; species accepts explicit correction/revelation or a genuine permanent species change; background accepts grounded refinement/revelation/correction; role change needs an actual promotion/reassignment/retirement/etc. Scanner importance is non-authoritative and must not be used to raise dossier priority.',`,
'full scalar authority wording');
scanner = rep(scanner,
`        '- Existing appearanceForms remain sticky; add genuinely new forms normally and use appearanceFormChanges only when the structured source explicitly corrects/changes a known form.',`,
`        '- Existing appearanceForms remain sticky; add genuinely new forms normally. For a known form, appearanceFormChanges normally requires an explicit structured-source correction/change; mode age_progression is the narrow exception when that same structured source establishes an accepted meaningful birthday/elapsed maturation transition and names the affected existing form.',`,
'structured form authority wording');
scanner = rep(scanner,
`        'appearanceFormChanges may revise a stored form only when this chat explicitly corrects canon or establishes persistent physical growth/change/evolution; include concrete evidence for every revision.',`,
`        'appearanceFormChanges normally revises a stored form only when this chat explicitly corrects canon or establishes persistent physical growth/change/evolution. mode age_progression is the narrow exception after an accepted meaningful birthday/elapsed maturation transition and only for forms listed in ageProgression.affectedForms. Include grounded evidence for every revision.',`,
'targeted form authority wording');
scanner = rep(scanner,
`        'DURABLE SCALAR CANON: preserve established ordinary Appearance, Species, Background, and Role unless this window explicitly supports a canonChanges revision. Use canonChanges with field/value/evidence and mode refine|change|correction|revelation. Never use scanner importance to reprioritize the dossier.',`,
`        'DURABLE SCALAR CANON: preserve established ordinary Appearance, Species, Background, and Role unless this window supports an authorized canonChanges revision. Use field/value/evidence and mode refine|change|correction|revelation, plus age_progression only for Appearance after the accepted maturation gate above. Never use scanner importance to reprioritize the dossier.',`,
'targeted scalar authority wording');
write('v03/scanner.js', scanner);

let injection = read('v03/injection.js');
injection = rep(injection,
`        'appearanceFormChanges is the only scanner channel allowed to revise an existing form. Use it only for an explicit current-exchange correction or real persistent growth/change/evolution, and include concrete evidence copied or faithfully paraphrased from this exchange; the backend verifies that evidence against visible narrative. Otherwise omit/null it.',`,
`        'appearanceFormChanges is the only scanner channel allowed to revise an existing form. Normally it requires an explicit current-exchange correction or real persistent growth/change/evolution. mode age_progression is the narrow inferred exception after an accepted meaningful birthday/elapsed maturation transition and only for forms listed in ageProgression.affectedForms. Include grounded evidence; the backend verifies the transition/change authority. Otherwise omit/null it.',`,
'foreground form authority wording');
injection = rep(injection,
`        'DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, and Role are sticky. If one truly changes, return canonChanges with field, mode refine|change|correction|revelation, the same replacement value, and concrete current-exchange evidence. Appearance change requires lasting physical change, Species requires explicit correction/revelation or genuine permanent transformation, Background requires grounded refinement/revelation/correction, and Role changes only on an actual promotion/reassignment/retirement/etc. importance is user/editor-owned and scanner importance is ignored.',`,
`        'DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, and Role are sticky. If one truly changes, return canonChanges with the same replacement value and grounded evidence. Modes are refine|change|correction|revelation, with age_progression additionally allowed only for Appearance after the accepted maturation gate above. Ordinary Appearance change requires lasting physical change, Species requires explicit correction/revelation or genuine permanent transformation, Background requires grounded refinement/revelation/correction, and Role changes only on an actual promotion/reassignment/retirement/etc. importance is user/editor-owned and scanner importance is ignored.',`,
'foreground scalar authority wording');
write('v03/injection.js', injection);

console.log('Aligned NPC State 0.4.3 age-progression authority wording across scanner surfaces');
