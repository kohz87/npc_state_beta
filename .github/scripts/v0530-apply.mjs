import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function replaceExact(path, before, after) {
    const source = read(path);
    if (source.includes(after)) return;
    if (!source.includes(before)) throw new Error(`Expected text not found in ${path}: ${before.slice(0, 120)}`);
    write(path, source.replace(before, after));
}
function prependAfter(path, marker, block) {
    const source = read(path);
    if (source.includes(block.trim())) return;
    if (!source.includes(marker)) throw new Error(`Marker not found in ${path}`);
    write(path, source.replace(marker, marker + block));
}

if (JSON.parse(read('manifest.json')).version === '0.5.30') {
    console.log('v0.5.30 candidate already applied.');
    process.exit(0);
}

replaceExact('src/scan-helpers.js',
    "        'FIELD EVALUATION: propose each applicable field or list it once in fieldEvaluations unchanged|insufficient|unavailable. evaluatedGroups are group labels only; omission is unaccounted, and contextCoverage unavailable/partial is not empty.',",
    "        'FIELD EVALUATION: propose each applicable field or list it once in fieldEvaluations unchanged|insufficient|unavailable. insufficient is an evidence judgment, not a safe/default: for NEW NPCs inspect both current USER and ASSISTANT visible evidence before using it. evaluatedGroups are group labels only; omission is unaccounted, and contextCoverage unavailable/partial is not empty.',");
replaceExact('src/scan-helpers.js',
    "        'FIRST-PASS SUFFICIENCY: do not default to insufficient because an NPC is new/first-scene. One scene can contain multiple distinct observations; same-source facts are not independent support. Establish a narrow field from direct evidence, explicit recurrence/generalization, or multiple reinforcing instances supporting one scoped conclusion; unknown remains correct when that bar is unmet.',",
    "        'FIRST-PASS SUFFICIENCY: new/first-scene is not insufficient by itself. One scene can contain multiple distinct observations; same-source facts are not independent support. Establish a narrow field from direct evidence, explicit recurrence/generalization, or reinforcing instances supporting one scoped conclusion; unknown remains correct when that bar is unmet.',");
replaceExact('src/scan-helpers.js',
    "        'APPARENT AGE: actual age is chronological and separate. Direct visible life-stage wording (e.g. child, adolescent, young woman/man/adult, middle-aged, elderly) is positive evidence even without a number. A broad visible age band may semantically infer a defensible numeric interval apparentAge=~N-M; specific visual age -> ~N. Do not use a fixed phrase-to-range lookup. The backend chooses and persists one stable ~N inside that interval; never copy it into actual age.',",
    "        'APPARENT AGE: actual age is chronological and separate. Direct visible life-stage wording (e.g. child, adolescent, young woman/man/adult, middle-aged, elderly) is positive evidence even without a number; do not mark apparentAge insufficient when it supports a defensible visual band unless evidence conflicts or is materially ambiguous. Semantically propose ~N-M for a broad band or ~N for a specific visual age; no fixed phrase-to-range lookup. Backend persists one stable ~N; never copy it into actual age.',");
replaceExact('src/scan-helpers.js',
    "        'BEHAVIOR PROFILE EVIDENCE: MANNERISM SUFFICIENCY: behaviorProfile is what the NPC tends to do; explicit recurrence/generalization or multiple reinforcing actions can establish one narrow pattern even first-scene. One isolated action may support status/observation but must not be rewritten as a habitual behavior. mannerisms are repeated characteristic gestures/object-handling/social habits; multiple related instances may consolidate into one narrow mannerism; one isolated gesture is insufficient.',",
    "        'BEHAVIOR PROFILE EVIDENCE: MANNERISM SUFFICIENCY: behaviorProfile is what the NPC tends to do; explicit recurrence/generalization or multiple reinforcing actions in one scene can establish one narrow pattern without requiring multiple scenes. One isolated action may support status/observation but is not habitual behavior. mannerisms are repeated characteristic gestures/object-handling/social habits; multiple related instances may consolidate into one narrow mannerism; one isolated gesture is insufficient.',");

