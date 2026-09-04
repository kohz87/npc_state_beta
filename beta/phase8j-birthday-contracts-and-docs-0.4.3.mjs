import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function patch(path, edits) {
    let source = read(path);
    for (const [from, to, label] of edits) {
        if (!source.includes(from)) throw new Error(`Missing phase 8J marker in ${path}: ${label}`);
        source = source.replace(from, to);
    }
    write(path, source);
}

patch('v03/scanner.js', [[
`            aliases: [], role: '', species: '', age: 'initial actual chronological numeric age only, or same-value refinement; use ageChange for an established age changing', ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence that states the new age' }, ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: 'why this maturation behavior applies', evidence: 'grounded accepted age-transition evidence', affectsShared: false, affectedForms: [] }, apparentAge: '~N only, e.g. ~25, or empty', appearance:`,
`            aliases: [], role: '', species: '', age: 'initial actual chronological numeric age only, or same-value refinement; use ageChange for an established age changing', ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence that states the new age' }, ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: 'why this maturation behavior applies', evidence: 'grounded accepted age-transition evidence', affectsShared: false, affectedForms: [] }, apparentAge: '~N only, e.g. ~25, or empty', birthday: 'explicit compact freeform calendar birthday or empty; never infer from age', appearance:`,
'full scan birthday contract'],[
`canonChanges: [{ field: 'appearance|species|background|role', mode: 'refine|change|correction|revelation|age_progression',`,
`canonChanges: [{ field: 'appearance|species|background|role|birthday', mode: 'refine|change|correction|revelation|age_progression',`,
'full canon change field'],[
`        '- ageChange is the only automatic channel allowed to change an already-established chronological age. kind birthday requires explicit birthday/turned-N evidence; elapsed requires explicit elapsed-time narration that also states the resulting age; correction requires explicit correction/mistake evidence that states the corrected age. The evidence must contain the new numeric age. Casual contradictory age prose, appearance-based guesses, and unstated arithmetic are rejected by the backend. Leave ageChange null/omit when no authoritative chronological change occurred.',`,
`        '- ageChange is the only automatic channel allowed to change an already-established chronological age. kind birthday requires explicit birthday/turned-N evidence; elapsed requires explicit elapsed-time narration that also states the resulting age; correction requires explicit correction/mistake evidence that states the corrected age. The evidence must contain the new numeric age. Casual contradictory age prose, appearance-based guesses, and unstated arithmetic are rejected by the backend. Leave ageChange null/omit when no authoritative chronological change occurred.',
        '- birthday is OPTIONAL passive continuity metadata, separate from age and apparentAge. Preserve compact freeform values exactly, including fantasy calendars such as 14 Frostwane. Never infer birthday from age, calculate age from birthday, or automatically increment age when a stored birthday date passes. For a new NPC or an existing blank/generated-placeholder birthday, return birthday only when the supplied evidence explicitly establishes it. An established explicit/manual birthday is sticky; revise it only with canonChanges field birthday mode correction and grounded correction evidence. A birthday value by itself never authorizes ageProgression.',`,
'full birthday semantic rule'],[
`        '- DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, and Role are sticky.`,
`        '- DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, Role, and Birthday are sticky.`,
'full durable birthday'],[
`        'aliases', 'role', 'species', 'age', 'ageChange', 'ageProgression', 'apparentAge', 'appearance', 'appearanceForms', 'appearanceFormChanges',`,
`        'aliases', 'role', 'species', 'age', 'ageChange', 'ageProgression', 'apparentAge', 'birthday', 'appearance', 'appearanceForms', 'appearanceFormChanges',`,
'structured sanitizer birthday'],[
`        '- Import durable identity/profile facts only: aliases, role, species, actual/apparent age, appearance/forms, personality, behavior, speech, mannerisms, background, non-player Key Relationships, and durable Important Memories.',`,
`        '- Import durable identity/profile facts only: aliases, role, species, actual/apparent age, birthday, appearance/forms, personality, behavior, speech, mannerisms, background, non-player Key Relationships, and durable Important Memories.',`,
'structured birthday authority'],[
`        '- Preserve established canon when the blocks merely phrase it differently. For a real correction/revelation/revision of established Appearance/Species/Background/Role, return canonChanges with concrete evidence quoted/paraphrased from the source block.',`,
`        '- Preserve established canon when the blocks merely phrase it differently. Birthday is passive freeform calendar text and must never be inferred from age; an explicit source birthday may seed a blank/generated placeholder, while an established explicit/manual birthday changes only through canonChanges field birthday mode correction. For a real correction/revelation/revision of established Appearance/Species/Background/Role/Birthday, return canonChanges with concrete evidence quoted/paraphrased from the source block.',`,
'structured birthday correction'],[
`                id: npc.id, name: npc.name, aliases: null, role: '', species: '', age: '', ageChange: null, ageProgression: null, apparentAge: '',
                appearance:`,
`                id: npc.id, name: npc.name, aliases: null, role: '', species: '', age: '', ageChange: null, ageProgression: null, apparentAge: '', birthday: '',
                appearance:`,
'structured output birthday'],[
`        'ageChange is the only automatic revision channel for an established chronological age: {age, kind birthday|elapsed|correction, evidence}. Evidence must explicitly state the new age and the birthday/elapsed/correction basis. Casual contradictions and appearance guesses are not revisions.',`,
`        'ageChange is the only automatic revision channel for an established chronological age: {age, kind birthday|elapsed|correction, evidence}. Evidence must explicitly state the new age and the birthday/elapsed/correction basis. Casual contradictions and appearance guesses are not revisions.',
        'birthday is passive freeform calendar continuity metadata. Never infer it from age or calculate age from it. Explicit chat evidence may seed a blank/generated placeholder; an established explicit/manual value changes only through canonChanges field birthday mode correction. Birthday metadata alone never triggers ageChange or ageProgression.',`,
'targeted birthday semantic rule'],[
`        'DURABLE SCALAR CANON: preserve established ordinary Appearance, Species, Background, and Role unless this window supports an authorized canonChanges revision.`,
`        'DURABLE SCALAR CANON: preserve established ordinary Appearance, Species, Background, Role, and Birthday unless this window supports an authorized canonChanges revision.`,
'targeted durable birthday'],[
`ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: '', evidence: '', affectsShared: false, affectedForms: [] }, apparentAge: '~N only or empty', appearance:`,
`ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: '', evidence: '', affectsShared: false, affectedForms: [] }, apparentAge: '~N only or empty', birthday: 'explicit freeform birthday or empty', appearance:`,
'targeted output birthday']]);

