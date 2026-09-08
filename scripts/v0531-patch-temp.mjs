import fs from 'node:fs';

function read(path) {
    return fs.readFileSync(path, 'utf8');
}
function write(path, content) {
    fs.writeFileSync(path, content);
}
function replaceExact(path, from, to) {
    const source = read(path);
    if (!source.includes(from)) throw new Error(`Missing expected text in ${path}: ${from.slice(0, 120)}`);
    const next = source.replace(from, to);
    if (next === source) throw new Error(`Replacement did not change ${path}`);
    write(path, next);
}

replaceExact(
    'src/scan-helpers.js',
    "        'PRIVATE COMPLETENESS CHECK: silently check all dossier fields + Current Dynamic before payload; unknown is valid and needs no invented fact.',",
    "        'PRIVATE COMPLETENESS CHECK: re-check every field + Current Dynamic against permitted CURRENT sources before payload; directly supported narrow values are proposals, not insufficient. Unknown is valid; never invent.',",
);

replaceExact(
    'src/evidence-adapter.js',
    "        '<NPC_Inner_Chatter> may ground private mood/goal/attitude/relationship context only; it never proves presence, action, speech, gesture, or visible reaction. Other <Blocks> children are not ordinary current-event evidence. Never convert private thought into visible behavior without independent visible support.',",
    "        '<NPC_Inner_Chatter> directly grounds stated current private mood/goal/attitude/relationship context only; it never proves presence, action, speech, gesture, or visible reaction. Other <Blocks> children are not ordinary current-event evidence. Never convert private thought into visible behavior without independent visible support.',",
);

replaceExact(
    'src/model/semantic-updates.js',
    "Actual age is chronological: established replacement needs ageKind birthday|elapsed|correction plus evidence for the resulting number; never derive it from apparent age or invented calendar arithmetic. Birthday is passive freeform calendar metadata: preserve fantasy calendars, do not infer it from age, and do not auto-advance age merely because the date passes.",
    "Actual age is chronological: established replacement needs ageKind birthday|elapsed|correction plus evidence for the resulting number; never derive it from apparent age or invented calendar arithmetic. Birthday is passive freeform calendar metadata: preserve fantasy calendars, do not infer it from age, and do not auto-advance age merely because the date passes; birthdayProvenance:\"generated\" is fallback metadata, not evidence.",
);

replaceExact(
    'src/foreground-context.js',
    "        birthday: clipForegroundText(npc.birthday, 100),\n        appearance: clipForegroundText(npc.appearance || resolvedCurrentAppearance(npc), sizes.scalar),",
    "        birthday: clipForegroundText(npc.birthday, 100),\n        birthdayProvenance: npc.birthdayProvenance === 'generated' ? 'generated' : '',\n        appearance: clipForegroundText(npc.appearance || resolvedCurrentAppearance(npc), sizes.scalar),",
);
replaceExact(
    'src/foreground-context.js',
    "        npc.id, npc.name, (npc.aliases || []).join('|'), npc.role, npc.species, npc.age, npc.apparentAge, npc.birthday,\n        npc.appearance,",
    "        npc.id, npc.name, (npc.aliases || []).join('|'), npc.role, npc.species, npc.age, npc.apparentAge, npc.birthday, npc.birthdayProvenance,\n        npc.appearance,",
);

replaceExact(
    'src/dossier-view.js',
    "function identityText(npc = {}) {\n    return [\n        npc.species,\n        npc.role,\n        npc.age ? `Actual age ${npc.age}` : '',\n        npc.apparentAge ? `Looks ${npc.apparentAge}` : '',\n        npc.birthday ? `Birthday ${npc.birthday}` : '',\n    ].filter(Boolean).join(' · ');\n}\n\nfunction currentFact(label, value) {",
    "function birthdayIsGenerated(npc = {}) {\n    return npc?.birthdayProvenance === 'generated';\n}\n\nfunction identityText(npc = {}) {\n    return [\n        npc.species,\n        npc.role,\n        npc.age ? `Actual age ${npc.age}` : '',\n        npc.apparentAge ? `Looks ${npc.apparentAge}` : '',\n        npc.birthday ? `Birthday ${npc.birthday}${birthdayIsGenerated(npc) ? ' (generated)' : ''}` : '',\n    ].filter(Boolean).join(' · ');\n}\n\nfunction currentFact(label, value) {",
);
replaceExact(
    'src/dossier-view.js',
    "            ${currentFact('Birthday', npc.birthday)}",
    "            ${currentFact(birthdayIsGenerated(npc) ? 'Birthday (generated)' : 'Birthday', npc.birthday)}",
);