replaceExact('src/scan-contract.js',
    "    nia: 'Nia, harbor clerk of the South Quay Registry, wears a blue coat as she tells Ari “Registry first.” She slides the form toward Ari and points to the signature box.',",
    "    nia: 'Nia, a young adult harbor clerk of the South Quay Registry, wears a blue coat as she tells Ari “Registry first.” She slides the form toward Ari, points to the signature box, checks the ledger, and immediately hands Ari the next required form.',");
replaceExact('src/scan-contract.js',
    "            role: 'Harbor clerk', background: 'Clerk of the South Quay Registry.', appearance: 'Blue coat.', speech: 'Brief practical instructions.', status: 'Processing Ari’s registry form.',",
    "            role: 'Harbor clerk', background: 'Clerk of the South Quay Registry.', apparentAge: '~20-30', appearance: 'Blue coat.', behaviorProfile: ['Moves applicants through registry steps quickly and directly.'], speech: 'Brief practical instructions.', status: 'Processing Ari’s registry form.',");

replaceExact('src/dossier-view.js',
    "function identityText(npc = {}) {\n    return [\n        npc.species,\n        npc.role,\n        npc.age ? `Actual age ${npc.age}` : '',\n        npc.apparentAge ? `Looks ${npc.apparentAge}` : '',\n        npc.birthday ? `Birthday ${npc.birthday}` : '',\n    ].filter(Boolean).join(' · ');\n}",
    "export function birthdayDisplayValue(npc = {}) {\n    const value = String(npc?.birthday || '').trim();\n    if (!value) return '';\n    return String(npc?.birthdayProvenance || '').trim().toLocaleLowerCase() === 'generated'\n        ? `${value} · generated`\n        : value;\n}\n\nfunction identityText(npc = {}) {\n    const birthday = birthdayDisplayValue(npc);\n    return [\n        npc.species,\n        npc.role,\n        npc.age ? `Actual age ${npc.age}` : '',\n        npc.apparentAge ? `Looks ${npc.apparentAge}` : '',\n        birthday ? `Birthday ${birthday}` : '',\n    ].filter(Boolean).join(' · ');\n}");
replaceExact('src/dossier-view.js',
    "${currentFact('Birthday', npc.birthday)}",
    "${currentFact('Birthday', birthdayDisplayValue(npc))}");

replaceExact('manifest.json', '"version": "0.5.29"', '"version": "0.5.30"');
replaceExact('src/schema.js', "export const NPC_STATE_VERSION = '0.5.29';", "export const NPC_STATE_VERSION = '0.5.30';");
replaceExact('DEVELOPMENT.md', '- Extension release: `0.5.29`', '- Extension release: `0.5.30`');

replaceExact('README.md', '## Release 0.5.29', '## Release 0.5.30');
replaceExact('README.md',
    '0.5.29 completes zero-delta Current Dynamic reuse for the v0.5.28 case where a first-seen NPC is grounded by exact visible identity evidence but receives its canonical proper name from current World_State. For that accepted enrichment path, exact same-source relationship-summary quotations may reuse the already accepted visible identity plus player-facing activity without repeating the visible anchor or structured-only name. Other identity paths retain their existing summary-link safeguards; wrong addressees, isolated quoted `you`, fabricated/out-of-scope evidence, and numeric relationship scoring remain separately guarded.',
    '0.5.30 tightens first-pass field accounting without adding another scan or deterministic phrase rules. `insufficient` is explicitly an evidence judgment rather than a safe default; new-NPC evaluation must consider both current visible messages, direct life-stage evidence must not be discarded when it supports a defensible Apparent Age band, and repeated same-scene actions may establish one narrow Behavioral Profile. The compact parser-tested example now demonstrates those semantics. Generated birthday fill remains separate metadata and is visibly labeled as generated in the dossier instead of looking story-established.');
replaceExact('README.md',
    '- **0.5.29:** carry accepted World_State canonical-name enrichment into zero-delta Current Dynamic target binding without weakening other summary-target safeguards.',
    '- **0.5.29:** carry accepted World_State canonical-name enrichment into zero-delta Current Dynamic target binding without weakening other summary-target safeguards.\n- **0.5.30:** make insufficient-evidence accounting explicitly non-default, align the compact new-NPC example with Apparent Age/Behavioral Profile first-pass sufficiency, and label generated birthday metadata in the dossier.');
