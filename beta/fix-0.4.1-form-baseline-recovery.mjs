import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing baseline-form recovery marker: ' + label);
    return source.replace(from, to);
}

let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "    if (!locked.has('appearanceForms')) {\n        const incomingForms = normalizeAppearanceForms(patch?.appearanceForms);\n        // A pre-existing single-form dossier already has canonical baseline appearance.\n        // The first time alternate forms arrive, preserve that body as Base before merging\n        // the newly observed forms. New NPCs are not guessed here; their scanner payload\n        // must explicitly describe every grounded form it observed.\n        if (!normalizeAppearanceForms(next.appearanceForms).length && incomingForms.length && String(npc.appearance || '').trim()) {\n            next.appearanceForms = [{ name: 'Base', appearance: String(npc.appearance).trim() }];\n        }\n        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, patch?.appearanceFormChanges);\n    }",
    "    if (!locked.has('appearanceForms')) {\n        const incomingForms = normalizeAppearanceForms(patch?.appearanceForms);\n        const existingForms = normalizeAppearanceForms(next.appearanceForms);\n        const hasBase = existingForms.some(form => normalizeName(form.name) === 'base');\n        const wantsBase = normalizeName(patch?.currentForm) === 'base';\n        const firstAlternate = !existingForms.length && incomingForms.length > 0;\n        // Preserve the legacy ordinary body as Base when alternates first appear. Also\n        // repair an already-half-migrated dossier on rescan: if an older scan captured\n        // only Beast/another alternate but the new scan explicitly says the NPC ended\n        // back in Base, recover Base from the pre-existing canonical appearance.\n        if (!hasBase && (firstAlternate || wantsBase) && String(npc.appearance || '').trim()) {\n            next.appearanceForms = [...existingForms, { name: 'Base', appearance: String(npc.appearance).trim() }];\n        }\n        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, patch?.appearanceFormChanges);\n    }",
    'baseline form recovery apply logic',
);
scanner = replaceRequired(
    scanner,
    "        '- appearanceForms stores durable canonical descriptions of distinct transformed body states. Durable means the DESCRIPTION becomes continuity canon once observed; the transformation itself does NOT need to be permanent. Capture every distinct form state explicitly shown in the CURRENT exchange, including a partial/hybrid manifestation and a later full beast body when they are separately entered. For an unnamed transformed state, use a concise descriptive morphology label such as Partial manifestation rather than inventing lore taxonomy like Demihuman unless the story establishes that term. For a NEW multi-form NPC, return every grounded form established by the current exchange, including its baseline form when that baseline is actually described. For an EXISTING NPC, appearanceForms must contain only genuinely NEW forms not already present in EXISTING DOSSIERS; never resend an existing form with a newly guessed description.',",
    "        '- appearanceForms stores durable canonical descriptions of distinct transformed body states. Durable means the DESCRIPTION becomes continuity canon once observed; the transformation itself does NOT need to be permanent. Capture every distinct form state explicitly shown in the CURRENT exchange, including a partial/hybrid manifestation and a later full beast body when they are separately entered. For an unnamed transformed state, use a concise descriptive morphology label such as Partial manifestation rather than inventing lore taxonomy like Demihuman unless the story establishes that term. For a NEW multi-form NPC, return every grounded form established by the current exchange, including its baseline form when that baseline is actually described. For an EXISTING NPC, appearanceForms must contain only genuinely NEW forms not already present in EXISTING DOSSIERS; never resend an existing form with a newly guessed description. RECOVERY: if an older scan already captured an alternate form but no Base entry, and this exchange explicitly ends with the NPC back in the ordinary body represented by stored appearance, set currentForm to Base; NPC State will recover that stored appearance into Base locally.',",
    'full scanner baseline recovery instruction',
);
scanner = replaceRequired(
    scanner,
    "        'appearanceForms contains only newly established distinct transformed body states. Capture multiple distinct states from the same scene when they are separately entered, including partial manifestation and full beast states. Durable refers to continuity of the stored description, not permanence of the transformation. Preserve every existing form shown in TARGET DOSSIER. Never rewrite a stored form from a casual contradictory description.',",
    "        'appearanceForms contains only newly established distinct transformed body states. Capture multiple distinct states from the same scene when they are separately entered, including partial manifestation and full beast states. Durable refers to continuity of the stored description, not permanence of the transformation. Preserve every existing form shown in TARGET DOSSIER. Never rewrite a stored form from a casual contradictory description. If TARGET DOSSIER has alternate forms but no Base and the chat explicitly ends with the NPC back in its stored ordinary appearance, set currentForm to Base so NPC State can recover that baseline locally.',",
    'targeted refresh baseline recovery instruction',
);
write('v03/scanner.js', scanner);

let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'appearanceForms is durable form-specific canon. Durable means the stored DESCRIPTION remains canonical; the transformation itself may be temporary or reversible. Capture EVERY distinct form state explicitly entered in this response, including both a partial/hybrid manifestation and a later full beast body when both occur. For unnamed transformed states use a concise descriptive morphology label such as Partial manifestation rather than inventing lore taxonomy. For a NEW multi-form NPC include every grounded form, including its baseline form when actually described. For an EXISTING NPC return only genuinely NEW forms; NPC State locally preserves its pre-existing ordinary appearance as Base when the first alternate form arrives. Never rewrite a known form from casual contradictory prose. Existing form dimensions/anatomy/colors/proportions are sticky.',",
    "        'appearanceForms is durable form-specific canon. Durable means the stored DESCRIPTION remains canonical; the transformation itself may be temporary or reversible. Capture EVERY distinct form state explicitly entered in this response, including both a partial/hybrid manifestation and a later full beast body when both occur. For unnamed transformed states use a concise descriptive morphology label such as Partial manifestation rather than inventing lore taxonomy. For a NEW multi-form NPC include every grounded form, including its baseline form when actually described. For an EXISTING NPC return only genuinely NEW forms; NPC State locally preserves its pre-existing ordinary appearance as Base when the first alternate form arrives. If an older scan already captured an alternate but no Base and this response ends back in the stored ordinary body, set currentForm to Base so the baseline can be recovered locally. Never rewrite a known form from casual contradictory prose. Existing form dimensions/anatomy/colors/proportions are sticky.',",
    'foreground baseline recovery instruction',
);
write('v03/injection.js', injection);

let changelog = read('CHANGELOG.md');
const line = '- Baseline form recovery: rescanning a previously half-captured multi-form NPC can recover the legacy ordinary appearance as Base when the exchange explicitly ends back in that body, even if an alternate form such as Beast was already stored by an older scan.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line + '\n', 'changelog heading');
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.1 baseline form recovery');
