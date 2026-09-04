import fs from 'node:fs';

function patch(path, edits) {
    let source = fs.readFileSync(path, 'utf8');
    for (const [from, to, label] of edits) {
        if (!source.includes(from)) throw new Error(`Missing phase 8K marker in ${path}: ${label}`);
        source = source.replace(from, to);
    }
    fs.writeFileSync(path, source);
}

patch('v03/scanner.js', [[
`    if (field === 'birthday') {
        return mode === 'correction' && CANON_CORRECTION_CUES.test(evidence + ' ' + context);
    }`,
`    if (field === 'birthday') {
        return mode === 'correction'
            && birthdayEvidenceGrounded(incoming, context)
            && CANON_CORRECTION_CUES.test(evidence + ' ' + context);
    }`,
'birthday-specific correction grounding']]);

patch('v03/dossier-view.js', [[
`          <div class="npc-state-v3-current-grid">
            ${currentFact('Mood', npc.mood)}`,
`          <div class="npc-state-v3-current-grid">
            ${currentFact('Actual age', npc.age)}
            ${currentFact('Apparent age', npc.apparentAge)}
            ${currentFact('Birthday', npc.birthday ? npc.birthday + (npc.birthdayProvenance === 'generated' ? ' · generated placeholder' : '') : '')}
            ${currentFact('Mood', npc.mood)}`,
'separate age and birthday cards']]);

console.log('Applied NPC State 0.4.3 birthday hard-pass grounding and display');
