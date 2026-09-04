import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function rep(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase 8C marker: ' + label);
    return source.replace(from, to);
}
function addAfter(source, marker, insertion, unique, label) {
    if (source.includes(unique)) return source;
    if (!source.includes(marker)) throw new Error('Missing phase 8C insertion marker: ' + label);
    return source.replace(marker, marker + insertion);
}

let scanner = read('v03/scanner.js');
const fullAgeRule = `        '- ageChange is the only automatic channel allowed to change an already-established chronological age. kind birthday requires explicit birthday/turned-N evidence; elapsed requires explicit elapsed-time narration that also states the resulting age; correction requires explicit correction/mistake evidence that states the corrected age. The evidence must contain the new numeric age. Casual contradictory age prose, appearance-based guesses, and unstated arithmetic are rejected by the backend. Leave ageChange null/omit when no authoritative chronological change occurred.',`;
scanner = addAfter(scanner, fullAgeRule,
`\n        '- AGE-LINKED APPEARANCE EVOLUTION: after every valid birthday or elapsed ageChange, reconsider apparentAge and age-sensitive appearance in the SAME scan. Use ageProgression {maturation: ordinary|accelerated|long_lived|ageless|unknown, meaningful, basis, evidence, affectsShared, affectedForms}. Choose maturation behavior from established species, setting lore, existing apparent age, or known biology; unknown fantasy species stay unknown rather than silently using human aging. correction never causes physical maturation. It is valid to conclude meaningful false and leave appearance unchanged, especially for insignificant adult birthdays, long-lived races, ageless beings, or small intervals. Minor maturation descriptions must remain neutral and non-sexual.',\n        '- AGE-PROGRESSION CHANNELS: canonChanges mode age_progression revises only age-sensitive shared/ordinary appearance. appearanceFormChanges mode age_progression revises only existing forms named in ageProgression.affectedForms. Preserve hair/eye colors, scars, species markers, magical traits, horn/wing/tail structure, and unrelated anatomy. Never replace the entire form registry because one form matured. When appearance still duplicates Base, revise Base and let NPC State synchronize the legacy scalar instead of separately rewriting shared appearance.',`,
'AGE-LINKED APPEARANCE EVOLUTION: after every valid birthday',
'full scanner age progression rules');

scanner = rep(scanner,
`ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence that states the new age' }, apparentAge: '~N only, e.g. ~25, or empty',`,
`ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence that states the new age' }, ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: 'why this maturation behavior applies', evidence: 'grounded accepted age-transition evidence', affectsShared: false, affectedForms: [] }, apparentAge: '~N only, e.g. ~25, or empty',`,
'full scanner age progression contract');
scanner = rep(scanner,
`appearanceFormChanges: [{ name: 'existing form explicitly corrected/changed', appearance: 'replacement canonical appearance', evidence: 'explicit current-exchange correction/growth/change evidence' }],`,
`appearanceFormChanges: [{ name: 'existing form explicitly corrected/changed', appearance: 'replacement canonical appearance', mode: 'change|age_progression', evidence: 'explicit correction/growth/change or accepted age-transition evidence' }],`,
'full scanner form mode contract');
scanner = rep(scanner,
`canonChanges: [{ field: 'appearance|species|background|role', mode: 'refine|change|correction|revelation', value: 'replacement durable canon', evidence: 'grounded evidence for this durable scalar revision' }],`,
`canonChanges: [{ field: 'appearance|species|background|role', mode: 'refine|change|correction|revelation|age_progression', value: 'replacement durable canon', evidence: 'grounded evidence for this durable scalar revision' }],`,
'full scanner canon mode contract');

