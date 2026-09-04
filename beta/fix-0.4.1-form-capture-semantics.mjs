import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing form-capture marker: ' + label);
    return source.replace(from, to);
}

// 1) Broaden form semantics without weakening the distinction between a real transformed
// body state and incidental visual effects. Also preserve an existing legacy appearance
// as a neutral Base form when an established NPC first reveals alternate forms.
let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "        '- appearance remains the shared/common physical description, or the ordinary appearance for an NPC with no distinct transforming forms. Do not rewrite appearance merely because a multi-form NPC changed form.',",
    "        '- appearance remains the shared/common physical description, or the ordinary baseline appearance for an NPC with no distinct transforming forms. Do not rewrite appearance merely because a multi-form NPC changed form. For an EXISTING NPC that already has ordinary appearance but no appearanceForms, that stored appearance represents the baseline body; when the first alternate form is discovered NPC State preserves it locally as a neutral Base form.',",
    'full scanner baseline appearance semantics',
);
scanner = replaceRequired(
    scanner,
    "        '- currentForm is live physical-form state only, such as Human, Demihuman, or Beast. Leave it empty for ordinary non-transforming NPCs. A temporary outfit, pose, disguise, mood, or condition is not a physical form.',",
    "        '- currentForm is live physical-form state only, such as Human, Demihuman, Beast, Partial manifestation, or another grounded freeform label. Leave it empty for ordinary non-transforming NPCs. A physical form MAY be temporary, reversible, magical, elemental, spectral, or energy-made when the NPC enters a coherent transformed body state that materially changes anatomy, body plan, or silhouette. Partial transformations count when they add form-defining anatomy such as horns, wings, tails, scales, feathers, claws, or a changed body shape, even when those parts are ethereal or made of energy. Mere aura, glow, weather effect, spell particles, outfit, pose, disguise, mood, or injury is not a form. If an EXISTING NPC first reveals alternate forms in this exchange and ends back in the ordinary body represented by its stored appearance, use currentForm Base.',",
    'full scanner reversible and partial form semantics',
);
scanner = replaceRequired(
    scanner,
    "        '- appearanceForms stores durable canonical descriptions of distinct physical forms. For a NEW multi-form NPC, return every grounded form established by the current exchange. For an EXISTING NPC, appearanceForms must contain only genuinely NEW forms not already present in EXISTING DOSSIERS; never resend an existing form with a newly guessed description.',",
    "        '- appearanceForms stores durable canonical descriptions of distinct transformed body states. Durable means the DESCRIPTION becomes continuity canon once observed; the transformation itself does NOT need to be permanent. Capture every distinct form state explicitly shown in the CURRENT exchange, including a partial/hybrid manifestation and a later full beast body when they are separately entered. For an unnamed transformed state, use a concise descriptive morphology label such as Partial manifestation rather than inventing lore taxonomy like Demihuman unless the story establishes that term. For a NEW multi-form NPC, return every grounded form established by the current exchange, including its baseline form when that baseline is actually described. For an EXISTING NPC, appearanceForms must contain only genuinely NEW forms not already present in EXISTING DOSSIERS; never resend an existing form with a newly guessed description.',",
    'full scanner multi-stage form capture semantics',
);
scanner = replaceRequired(
    scanner,
    "        'appearance is shared/common physical description, or ordinary single-form appearance. currentForm is live physical-form state only and should stay empty for a non-transforming NPC.',",
    "        'appearance is shared/common physical description, or the ordinary baseline appearance. currentForm is live physical-form state only and should stay empty for a non-transforming NPC. A form may be temporary, reversible, magical, spectral, elemental, or energy-made if it is a coherent transformed body state with materially different anatomy/body plan/silhouette. Partial transformations with manifested horns, wings, tails, scales, feathers, claws, or other form-defining anatomy count; mere aura/glow/spell particles/outfit/pose/injury do not. If this existing NPC first reveals alternate forms and ends back in its stored ordinary body, use currentForm Base.',",
    'targeted refresh reversible form semantics',
);
scanner = replaceRequired(
    scanner,
    "        'appearanceForms contains only newly established distinct physical forms. Preserve every existing form shown in TARGET DOSSIER. Never rewrite a stored form from a casual contradictory description.',",
    "        'appearanceForms contains only newly established distinct transformed body states. Capture multiple distinct states from the same scene when they are separately entered, including partial manifestation and full beast states. Durable refers to continuity of the stored description, not permanence of the transformation. Preserve every existing form shown in TARGET DOSSIER. Never rewrite a stored form from a casual contradictory description.',",
    'targeted refresh multi-stage form capture',
);
scanner = replaceRequired(
    scanner,
    "    if (!locked.has('appearanceForms')) {\n        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, patch?.appearanceForms, patch?.appearanceFormChanges);\n    }",
    "    if (!locked.has('appearanceForms')) {\n        const incomingForms = normalizeAppearanceForms(patch?.appearanceForms);\n        // A pre-existing single-form dossier already has canonical baseline appearance.\n        // The first time alternate forms arrive, preserve that body as Base before merging\n        // the newly observed forms. New NPCs are not guessed here; their scanner payload\n        // must explicitly describe every grounded form it observed.\n        if (!normalizeAppearanceForms(next.appearanceForms).length && incomingForms.length && String(npc.appearance || '').trim()) {\n            next.appearanceForms = [{ name: 'Base', appearance: String(npc.appearance).trim() }];\n        }\n        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, patch?.appearanceFormChanges);\n    }",
    'existing baseline form promotion',
);
write('v03/scanner.js', scanner);

