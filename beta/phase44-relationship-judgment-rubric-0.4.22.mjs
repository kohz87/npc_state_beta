import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.22 marker: ' + label);
    return source.replace(from, to);
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    if (start < 0) {
        if (source.includes(replacement)) return source;
        throw new Error('Missing v0.4.22 range start: ' + label);
    }
    const end = source.indexOf(endMarker, start);
    if (end < 0) throw new Error('Missing v0.4.22 range end: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

let policy = fs.readFileSync('v03/relationship-policy.js', 'utf8');
{
    const startMarker = 'export function relationshipAxisIndependencePrompt() {';
    const start = policy.indexOf(startMarker);
    if (start < 0) throw new Error('Missing v0.4.22 relationship prompt helper');
    const end = policy.indexOf('\n}\n', start);
    if (end < 0) throw new Error('Missing v0.4.22 relationship prompt helper end');
    const replacement = `export function relationshipJudgmentRubricPrompt() {
    return [
        'RELATIONSHIP JUDGMENT AND PER-AXIS EVIDENCE:',
        '- NEW CHANGE & CONTINUITY: Decide whether THIS exchange supports a genuinely new relationship shift rather than merely displaying an established attitude, continuing an interaction, or repeating an already-scored consequence. Use established relationship context to understand what changed, never as fresh evidence. Continued interaction may still move when a genuinely new relationship-changing development occurs.',
        '- ATTRIBUTION: Evaluate THIS NPC toward the PLAYER only. Identify who acted, who reacted or experienced a response, and toward whom that response is directed. Do not transfer another character’s feelings or unrelated emotional changes onto this relationship, and do not infer mutual feelings from evidence about only one participant.',
        '- EVIDENCE & INFERENCE: Separate what the narration establishes from what you infer. Indirect behavior may justify movement; explicit emotion labels or relationship keywords are not required. Keep each explanation within what its quotations plus relevant context reasonably support. Avoid permanent, absolute, or broader claims when the evidence supports only a limited change.',
        '- AMBIGUITY WITHOUT FREEZING: Consider whether a plausible alternative explanation materially weakens the proposed relationship interpretation. Mere hypothetical alternatives are not vetoes. Clear contextual evidence should still receive movement; weak or materially ambiguous support should favor a smaller delta or zero.',
        '- AXIS INDEPENDENCE: Trust = confidence/reliance in the player; Affection = warmth/liking/attachment; Desire = attraction/intimate interest; Tension = interpersonal strain/charged friction, with negative Tension meaning greater ease/lower strain. Judge every axis and sign separately. Do not spread a general positive or negative impression across axes. One quotation may support multiple axes only when each has a distinct defensible explanation.',
        '- PROPORTIONALITY: Choose modest raw deltas proportionate to the strength, significance, and novelty of the supported shift. An impact-tier cap is a maximum, not a default target. Zero is appropriate when no new shift is supported; meaningful developments must not be suppressed merely because they are expressed indirectly. Runtime applies caps, axis limits, priority selection, duplicate protection, inertia, fractional progress, and milestone gates; do not manually apply those reductions a second time or inflate proposals to overcome them.',
        '- MIXED EVIDENCE & CHRONOLOGY: Consider conflicting reactions and how the exchange develops. A later response may qualify an earlier one without automatically erasing it. Propose the net supported change per axis. Do not cherry-pick only the strongest supporting sentence, ignore contradictory context, or turn mixed evidence into an automatic zero.',
        '- BALANCED DIRECTION: Apply comparable evidence standards to increases and decreases. A pleasant interaction does not automatically establish Affection, and an unpleasant interaction does not automatically establish dislike or distrust. Evaluate the particular axis and its sign correctly, especially Tension.',
        '- NO CIRCULAR JUSTIFICATION: Existing meter values, qualitative relationship lenses, generated relationship summaries, previous scanner explanations, diagnostics, and prior relationship history are context only. Never use them themselves as fresh evidence that another change occurred.',
        '- PER-AXIS RELATIONSHIP EVIDENCE: Every nonzero axis needs axisEvidence for that axis with 1-3 short VERBATIM excerpts copied from permitted CURRENT-exchange relationship evidence plus one concise explanation identifying the supported NEW change and its basis. Do not provide a long reasoning transcript, a checklist response for every rubric item, or a numerical confidence score. Context may guide interpretation but does not turn an earlier event into fresh evidence.',
        '- A quotation proves source provenance, not emotional meaning. Preserve who acted, negation, chronology, and outcome in quoted evidence. Runtime validates provenance/structure without keyword-gating the model’s relationship interpretation.',
    ].join('\\n');
}

export function relationshipMechanicsPrompt() {
    return [
        'RELATIONSHIP NUMERIC CONTRACT:',
        '- ordinary: at most 1 raw point on at most 1 supported axis; meaningful: at most 2 per supported axis and at most 2 axes; major: at most 5 per supported axis and at most 3 axes; extreme: at most 10 per supported axis and at most 4 axes. These are ceilings, not targets.',
        '- priority orders only supported nonzero axes from strongest/most central to weakest so impact-tier overflow can be resolved. Do not list unsupported or zero axes.',
        '- RELATIONSHIP REPEATS AND GATES: repeated aftermath/restatement is zero unless a genuinely new relationship-changing development occurs. Runtime checkpoints outward depth at 25/50/75/90 independently by axis and direction: crossing 25 needs meaningful+, 50 major+ with raw 3, 75 extreme with raw 5, and 90 extreme relationship-defining with raw 8. Movement toward neutral is not gate-blocked. Never inflate impact/delta to force a gate.',
        '- Raw deltas are pre-inertia evidence weights. Runtime applies the existing depth resistance and retains accepted fractional progress; do not pre-discount raw deltas for inertia.',
        '- Relationship Summary may describe accepted depth/context, but it must not become evidence for a new delta or become deeper/more absolute than the accepted state supports.',
    ].join('\\n');
}

export function relationshipCustomCriteriaPrompt(value, maxChars = 6000) {
    const text = String(value ?? '').trim().slice(0, Math.max(0, Number(maxChars) || 6000));
    if (!text) return '';
    return [
        'USER RELATIONSHIP CRITERIA (ADDITIVE CALIBRATION):',
        '- Apply the user-authored criteria as campaign-specific refinements. Preserve them as written, but do not let them replace the shared judgment rubric, current-exchange quotation contract, axis definitions, or deterministic numeric mechanics.',
        text,
    ].join('\\n');
}

// Compatibility name retained for existing imports/tests; the helper now represents the full shared rubric.
export function relationshipAxisIndependencePrompt() {
    return relationshipJudgmentRubricPrompt();
}`;
    policy = policy.slice(0, start) + replacement + policy.slice(end + 3);
}
fs.writeFileSync('v03/relationship-policy.js', policy);

let injection = fs.readFileSync('v03/injection.js', 'utf8');
injection = replaceRequired(
    injection,
    "import { normalizeNpcAdmissionMode } from './schema.js';",
    "import { normalizeNpcAdmissionMode } from './schema.js';\nimport { relationshipCustomCriteriaPrompt, relationshipJudgmentRubricPrompt, relationshipMechanicsPrompt } from './relationship-policy.js';",
    'foreground shared relationship helper import',
);
{
    const startMarker = "        'RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds.";
    const endMarker = "        'MEMORY SEMANTIC HYGIENE:";
    const replacement = `        'RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds. Return an npcs patch for each such NPC even when no other dossier field changed. Set relationshipChange.evaluated to true. When no new player-relationship shift is supported, use impact none, all-zero deltas, empty axisEvidence/evidence, and a concise reason. Never omit relationshipChange for an exchange-active NPC.',
        relationshipJudgmentRubricPrompt(),
        relationshipMechanicsPrompt(),
        'PER-AXIS RELATIONSHIP EVIDENCE is governed by the shared rubric above; required excerpts remain exact permitted CURRENT-exchange quotations, not summaries or earlier-context substitutions.',
        'RELATIONSHIP EVIDENCE BOUNDARIES: visible narrative and permitted private relationship context may be quoted according to the structured-evidence rules. World_State and reference/control blocks are not unrestricted relationship-event evidence. Private thought may support an internal attitude but does not by itself prove visible speech, action, gesture, or reaction.',
        'RELATIONSHIP REPEATS AND GATES are applied with the shared rubric and numeric contract above. Do not count old events again, and do not manually compensate for runtime inertia or milestones.',
        'Do not write a Relationship Summary deeper or more absolute than accepted state supports. The Player relationship lens is qualitative context only; never infer or echo hidden numeric meter values from its wording.',
        relationshipCustomCriteriaPrompt(settings.relationshipCriteria),
`;
    injection = replaceRange(injection, startMarker, endMarker, replacement, 'foreground relationship guidance');
}
fs.writeFileSync('v03/injection.js', injection);

let scanner = fs.readFileSync('v03/scanner.js', 'utf8');
scanner = replaceRequired(
    scanner,
    "import { AGE_PROGRESSION_MODE, ageProgressionAppearanceSafe, apparentAgeProgressionAllowed, authorizeAgeProgression, progressionEvidence, sharedAgeProgressionAllowed } from './age-progression.js';",
    "import { AGE_PROGRESSION_MODE, ageProgressionAppearanceSafe, apparentAgeProgressionAllowed, authorizeAgeProgression, progressionEvidence, sharedAgeProgressionAllowed } from './age-progression.js';\nimport { relationshipCustomCriteriaPrompt, relationshipJudgmentRubricPrompt, relationshipMechanicsPrompt } from './relationship-policy.js';",
    'recovery shared relationship helper import',
);
{
    const startMarker = "        '- RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds.";
    const endMarker = "        '- age is ACTUAL chronological age only.";
    const replacement = `        '- RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds. Return an npcs patch for each such NPC even when no other dossier field changed. Set relationshipChange.evaluated to true. When no new player-relationship shift is supported, use impact none, all-zero deltas, empty axisEvidence/evidence, and a concise reason. Never omit relationshipChange for an exchange-active NPC.',
        relationshipJudgmentRubricPrompt(),
        relationshipMechanicsPrompt(),
        '- PER-AXIS RELATIONSHIP EVIDENCE is governed by the shared rubric above; required excerpts remain exact permitted CURRENT-exchange quotations, not summaries or older-context substitutions.',
        '- Older history is context for stable profile/memory and relationship continuity only. It may help interpret what changed, but it never supplies fresh relationship-event quotations or replays prior deltas.',
`;
    scanner = replaceRange(scanner, startMarker, endMarker, replacement, 'recovery relationship guidance');
}
scanner = replaceRequired(
    scanner,
    "        relationshipCriteria ? `RELATIONSHIP RUBRIC:\\n${compactText(relationshipCriteria, 6000)}` : '',",
    "        relationshipCustomCriteriaPrompt(relationshipCriteria),",
    'recovery custom relationship criteria integration',
);
fs.writeFileSync('v03/scanner.js', scanner);

let engine = fs.readFileSync('v03/engine.js', 'utf8');
engine = engine.replace('    relationshipAxisIndependencePrompt,\n', '');
{
    const oldPrompt = `            const prompt = \`${'${'}buildScanPrompt({
                state,
                chat,
                assistantMessageId: messageId,
                scanDepth: settings.scanDepth,
                relationshipCriteria: settings.relationshipCriteria,
                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
                admissionMode: settings.newNpcAdmissionMode,
            })}\\n\\n${'${'}relationshipAxisIndependencePrompt()}\`;`;
    const newPrompt = `            const prompt = buildScanPrompt({
                state,
                chat,
                assistantMessageId: messageId,
                scanDepth: settings.scanDepth,
                relationshipCriteria: settings.relationshipCriteria,
                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
                admissionMode: settings.newNpcAdmissionMode,
            });`;
    engine = replaceRequired(engine, oldPrompt, newPrompt, 'single shared recovery rubric insertion');
}
fs.writeFileSync('v03/engine.js', engine);

let index = fs.readFileSync('v03/index.js', 'utf8');
if (!index.includes('LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421')) {
    index = replaceRequired(
        index,
        'const DEFAULT_RELATIONSHIP_CRITERIA = `Relationship deltas measure only genuinely NEW changes caused by the current USER+ASSISTANT exchange.',
        'const LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421 = `Relationship deltas measure only genuinely NEW changes caused by the current USER+ASSISTANT exchange.',
        'legacy built-in relationship criteria marker',
    );
    const memoryMarker = '\n\nconst DEFAULT_MEMORY_CRITERIA = ';
    const memoryIndex = index.indexOf(memoryMarker);
    if (memoryIndex < 0) throw new Error('Missing v0.4.22 default memory criteria boundary');
    const newDefault = `\n\nconst DEFAULT_RELATIONSHIP_CRITERIA = \`The shared relationship-judgment rubric is the default authority. Use this field only for optional campaign-specific calibration; custom criteria are additive and do not replace current-exchange evidence, per-axis meanings, or deterministic score mechanics.\`;`;
    index = index.slice(0, memoryIndex) + newDefault + index.slice(memoryIndex);
}
index = replaceRequired(
    index,
    "    if (String(settings.relationshipCriteria || '').trim() === PRE_GATE_RELATIONSHIP_CRITERIA.trim()) settings.relationshipCriteria = DEFAULT_RELATIONSHIP_CRITERIA;",
    "    const relationshipCriteriaText = String(settings.relationshipCriteria || '').trim();\n    if (relationshipCriteriaText === PRE_GATE_RELATIONSHIP_CRITERIA.trim() || relationshipCriteriaText === LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421.trim()) settings.relationshipCriteria = DEFAULT_RELATIONSHIP_CRITERIA;",
    'legacy default-only criteria migration',
);
fs.writeFileSync('v03/index.js', index);

let ui = fs.readFileSync('v03/ui.js', 'utf8');
ui = replaceRequired(
    ui,
    '            <details><summary><b>Relationship evidence rubric</b></summary><textarea id="npc_state_v3_relationship_criteria" class="text_pole npc-state-rubric-textarea" rows="8"></textarea></details>',
    '            <details><summary><b>Relationship criteria · additive</b></summary><div class="npc-state-intro">Shared relationship judgment, current-exchange evidence, and numeric mechanics always apply. Custom text here adds campaign-specific calibration without replacing those rules.</div><textarea id="npc_state_v3_relationship_criteria" class="text_pole npc-state-rubric-textarea" rows="8"></textarea></details>',
    'relationship criteria UI explanation',
);
fs.writeFileSync('v03/ui.js', ui);

console.log('Applied NPC State 0.4.22 shared relationship judgment rubric');
