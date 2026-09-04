import fs from 'node:fs';

function replaceRequired(path, from, to, label) {
    let source = fs.readFileSync(path, 'utf8');
    if (!source.includes(from)) throw new Error(`Missing phase 8M marker in ${path}: ${label}`);
    source = source.replace(from, to);
    fs.writeFileSync(path, source);
}

replaceRequired(
    'v03/injection.js',
    "        field('Birthday', npc.birthday ? npc.birthday + (npc.birthdayProvenance === 'generated' ? ' [generated placeholder]' : '') : ''),",
    "        field('Birthday', npc.birthday),",
    'foreground birthday display',
);

replaceRequired(
    'v03/injection.js',
    'A [generated placeholder] may be replaced when the current exchange explicitly establishes the real birthday.',
    'If the current exchange explicitly establishes a birthday that differs from the stored Birthday, return the explicit current value; backend provenance/correction rules decide whether replacement is authorized.',
    'foreground generated-birthday instruction',
);

replaceRequired(
    'v03/dossier-view.js',
    "        npc.birthday ? `Birthday ${npc.birthday}${npc.birthdayProvenance === 'generated' ? ' · generated placeholder' : ''}` : '',",
    "        npc.birthday ? `Birthday ${npc.birthday}` : '',",
    'dossier identity birthday',
);

replaceRequired(
    'v03/dossier-view.js',
    "            ${currentFact('Birthday', npc.birthday ? npc.birthday + (npc.birthdayProvenance === 'generated' ? ' · generated placeholder' : '') : '')}",
    "            ${currentFact('Birthday', npc.birthday)}",
    'dossier birthday card',
);

for (const [from, to, label] of [
    ['blank/generated-placeholder birthday', 'blank/generated birthday', 'full scanner generated birthday wording'],
    ['blank/generated placeholder', 'blank/generated birthday', 'scanner generated birthday wording'],
]) {
    let source = fs.readFileSync('v03/scanner.js', 'utf8');
    if (!source.includes(from)) throw new Error(`Missing phase 8M marker in v03/scanner.js: ${label}`);
    source = source.split(from).join(to);
    fs.writeFileSync('v03/scanner.js', source);
}

replaceRequired(
    'README.md',
    'Generated birthdays are tagged internally as generated placeholders. They remain stable for continuity but yield to a later explicitly grounded birthday.',
    'Generated birthdays keep internal generated provenance. They remain stable for continuity but yield to a later explicitly grounded birthday; no provenance label is shown in the dossier or foreground continuity text.',
    'README generated birthday wording',
);

replaceRequired(
    'CHANGELOG.md',
    'stable generated provenance so later explicit canon supersedes placeholders.',
    'stable internal generated provenance so later explicit canon supersedes generated values without displaying provenance labels.',
    'changelog generated birthday wording',
);

console.log('Hidden generated birthday provenance labels while preserving backend provenance');