replaceExact('README.md',
    'Scanner input sizing is measured separately from foreground continuity and scanner output allowance. npm run measure:scan-prompts uses the existing local conservative estimator (ASCII/3.5 + non-ASCII*1.1) and the exact scanner system wrapper. 0.5.29 does not change scanner prompt text; the current stable matrix is 6,386 tokens for the minimal one-NPC fixture, 6,389 for a rich first encounter, 7,453 for three active plus one mentioned NPC, 6,713 for observation development, 8,055 for dense collections/locks/forms, 6,591 with 1,000 stored NPCs but one relevant NPC, 7,118 for structured blocks plus custom criteria, and 4,794 for targeted Refresh. The dense fixture is reported honestly against the approximate 7,500-token engineering target; no current-evidence truncation rule is introduced. A deliberately long current response remains about 21,342 estimated tokens because the current scene is preserved in full. These are local engineering estimates, not provider-reported usage.',
    'Scanner input sizing is measured separately from foreground continuity and scanner output allowance. `npm run measure:scan-prompts` uses the existing local conservative estimator (ASCII/3.5 + non-ASCII*1.1) and the exact scanner system wrapper. The approximate 7,500-token routine target remains an engineering target rather than a truncation rule: dense or legitimately long current evidence is reported honestly and preserved in full. Release measurements are compared with the same fixtures and wrapper; they are local engineering estimates, not provider-reported usage.');
replaceExact('README.md', '- Release label: **0.5.24**', '- Release label: **0.5.30**');

prependAfter('CHANGELOG.md',
    'This file tracks the current public 0.5.x line. Older 0.4.x material is archived under `docs/history/`; superseded 0.6.x/0.7.x development-line details remain available in Git history and are not repeated here as competing current release notes.\n',
    '\n## 0.5.30\n\n- Tighten shared Scan/Refresh first-pass accounting so `insufficient` is an evidence judgment rather than a safe default. New-NPC evaluation must inspect both current visible messages before using it; direct visible life-stage evidence should yield a model-led Apparent Age proposal when it supports a defensible band, and multiple reinforcing same-scene actions may establish one narrow Behavioral Profile without requiring multiple scenes.\n- Make the compact parser-tested Nia example demonstrate the same Apparent Age and Behavioral Profile sufficiency instead of silently teaching those supported fields as insufficient. Keep personality/mannerism overreach, chronological Actual Age, unsupported memories, and numeric relationship movement separately guarded.\n- Label extension-generated birthday metadata as generated in dossier presentation while leaving scanner evidence, stored provenance, manual/explicit birthdays, birthday generation settings, and schema version unchanged. Preserve one automatic post-response scan, continuity-only foreground injection, existing identity/Current Dynamic authorities, and all deterministic evidence safeguards.\n');

