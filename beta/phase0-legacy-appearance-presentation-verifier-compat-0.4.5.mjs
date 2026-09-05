import fs from 'node:fs';

function replaceRequired(path, from, to, label) {
    let source = fs.readFileSync(path, 'utf8');
    if (!source.includes(from) && !source.includes(to)) throw new Error(`Missing legacy appearance verifier marker in ${path}: ${label}`);
    source = source.replace(from, to);
    fs.writeFileSync(path, source);
}

const phase8Verifier = 'beta/verify-phase8a-form-aware-appearance-sync-0.4.3.mjs';
replaceRequired(
    phase8Verifier,
    "assert(injection.includes('Shared / ordinary appearance: ' + mira.appearance), 'Foreground injection does not distinguish stored shared/ordinary appearance');",
    "assert(!injection.includes('Shared / ordinary appearance:'), 'Foreground injection still exposes redundant stored shared/ordinary appearance');\nassert(!injection.includes('Current form:'), 'Foreground injection still exposes redundant standalone Current form');\nassert(injection.includes('Appearance forms:'), 'Foreground injection lacks the compact Appearance forms registry');",
    'phase8 injection appearance assertion',
);
replaceRequired(
    phase8Verifier,
    "assert(dossier.includes('Shared / ordinary appearance'), 'Dossier lacks Shared / ordinary appearance');\nassert(dossier.includes('Appearance forms'), 'Dossier lacks complete Appearance forms registry');",
    "assert(!dossier.includes('Shared / ordinary appearance'), 'Dossier still exposes redundant Shared / ordinary appearance');\nassert(!dossier.includes('>Current form<'), 'Dossier still exposes redundant standalone Current form');\nassert(dossier.includes('Appearance forms'), 'Dossier lacks complete Appearance forms registry');",
    'phase8 dossier appearance assertion',
);

const phase8ContractVerifier = 'beta/verify-phase8c-age-progression-contracts-0.4.3.mjs';
replaceRequired(
    phase8ContractVerifier,
    "assert(injection.includes('Shared / ordinary appearance: ' + npc.appearance), 'Foreground continuity does not expose stored shared/ordinary appearance separately');",
    "assert(!injection.includes('Shared / ordinary appearance:'), 'Foreground continuity still exposes redundant stored shared/ordinary appearance');\nassert(injection.includes('Appearance forms:'), 'Foreground continuity lost the form registry while compacting appearance');",
    'phase8C foreground shared appearance assertion',
);
replaceRequired(
    phase8ContractVerifier,
    "assert(dossier.includes('Shared / ordinary appearance'), 'Dossier missing Shared / ordinary appearance label');\nassert(dossier.includes('Appearance forms'), 'Dossier missing Appearance forms registry');",
    "assert(!dossier.includes('Shared / ordinary appearance'), 'Dossier still exposes redundant Shared / ordinary appearance label');\nassert(dossier.includes('Appearance forms'), 'Dossier missing Appearance forms registry');",
    'phase8C dossier shared appearance assertion',
);

const legacyFormVerifier = 'beta/verify-form-aware-appearance-0.4.1.mjs';
replaceRequired(
    legacyFormVerifier,
    "assert(injection.includes('Current form: Beast'), 'Foreground continuity omitted current form');\nassert(injection.includes('Known physical forms:'), 'Foreground continuity omitted form registry');",
    "assert(!injection.includes('Current form: Beast'), 'Foreground continuity still exposes redundant standalone current form');\nassert(injection.includes('Appearance forms:'), 'Foreground continuity omitted compact form registry');",
    '0.4.1 foreground form presentation assertions',
);
replaceRequired(
    legacyFormVerifier,
    "assert(dossier.includes(\"block('Appearance forms'\"), 'Dossier appearance-form display missing');\nassert(dossier.includes(\"currentFact('Current form'\"), 'Dossier current-form display missing');",
    "assert(dossier.includes(\"block('Appearance forms'\"), 'Dossier appearance-form display missing');\nassert(!dossier.includes(\"currentFact('Current form'\"), 'Dossier still exposes redundant standalone current-form card');\nassert(dossier.includes(\"currentFact('Current appearance'\"), 'Dossier resolved current-appearance display missing');",
    '0.4.1 dossier form presentation assertions',
);

const settingsVerifier = 'beta/verify-phase9-settings-categories-0.4.4.mjs';
replaceRequired(
    settingsVerifier,
    "assert(manifest.version === '0.4.4', 'Manifest was not bumped to 0.4.4');\nassert(ui.includes('NPC State <span class=\"npc-state-version\">0.4.4</span>'), 'Settings header does not show v0.4.4');",
    "assert(/^0\\.4\\.(?:[4-9]|[1-9]\\d+)$/.test(manifest.version), 'Manifest is older than the v0.4.4 settings release');\nassert(ui.includes('NPC State <span class=\"npc-state-version\">' + manifest.version + '</span>'), 'Settings header does not match current manifest version');",
    '0.4.4 manifest/header version assertions',
);
replaceRequired(
    settingsVerifier,
    "assert(readme.startsWith('# NPC State Beta 0.4.4'), 'README version header was not bumped');",
    "assert(readme.startsWith('# NPC State Beta ' + manifest.version), 'README version header does not match current manifest version');",
    '0.4.4 README version assertion',
);

console.log('Made legacy appearance and settings verifiers compatible with 0.4.5');