const importAgeRule = `        '- Existing actual Age remains sticky; use ageChange only when the structured source explicitly establishes a correction/birthday/elapsed-time result with the resulting numeric age.',`;
scanner = addAfter(scanner, importAgeRule,
`\n        '- If the structured source establishes an accepted birthday/elapsed transition, reconsider visual maturation with ageProgression under the same conservative rules. correction is bookkeeping only and never matures the body. Unknown maturation stays visually unchanged; do not infer human aging for an unknown fantasy species. Use age_progression only when the source transition and established maturation behavior make the interval visually meaningful.',`,
'If the structured source establishes an accepted birthday/elapsed transition',
'structured import progression rules');
scanner = rep(scanner,
`id: npc.id, name: npc.name, aliases: null, role: '', species: '', age: '', ageChange: null, apparentAge: '',`,
`id: npc.id, name: npc.name, aliases: null, role: '', species: '', age: '', ageChange: null, ageProgression: null, apparentAge: '',`,
'structured import progression contract');

const refreshAgeRule = `        'ageChange is the only automatic revision channel for an established chronological age: {age, kind birthday|elapsed|correction, evidence}. Evidence must explicitly state the new age and the birthday/elapsed/correction basis. Casual contradictions and appearance guesses are not revisions.',`;
scanner = addAfter(scanner, refreshAgeRule,
`\n        'AGE-LINKED APPEARANCE EVOLUTION: after a valid birthday/elapsed ageChange, reconsider apparentAge and age-sensitive appearance with ageProgression. Use established species/setting lore/known maturation behavior; unknown fantasy species are conservative, long-lived races mature slowly, accelerated-growth species may mature faster, and ageless beings remain visually unchanged unless explicit canon says otherwise. correction does not mature the body, and insignificant intervals may correctly produce no visual update. Use canonChanges/appearanceFormChanges mode age_progression only for the shared or named forms actually affected, preserving unrelated traits. Minor maturation descriptions stay neutral and non-sexual.',`,
'AGE-LINKED APPEARANCE EVOLUTION: after a valid birthday/elapsed ageChange',
'targeted refresh progression rules');
scanner = rep(scanner,
`ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence' }, apparentAge: '~N only or empty',`,
`ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence' }, ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: '', evidence: '', affectsShared: false, affectedForms: [] }, apparentAge: '~N only or empty',`,
'targeted refresh progression contract');
write('v03/scanner.js', scanner);

let injection = read('v03/injection.js');
const foregroundAgeRule = `        'ageChange is the only channel allowed to revise an established chronological age. Use {age, kind: birthday|elapsed|correction, evidence}. birthday requires explicit birthday/turned-N evidence; elapsed requires explicit passage of time AND narration stating the resulting age; correction requires an explicit correction/mistake statement. Evidence must state the new numeric age. Casual contradictory age prose, appearance guesses, and unstated arithmetic must leave ageChange empty.',`;
injection = addAfter(injection, foregroundAgeRule,
`\n        'AGE-LINKED APPEARANCE EVOLUTION: whenever you propose a valid birthday or elapsed ageChange, reconsider apparentAge and age-sensitive appearance in the SAME observation. Use ageProgression {maturation: ordinary|accelerated|long_lived|ageless|unknown, meaningful, basis, evidence, affectsShared, affectedForms}. Infer maturation behavior only from established species, setting lore, existing apparent age, or known biology; unknown fantasy species stay conservative. correction never matures the body. Do not invent a rewrite for every adult birthday. Long-lived races normally need larger intervals, ageless beings stay visually unchanged, and accelerated-growth species may change faster. It is valid to emit no visual changes. Minor maturation wording must remain neutral and non-sexual.',\n        'AGE-PROGRESSION CHANNELS: use canonChanges mode age_progression only for age-sensitive shared/ordinary appearance and appearanceFormChanges mode age_progression only for existing forms named in ageProgression.affectedForms. Preserve hair/eye colors, scars, species markers, magical traits, horn/wing/tail structure, and unrelated anatomy. If appearance still duplicates Base, revise Base and let NPC State synchronize the compatibility scalar. Never replace unrelated forms.',`,
'AGE-LINKED APPEARANCE EVOLUTION: whenever you propose a valid birthday',
'foreground progression rules');
injection = rep(injection,
`\"ageChange\":{\"age\":\"new actual chronological age\",\"kind\":\"birthday|elapsed|correction\",\"evidence\":\"explicit grounded age-change evidence stating new age\"},\"apparentAge\":`,
`\"ageChange\":{\"age\":\"new actual chronological age\",\"kind\":\"birthday|elapsed|correction\",\"evidence\":\"explicit grounded age-change evidence stating new age\"},\"ageProgression\":{\"maturation\":\"ordinary|accelerated|long_lived|ageless|unknown\",\"meaningful\":false,\"basis\":\"\",\"evidence\":\"\",\"affectsShared\":false,\"affectedForms\":[]},\"apparentAge\":`,
'foreground progression contract');
injection = rep(injection,
`\"appearanceFormChanges\":[{\"name\":\"existing form explicitly changed\",\"appearance\":\"replacement canonical form appearance\",\"evidence\":\"explicit correction/growth/change evidence\"}]`,
`\"appearanceFormChanges\":[{\"name\":\"existing form explicitly changed\",\"appearance\":\"replacement canonical form appearance\",\"mode\":\"change|age_progression\",\"evidence\":\"explicit correction/growth/change or accepted age-transition evidence\"}]`,
'foreground form mode contract');
injection = rep(injection,
`\"canonChanges\":[{\"field\":\"appearance|species|background|role\",\"mode\":\"refine|change|correction|revelation\",`,
`\"canonChanges\":[{\"field\":\"appearance|species|background|role\",\"mode\":\"refine|change|correction|revelation|age_progression\",`,
'foreground canon mode contract');
write('v03/injection.js', injection);