replaceExact('docs/core-contract.md',
    'Omission is not deletion. Missing candidate output is not proof that the NPC was evaluated, unchanged, absent, inactive, or physically elsewhere, and missing field output is not proof that a field was evaluated. Modern payloads account for each supplied candidate independently of activity arrays, then account for each applicable ordinary field of evaluated NPCs through a proposal or compact field-level outcome for explicitly unchanged, insufficient-evidence, or context-unavailable work. Mentioned-only or inactive candidate accounting does not create dummy dossier updates or mutate presence. Older responses may still apply valid compatible proposals, but absent modern candidate accounting cannot falsely report complete candidate coverage. Older evaluatedGroups-only payloads remain accepted group metadata, but group labels never count as field-level unchanged and coverage reports bounded unaccounted field ids honestly. Coverage diagnostics distinguish proposed/applied, rejected, unchanged, insufficient, unavailable, candidate-accounting gaps, and unaccounted work; persistence success remains separate from semantic completeness.',
    'Omission is not deletion. Missing candidate output is not proof that the NPC was evaluated, unchanged, absent, inactive, or physically elsewhere, and missing field output is not proof that a field was evaluated. Modern payloads account for each supplied candidate independently of activity arrays, then account for each applicable ordinary field of evaluated NPCs through a proposal or compact field-level outcome for explicitly unchanged, insufficient-evidence, or context-unavailable work. `insufficient` is an evidence judgment, not a safe/default outcome: for a new NPC the model considers both current visible messages before using it, and new/first-scene status alone never establishes insufficiency. Direct evidence may establish a narrow field immediately; multiple reinforcing actions within one scene may establish one narrow Behavioral Profile without pretending same-source facts are independent longitudinal observations. Mentioned-only or inactive candidate accounting does not create dummy dossier updates or mutate presence. Older responses may still apply valid compatible proposals, but absent modern candidate accounting cannot falsely report complete candidate coverage. Older evaluatedGroups-only payloads remain accepted group metadata, but group labels never count as field-level unchanged and coverage reports bounded unaccounted field ids honestly. Coverage diagnostics distinguish proposed/applied, rejected, unchanged, insufficient, unavailable, candidate-accounting gaps, and unaccounted work; persistence success remains separate from semantic completeness.');
replaceExact('docs/core-contract.md',
    'New NPCs use an empty `id`, canonical `name`, and `identityKind` `named` or `role-label` with current-visible identity/activity evidence; the extension assigns stored IDs locally. `identityEvidence.anchor` is the actual current-visible proper/short name or unique role/description for the individual. Its bounded excerpts must validate exactly against current-visible evidence, include that anchor, and leave the anchor uniquely owned in the operation. A richer role label may be admitted directly when the anchor identifies that canonical label; a proper canonical name that is not visible may be enriched only when that same current World_State placement names the already grounded individual. The structured-only name never becomes the anchor and World_State alone never introduces an NPC. This does not bypass Named preferred or Manual admission policy, identity-collision checks, or the structured/private evidence firewall. New-dossier bootstrap fields are flat and should include every supported current-exchange fact actually evidenced. Existing, including name-only, dossiers retain supplied stable IDs and update through `semanticUpdates`. Unsupported age, backstory, habits, relationships, memories, or other facts remain unknown. Intentional birthday generation remains a separate extension feature. Role is the NPC\'s current function/title; Background may separately capture a directly grounded durable employer, workplace, affiliation, origin, training, prior history, or lasting circumstance. The same evidence may support both Role and Background when those meanings are distinct; populating Role is not a reason to mark grounded Background insufficient.',
    'New NPCs use an empty `id`, canonical `name`, and `identityKind` `named` or `role-label` with current-visible identity/activity evidence; the extension assigns stored IDs locally. `identityEvidence.anchor` is the actual current-visible proper/short name or unique role/description for the individual. Its bounded excerpts must validate exactly against current-visible evidence, include that anchor, and leave the anchor uniquely owned in the operation. A richer role label may be admitted directly when the anchor identifies that canonical label; a proper canonical name that is not visible may be enriched only when that same current World_State placement names the already grounded individual. The structured-only name never becomes the anchor and World_State alone never introduces an NPC. This does not bypass Named preferred or Manual admission policy, identity-collision checks, or the structured/private evidence firewall. New-dossier bootstrap fields are flat and should include every supported current-exchange fact actually evidenced. Existing, including name-only, dossiers retain supplied stable IDs and update through `semanticUpdates`. Unsupported age, backstory, habits, relationships, memories, or other facts remain unknown. Intentional birthday generation remains a separate extension feature; generated values retain generated provenance and dossier presentation identifies that provenance instead of presenting them as story-established birthdays. Role is the NPC\'s current function/title; Background may separately capture a directly grounded durable employer, workplace, affiliation, origin, training, prior history, or lasting circumstance. The same evidence may support both Role and Background when those meanings are distinct; populating Role is not a reason to mark grounded Background insufficient.');

