import fs from 'node:fs';

function replaceRequired(path, from, to, label) {
    let source = fs.readFileSync(path, 'utf8');
    if (!source.includes(from)) throw new Error(`Missing legacy appearance verifier marker in ${path}: ${label}`);
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

console.log('Made legacy appearance verifiers compatible with 0.4.5 two-surface presentation');