replaceExact('manifest.json', '"version": "0.5.30"', '"version": "0.5.31"');
replaceExact('DEVELOPMENT.md', '- Extension release: `0.5.30`', '- Extension release: `0.5.31`');

replaceExact(
    'README.md',
    "## Release 0.5.30\n\n0.5.30 retains source-owned profile observations for newly admitted NPCs through the existing bounded evidence store and commit/checkpoint flow. Initial profile guidance distinguishes several reinforcing actions in one scene from independent later development; apparent-age guidance explicitly includes the current user message. The compact example demonstrates narrow initial personality and behavior while leaving unsupported facts unknown. No extra scan or historical enrichment is introduced.",
    "## Release 0.5.31\n\n0.5.31 tightens first-pass field accounting so directly supported values from each field's already permitted current source are proposed instead of reflexively marked insufficient. Current NPC_Inner_Chatter remains narrowly authoritative for stated private mood/goal context only. Generated birthday fallback values now retain visible provenance through compact scanner context and dossier presentation instead of looking like narrative canon. One post-response scan and continuity-only foreground injection remain unchanged.",
);
replaceExact(
    'README.md',
    "- **0.5.29:** carry accepted World_State canonical-name enrichment into zero-delta Current Dynamic target binding without weakening other summary-target safeguards.",
    "- **0.5.29:** carry accepted World_State canonical-name enrichment into zero-delta Current Dynamic target binding without weakening other summary-target safeguards.\n- **0.5.30:** retain source-owned profile observations for newly admitted NPCs and clarify first-contact profile establishment without adding another scan.\n- **0.5.31:** re-check permitted current evidence before `insufficient`, and expose synthetic birthday provenance in compact scanner context and dossier UI.",
);

replaceExact(
    'CHANGELOG.md',
    '## 0.5.30',
    '## 0.5.31\n\n- Tighten shared field accounting so `insufficient` is an evidence conclusion rather than a safe default: directly supported narrow values from already permitted current sources should be proposed, including stated current private mood/goal from NPC_Inner_Chatter. Keep the existing field-scoped structured-evidence firewall; no deterministic mood/goal inference, extra scan, or provider-specific rule is added.\n- Preserve generated birthday fill as a separate user-configurable feature while carrying its `generated` provenance through compact scanner context/cache identity and labeling it in the dossier UI. Synthetic calendar values remain fallback metadata rather than narrative evidence.\n- Add focused prompt/provenance/UI/cache regressions. Preserve first-contact profile observations, identity admission, descriptive-versus-numeric relationship separation, one post-response scan, and continuity-only foreground injection. Persisted schema remains version 1.\n\n## 0.5.30',
);

replaceExact(
    'docs/core-contract.md',
    'Modern payloads account for each supplied candidate independently of activity arrays, then account for each applicable ordinary field of evaluated NPCs through a proposal or compact field-level outcome for explicitly unchanged, insufficient-evidence, or context-unavailable work.',
    'Modern payloads account for each supplied candidate independently of activity arrays, then account for each applicable ordinary field of evaluated NPCs through a proposal or compact field-level outcome for explicitly unchanged, insufficient-evidence, or context-unavailable work. `insufficient` is an evidence conclusion rather than a default: the scanner re-checks each field against its already permitted current sources and proposes a narrow grounded value when one is directly supported.',
);
replaceExact(
    'docs/core-contract.md',
    'Intentional birthday generation remains a separate extension feature.',
    'Intentional birthday generation remains a separate extension feature. A generated birthday retains `birthdayProvenance: "generated"`, is identified as generated in the dossier and compact scanner context, and is fallback metadata rather than narrative evidence.',
);