const testPath = 'tests/v0530-first-pass-sufficiency.test.mjs';
if (!fs.existsSync(testPath)) write(testPath, `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { birthdayDisplayValue } from '../src/dossier-view.js';
import { scanOutputExamples, SCAN_OUTPUT_EXAMPLE_SCENES } from '../src/scan-contract.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { buildScanPrompt, buildTargetedRefreshPrompt } from '../src/scanner.js';

const USER = 'A young adult guild clerk immediately pulls Lucien to the counter and starts intake.';
const ASSISTANT = 'The clerk points to the name line, checks the ledger, then immediately hands Lucien the next form and explains the available work.';
const chat = [{ is_user: true, name: 'Lucien', mes: USER }, { is_user: false, name: 'Assistant', mes: ASSISTANT }];

function state() {
    const value = createEmptyState('chat:v0530');
    value.branchSafety = { status: 'safe' };
    return value;
}

test('Scan and Refresh treat insufficient as an evidence judgment and share first-scene sufficiency rules', () => {
    const scan = buildScanPrompt({ state: state(), chat, assistantMessageId: 1, playerName: 'Lucien' });
    const refresh = buildTargetedRefreshPrompt({ npc: normalizeNpc({ id: 'npc-clerk', name: 'Clerk' }), chat, assistantMessageId: 1, playerName: 'Lucien' });
    for (const prompt of [scan, refresh]) {
        assert.match(prompt, /insufficient is an evidence judgment, not a safe\/default/);
        assert.match(prompt, /both current USER and ASSISTANT visible evidence/);
        assert.match(prompt, /new\/first-scene is not insufficient by itself/);
        assert.match(prompt, /do not mark apparentAge insufficient when it supports a defensible visual band unless evidence conflicts or is materially ambiguous/);
        assert.match(prompt, /multiple reinforcing actions in one scene can establish one narrow pattern without requiring multiple scenes/);
        assert.match(prompt, /One isolated action may support status\/observation but is not habitual behavior/);
        assert.match(prompt, /one isolated gesture is insufficient/);
    }
});

test('compact new-NPC example demonstrates supported apparent age and behavior without inventing personality or mannerisms', () => {
    const example = scanOutputExamples({ includeNew: true, includeExisting: false }).populated;
    const nia = example.npcs.find(npc => npc.name === 'Nia');
    assert.ok(nia);
    assert.match(SCAN_OUTPUT_EXAMPLE_SCENES.nia, /young adult/);
    assert.equal(nia.apparentAge, '~20-30');
    assert.deepEqual(nia.behaviorProfile, ['Moves applicants through registry steps quickly and directly.']);
    assert.equal(nia.fieldEvaluations.insufficient.includes('apparentAge'), false);
    assert.equal(nia.fieldEvaluations.insufficient.includes('behaviorProfile'), false);
    assert.equal(nia.fieldEvaluations.insufficient.includes('personality'), true);
    assert.equal(nia.fieldEvaluations.insufficient.includes('mannerisms'), true);
    assert.equal(nia.fieldEvaluations.insufficient.includes('memories'), true);
    assert.deepEqual(nia.relationshipChange.delta, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(nia.relationshipSummary, 'Professional clerk-applicant interaction.');
});

test('first-pass guidance does not encode a life-stage phrase-to-number table', () => {
    const source = fs.readFileSync(new URL('../src/scan-helpers.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /young woman[^\\n]{0,80}(?:18|20|21|25|30)/i);
    assert.doesNotMatch(source, /young adult[^\\n]{0,80}(?:18|20|21|25|30)/i);
    assert.match(source, /no fixed phrase-to-range lookup/);
});

test('generated birthday provenance is visible without relabeling explicit or manual canon', () => {
    assert.equal(birthdayDisplayValue({ birthday: '6 Yearturn', birthdayProvenance: 'generated' }), '6 Yearturn · generated');
    assert.equal(birthdayDisplayValue({ birthday: '20 Reaping', birthdayProvenance: 'explicit' }), '20 Reaping');
    assert.equal(birthdayDisplayValue({ birthday: '3 Frostfall', birthdayProvenance: 'manual' }), '3 Frostfall');
    assert.equal(birthdayDisplayValue({ birthday: '', birthdayProvenance: 'generated' }), '');
});
`);

console.log('Applied v0.5.30 first-pass sufficiency candidate.');