// 2) The foreground capture contract needs the same broader semantics because this is the
// path used on ordinary RP turns.
let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'appearance is shared/common physical description, or ordinary single-form appearance. currentForm is live physical-form state only; leave it empty for ordinary non-transforming NPCs. Clothing, disguises, poses, moods, and injuries are not forms.',",
    "        'appearance is shared/common physical description, or the ordinary baseline appearance. currentForm is live physical-form state only; leave it empty for ordinary non-transforming NPCs. A form MAY be temporary, reversible, magical, elemental, spectral, or energy-made when it is a coherent transformed body state with materially different anatomy, body plan, or silhouette. Partial transformations count when they manifest form-defining anatomy such as horns, wings, tails, scales, feathers, claws, or a changed body shape, even if those parts are ethereal or energy-made. Mere aura, glow, spell particles, clothing, disguise, pose, mood, or injury is not a form. If an existing NPC first reveals alternate forms and ends back in the ordinary body represented by stored appearance, use currentForm Base.',",
    'foreground reversible and partial form semantics',
);
injection = replaceRequired(
    injection,
    "        'appearanceForms is durable form-specific canon. For a NEW multi-form NPC include every grounded distinct physical form. For an EXISTING NPC return only genuinely NEW forms; never rewrite a known form from casual contradictory prose. Existing form dimensions/anatomy/colors/proportions are sticky.',",
    "        'appearanceForms is durable form-specific canon. Durable means the stored DESCRIPTION remains canonical; the transformation itself may be temporary or reversible. Capture EVERY distinct form state explicitly entered in this response, including both a partial/hybrid manifestation and a later full beast body when both occur. For unnamed transformed states use a concise descriptive morphology label such as Partial manifestation rather than inventing lore taxonomy. For a NEW multi-form NPC include every grounded form, including its baseline form when actually described. For an EXISTING NPC return only genuinely NEW forms; NPC State locally preserves its pre-existing ordinary appearance as Base when the first alternate form arrives. Never rewrite a known form from casual contradictory prose. Existing form dimensions/anatomy/colors/proportions are sticky.',",
    'foreground multi-stage form capture semantics',
);
write('v03/injection.js', injection);

let changelog = read('CHANGELOG.md');
const line = '- Multi-stage form capture hardening: temporary/reversible magical or spectral body transformations can now be recorded as forms when they materially change anatomy, partial manifestation and full-beast states can both be captured from one exchange, and an existing single-form appearance is preserved as a neutral Base form when alternates first appear.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line + '\n', 'changelog heading');
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.1 multi-stage form capture semantics');
