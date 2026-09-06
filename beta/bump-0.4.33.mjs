import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.33 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.32', '0.4.33'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.32', '0.4.33');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.32', '0.4.33'].includes(manifest.version)) throw new Error('Expected the complete 0.4.32 baseline');
manifest.version = '0.4.33';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.32', '# NPC State Beta 0.4.33', 'README title');
if (!readme.includes('## Grounded semantic life-state transitions')) {
    readme = readme.replace(
        '## Operation-context ownership and rollback replay continuity',
        `## Grounded semantic life-state transitions\n\n- Life-state semantics are judged by the scanner model. The backend no longer maintains its own English death/living phrase grammar; instead it verifies that the model-provided life-state evidence is grounded in permitted current narrative or World_State text.\n- Confirmed scanner deaths accept the scanner contract's explicit or strong certainty levels, while uncertain proposals remain rejected. Rejected life-state proposals are retained in bounded lifeStateDiagnostics with a concrete reason such as missing evidence, unverifiable evidence, insufficient certainty, or missing living-return authorization.\n- Confirmed death uses one shared transition invariant: lifeState becomes dead, the dossier is archived immediately as deceased, presence/activity are cleared, and dossier/relationship history is preserved. Authoritative manual dossier updates use the same transition.\n- Normalization repairs legacy dead-but-unarchived dossiers into the same deceased archival invariant without deleting their dossier data.\n- livingReturn remains the required channel for reviving a previously confirmed-dead dossier, but its semantic interpretation is likewise left to the model while the backend verifies evidence provenance and certainty.\n\n## Operation-context ownership and rollback replay continuity`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.33')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.33\n\n- Removes hardcoded English sentence-pattern gating from scanner life-state semantics. The model now interprets attribution, pronouns, indirect reports, negation, and death/living meaning while the backend validates the supplied evidence against permitted source text.\n- Aligns confirmed-death certainty with the scanner contract: explicit and strong grounded proposals may apply; uncertain proposals are rejected.\n- Adds bounded lifeStateDiagnostics so rejected scanner life-state proposals report why they were not applied instead of disappearing as silent no-ops.\n- Introduces one confirmed-death transition invariant shared by scanner and authoritative manual updates: immediately archive as deceased, clear presence/activity, preserve the dossier and relationship history, and retain the first deceased archival timestamp.\n- Repairs legacy dead-but-unarchived dossier states during normalization.\n- Adds behavioral regressions for indirect reports, possessive death wording, found-dead/deceased/passed-away/pronoun formulations, evidence provenance, uncertainty rejection, rejection diagnostics, manual death archival, legacy repair, and history preservation.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.33');