const testSource = `import test from 'node:test';\nimport assert from 'node:assert/strict';\n\nimport { dossierHtml } from '../src/dossier-view.js';\nimport { structuredEvidencePromptRules } from '../src/evidence-adapter.js';\nimport { compactForegroundNpc, foregroundStateRevisionSignature } from '../src/foreground-context.js';\nimport { dossierExtractionPromptRules } from '../src/scan-helpers.js';\n\nfunction npc(overrides = {}) {\n    return {\n        id: 'npc-tessa',\n        name: 'Tessa Morren',\n        aliases: [],\n        role: 'Guild Intake Clerk',\n        species: '',\n        age: '',\n        apparentAge: '~23',\n        birthday: '23 Thawrise',\n        birthdayProvenance: 'generated',\n        appearance: 'A young woman in a wool waistcoat and ink-stained linen sleeves.',\n        currentForm: '',\n        appearanceForms: [],\n        personality: '',\n        behaviorProfile: [],\n        speech: '',\n        mannerisms: [],\n        keyRelationships: [],\n        memories: [],\n        background: '',\n        mood: '',\n        location: 'Adventurer Guild Post, Rimecross',\n        goal: '',\n        status: 'Processing intake paperwork.',\n        lifeState: 'alive',\n        relationshipSummary: '',\n        relationship: { trust: 0, affection: 0, desire: 0, tension: 0 },\n        manualProfileFields: [],\n        profileEvolutionEvidence: [],\n        updatedAt: 1,\n        ...overrides,\n    };\n}\n\ntest('private completeness treats supported permitted-source values as proposals, not default insufficient', () => {\n    const extraction = dossierExtractionPromptRules().join('\\n');\n    const structured = structuredEvidencePromptRules().join('\\n');\n    assert.match(extraction, /directly supported narrow values are proposals, not insufficient/i);\n    assert.match(structured, /NPC_Inner_Chatter> directly grounds stated current private mood\\/goal/i);\n    assert.match(structured, /never proves presence, action, speech, gesture, or visible reaction/i);\n    assert.doesNotMatch(extraction + structured, /Gemini|provider-specific|second scan|historical backfill/i);\n});\n\ntest('generated birthday provenance survives compact routine context while ordinary explicit provenance stays omitted', () => {\n    const generated = compactForegroundNpc(npc(), 0);\n    assert.equal(generated.birthday, '23 Thawrise');\n    assert.equal(generated.birthdayProvenance, 'generated');\n\n    const explicit = compactForegroundNpc(npc({ birthdayProvenance: 'explicit' }), 0);\n    assert.equal(explicit.birthday, '23 Thawrise');\n    assert.equal(explicit.birthdayProvenance, undefined);\n});\n\ntest('foreground cache signature changes when generated birthday provenance changes', () => {\n    const generatedState = { npcs: [npc()], lastObservation: {} };\n    const explicitState = { npcs: [npc({ birthdayProvenance: 'explicit' })], lastObservation: {} };\n    assert.notEqual(foregroundStateRevisionSignature(generatedState), foregroundStateRevisionSignature(explicitState));\n});\n\ntest('dossier labels generated birthdays without relabeling evidence-backed birthdays', () => {\n    const generatedHtml = dossierHtml(npc());\n    assert.match(generatedHtml, /Birthday 23 Thawrise \\(generated\\)/);\n    assert.match(generatedHtml, /<b>Birthday \\(generated\\)<\\/b><span>23 Thawrise<\\/span>/);\n\n    const explicitHtml = dossierHtml(npc({ birthdayProvenance: 'explicit' }));\n    assert.match(explicitHtml, /Birthday 23 Thawrise/);\n    assert.doesNotMatch(explicitHtml, /Birthday \\(generated\\)/);\n});\n\ntest('compact provenance does not expand the foreground contract into extraction or a second scan', () => {\n    const compact = JSON.stringify(compactForegroundNpc(npc(), 0));\n    assert.match(compact, /\\"birthdayProvenance\\":\\"generated\\"/);\n    assert.doesNotMatch(compact, /semanticUpdates|fieldEvaluations|profileObservations|relationshipChange/);\n});\n`;
write('tests/v0531-live-evidence-birthday-provenance.test.mjs', testSource);

fs.rmSync('.github/workflows/verify-v0531-temp.yml', { force: true });
fs.rmSync('scripts/v0531-patch-temp.mjs', { force: true });