patch('v03/injection.js', [[
`\"ageProgression\":{\"maturation\":\"ordinary|accelerated|long_lived|ageless|unknown\",\"meaningful\":false,\"basis\":\"\",\"evidence\":\"\",\"affectsShared\":false,\"affectedForms\":[]},\"apparentAge\":\"~N or empty\",\"appearance\":`,
`\"ageProgression\":{\"maturation\":\"ordinary|accelerated|long_lived|ageless|unknown\",\"meaningful\":false,\"basis\":\"\",\"evidence\":\"\",\"affectsShared\":false,\"affectedForms\":[]},\"apparentAge\":\"~N or empty\",\"birthday\":\"explicit compact freeform calendar birthday or empty\",\"appearance\":`,
'foreground output birthday'],[
`\"canonChanges\":[{\"field\":\"appearance|species|background|role\",`,
`\"canonChanges\":[{\"field\":\"appearance|species|background|role|birthday\",`,
'foreground canon birthday'],[
`        'DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, and Role are sticky.`,
`        'DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, Role, and Birthday are sticky.`,
'foreground durable birthday']]);

let readme = read('README.md');
const readmeMarker = `## Testing beside stable NPC State`;
if (!readme.includes(readmeMarker)) throw new Error('Missing README birthday insertion marker');
const birthdaySection = `## Passive birthday continuity\n\n- Dossiers may store an optional freeform \`birthday\` such as \`14 Frostwane\`, \`March 12\`, or \`Unknown\`. It is continuity metadata only: NPC State never derives it from age, derives age from it, watches the calendar, increments age when it passes, or lets it trigger maturation without an independently accepted birthday/elapsed age transition in narration.\n- Grounded story canon may establish a blank birthday. Explicit/manual birthdays are durable scalar canon; later correction requires evidence-backed \`canonChanges\` with \`field: "birthday"\` and \`mode: "correction"\`. Manual stable-profile locks include Birthday.\n- **Birthday fill** is optional and defaults Off. \`Unknown\` fills blank participating dossiers with \`Unknown\`; \`Random\` assigns one deterministic stable date from the configured calendar. The default calendar is an editable Gregorian month pool, and fantasy calendars can replace it line-by-line as \`Frostwane:30\`, \`Rainmoot:28\`, etc. Lines without \`:days\` use the configurable fallback month length.\n- Generated birthdays are tagged internally as generated placeholders. They remain stable for continuity but yield to a later explicitly grounded birthday. A local **Fill missing birthdays** action can populate existing blank dossiers without an LLM call. Generated or manually entered birthday metadata never changes chronological age by itself.\n\n`;
readme = readme.replace(readmeMarker, birthdaySection + readmeMarker);
write('README.md', readme);

let changelog = read('CHANGELOG.md');
const heading = `## v0.4.3\n`;
const bullet = `\n- Adds optional passive Birthday continuity metadata with durable evidence-backed correction, manual locking/editing, scanner/injection/dossier/structured-import support, and fantasy-calendar-safe freeform storage. Optional Off/Unknown/Random fill can populate missing birthdays locally; Random uses a configurable month/day pool and stable generated provenance so later explicit canon supersedes placeholders. Birthday metadata never derives from age, advances age, tracks calendar dates, or independently authorizes age-linked appearance evolution.\n`;
if (!changelog.includes(heading)) throw new Error('Missing v0.4.3 changelog heading');
if (!changelog.includes(bullet.trim())) changelog = changelog.replace(heading, heading + bullet);
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.3 birthday scanner contracts and documentation');
