import fs from 'node:fs';

function replaceRequired(path, from, to, label) {
    let source = fs.readFileSync(path, 'utf8');
    if (!source.includes(from)) throw new Error(`Missing 0.4.5 appearance presentation marker in ${path}: ${label}`);
    source = source.replace(from, to);
    fs.writeFileSync(path, source);
}

replaceRequired(
    'v03/injection.js',
    "        field('Current form', npc.currentForm), field('Current appearance', resolvedCurrentAppearance(npc)),\n        field('Shared / ordinary appearance', npc.appearance), field('Known physical forms', appearanceFormsText(npc)),",
    "        field('Current appearance', resolvedCurrentAppearance(npc)),\n        field('Appearance forms', appearanceFormsText(npc)),",
    'foreground continuity appearance fields',
);

replaceRequired(
    'v03/dossier-view.js',
    "            ${npc.currentForm ? currentFact('Current form', npc.currentForm) : ''}\n            ${currentFact('Current appearance', resolvedCurrentAppearance(npc))}",
    "            ${currentFact('Current appearance', resolvedCurrentAppearance(npc))}",
    'dossier current appearance cards',
);

replaceRequired(
    'v03/dossier-view.js',
    "            ${block('Shared / ordinary appearance', paragraphHtml(npc.appearance))}\n            ${(npc.appearanceForms || []).length ? block('Appearance forms', appearanceFormsHtml(npc), 'npc-state-v3-block-wide') : ''}",
    "            ${(npc.appearanceForms || []).length ? block('Appearance forms', appearanceFormsHtml(npc), 'npc-state-v3-block-wide') : ''}",
    'dossier profile appearance blocks',
);

let readme = fs.readFileSync('README.md', 'utf8');
if (!readme.includes('## Compact appearance presentation')) {
    const marker = '\n## Testing beside stable NPC State\n';
    if (!readme.includes(marker)) throw new Error('Missing README testing marker');
    readme = readme.replace(marker, `\n## Compact appearance presentation\n\n- The normal dossier and foreground continuity now expose only two reader-facing appearance surfaces: **Current appearance**, resolved from the stored shared/common traits plus the active form, and **Appearance forms**, the complete named form registry with the active entry marked current.\n- Standalone **Current form** and **Shared / ordinary appearance** lines are intentionally hidden from normal reading/injection because they duplicate information already represented by those two surfaces. The underlying fields remain stored and manually editable, and continue to drive form switching, legacy Base synchronization, age-linked maturation, portraits, scanner validation, and branch-safe continuity.\n${marker}`);
}
fs.writeFileSync('README.md', readme);

console.log('Applied NPC State 0.4.5 compact two-surface appearance presentation');
