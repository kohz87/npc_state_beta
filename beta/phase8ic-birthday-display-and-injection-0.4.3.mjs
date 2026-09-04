import fs from 'node:fs';

function patch(path, edits) {
    let source = fs.readFileSync(path, 'utf8');
    for (const [from, to, label] of edits) {
        if (!source.includes(from)) throw new Error(`Missing phase 8IC marker in ${path}: ${label}`);
        source = source.replace(from, to);
    }
    fs.writeFileSync(path, source);
}

patch('v03/injection.js', [[
`        field('Species', npc.species), field('Actual age', npc.age), field('Apparent age', npc.apparentAge),
        field('Current form', npc.currentForm),`,
`        field('Species', npc.species), field('Actual age', npc.age), field('Apparent age', npc.apparentAge),
        field('Birthday', npc.birthday ? npc.birthday + (npc.birthdayProvenance === 'generated' ? ' [generated placeholder]' : '') : ''),
        field('Current form', npc.currentForm),`,
'continuity birthday'],[
`        'ageChange is the only channel allowed to revise an established chronological age. Use {age, kind: birthday|elapsed|correction, evidence}. birthday requires explicit birthday/turned-N evidence; elapsed requires explicit passage of time AND narration stating the resulting age; correction requires an explicit correction/mistake statement. Evidence must state the new numeric age. Casual contradictory age prose, appearance guesses, and unstated arithmetic must leave ageChange empty.',`,
`        'ageChange is the only channel allowed to revise an established chronological age. Use {age, kind: birthday|elapsed|correction, evidence}. birthday requires explicit birthday/turned-N evidence; elapsed requires explicit passage of time AND narration stating the resulting age; correction requires an explicit correction/mistake statement. Evidence must state the new numeric age. Casual contradictory age prose, appearance guesses, and unstated arithmetic must leave ageChange empty.',
        'birthday is separate passive continuity metadata. Preserve compact freeform calendar text exactly, including fantasy calendars such as 14 Frostwane. Never infer birthday from age, calculate age from birthday, or treat a stored/generated birthday as proof that a birthday happened now. For an established explicit/manual birthday, use canonChanges field birthday mode correction only when the current exchange explicitly corrects it. A [generated placeholder] may be replaced when the current exchange explicitly establishes the real birthday.',`,
'foreground birthday rule']]);

patch('v03/dossier-view.js', [[
"        npc.apparentAge ? `Looks ${npc.apparentAge}` : '',\n    ].filter(Boolean).join(' · ');",
"        npc.apparentAge ? `Looks ${npc.apparentAge}` : '',\n        npc.birthday ? `Birthday ${npc.birthday}${npc.birthdayProvenance === 'generated' ? ' · generated placeholder' : ''}` : '',\n    ].filter(Boolean).join(' · ');",
'dossier identity birthday']]);

console.log('Added NPC State 0.4.3 birthday dossier and foreground continuity display');