let readme = read('README.md');
if (!readme.includes('## Form-aware current appearance and age-linked maturation')) {
    const marker = '\n## Testing beside stable NPC State';
    if (!readme.includes(marker)) throw new Error('Missing README testing marker');
    const section = `\n## Form-aware current appearance and age-linked maturation\n\n- \`appearance\` stores shared/common appearance, or ordinary appearance for a single-form NPC. \`appearanceForms\` stores durable named body forms and \`currentForm\` selects the active body. One shared resolver supplies **Current appearance** to dossiers, portrait prompts, and foreground continuity.\n- Legacy dossiers that copied ordinary \`appearance\` into \`appearanceForms.Base\` stay synchronized while those values are still duplicates. Once \`appearance\` becomes genuine cross-form shared canon, Base and shared appearance evolve independently.\n- A valid birthday or elapsed-time \`ageChange\` now asks the scanner to reconsider visual maturation in the same observation. Age parsing, normalization, units, storage, and existing age-continuity rules are unchanged. Corrections and manual age edits never fabricate maturation.\n- Maturation is conservative and lore-aware rather than species-name hard-coded: ordinary, accelerated, long-lived, ageless, or unknown. Unknown fantasy species do not silently inherit human aging. Insignificant adult birthdays, long-lived intervals, and ageless beings may correctly produce no visible change.\n- Age-linked revisions reuse \`apparentAge\`, \`canonChanges\` mode \`age_progression\`, and \`appearanceFormChanges\` mode \`age_progression\`. The backend requires an accepted forward age transition, a visually meaningful interval, the correct shared/form channel, and preservation of unrelated canonical traits.\n`;
    readme = readme.replace(marker, section + marker);
}
write('README.md', readme);

let changelog = read('CHANGELOG.md');
if (!changelog.includes('Appearance/maturation hardening synchronizes legacy Base-compatible appearance')) {
    const marker = '## v0.4.3\n';
    if (!changelog.includes(marker)) throw new Error('Missing changelog marker');
    const line = '\n- Appearance/maturation hardening synchronizes legacy Base-compatible appearance, resolves current appearance consistently across dossier/injection/portrait surfaces, allows grounded shared appearance updates for form-aware NPCs, and adds conservative age-linked visual evolution after accepted birthday/elapsed age transitions without changing age normalization or age-continuity rules. Corrections/manual age edits do not mature appearance; long-lived, ageless, and unknown maturation stays conservative; accelerated growth is supported; unrelated canonical traits and manual locks remain protected.\n';
    changelog = changelog.replace(marker, marker + line);
}
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.3 phase 8C age-progression prompt and documentation contracts');
