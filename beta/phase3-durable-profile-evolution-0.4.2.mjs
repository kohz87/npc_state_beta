import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase-3 marker: ' + label);
    return source.replace(from, to);
}

// Persist a tiny evidence ledger for gradual profile evolution. This is private
// bookkeeping and is never part of the RP injection.
let schema = read('v03/schema.js');
schema = replaceRequired(
    schema,
    "export const APPEARANCE_FORM_LIMIT = 12;\n",
    "export const APPEARANCE_FORM_LIMIT = 12;\nexport const PROFILE_EVOLUTION_EVIDENCE_LIMIT = 12;\n",
    'profile evidence limit',
);
schema = replaceRequired(
    schema,
    "export function emptyRelationshipChange() {",
    `export function normalizeProfileEvolutionEvidence(value = []) {
    const allowedFields = new Set(['personality', 'behaviorProfile', 'speech', 'mannerisms']);
    const allowedModes = new Set(['refine', 'gradual', 'explicit', 'batch']);
    const source = Array.isArray(value) ? value : [];
    const out = [];
    for (const raw of source.slice(-PROFILE_EVOLUTION_EVIDENCE_LIMIT * 2)) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const field = String(raw.field || '').trim();
        const mode = allowedModes.has(String(raw.mode || '').trim()) ? String(raw.mode).trim() : 'gradual';
        const concept = text(raw.concept, 180);
        const evidence = text(raw.evidence, 600);
        if (!allowedFields.has(field) || !concept || !evidence) continue;
        out.push({
            field,
            mode,
            concept,
            evidence,
            sourceMessageId: Number.isInteger(raw.sourceMessageId) ? raw.sourceMessageId : null,
            turn: Number.isInteger(raw.turn) ? raw.turn : null,
            at: Number(raw.at) || null,
        });
    }
    return out.slice(-PROFILE_EVOLUTION_EVIDENCE_LIMIT);
}

export function emptyRelationshipChange() {`,
    'profile evidence normalizer',
);
schema = replaceRequired(
    schema,
    "    const appearanceForms = normalizeAppearanceForms(input.appearanceForms);\n",
    "    const profileEvolutionEvidence = normalizeProfileEvolutionEvidence(input.profileEvolutionEvidence);\n    const appearanceForms = normalizeAppearanceForms(input.appearanceForms);\n",
    'profile evidence npc setup',
);
schema = replaceRequired(
    schema,
    "        mannerisms: list(input.mannerisms, DOSSIER_LIMIT_MAXIMUMS.mannerisms, 280),\n        background:",
    "        mannerisms: list(input.mannerisms, DOSSIER_LIMIT_MAXIMUMS.mannerisms, 280),\n        profileEvolutionEvidence,\n        background:",
    'profile evidence npc storage',
);
write('v03/schema.js', schema);

let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "    normalizeNpc,\n    normalizeRelationship,",
    "    normalizeNpc,\n    normalizeProfileEvolutionEvidence,\n    normalizeRelationship,",
    'profile evidence import',
);
scanner = replaceRequired(
    scanner,
    "function applyStablePatch(npc, patch, options = {}) {",
    `const PROFILE_EVOLUTION_FIELDS = new Set(['personality', 'behaviorProfile', 'speech', 'mannerisms']);
const PROFILE_TRANSITION_CUES = /\\b(no longer|formerly|became|becomes|becoming|increasingly|from now on|now (?:speaks?|acts?|behaves?|tends?|prefers?|refuses?)|started|stopped|began|developed|grew (?:more|less)|learned to|hardened|softened|reformed|changed)\\b/i;
const PROFILE_LASTING_CUES = /\\b(permanent(?:ly)?|lasting|enduring|from now on|no longer|became|becomes|developed|learned to|habit(?:ual|ually)?|now consistently|changed for good|settled into|adopted as a habit)\\b/i;
const PROFILE_TIME_SKIP_CUES = /\\b(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(?:days?|weeks?|months?|years?)\\s+(?:later|passed|had passed)|\\bover the (?:next|following)\\s+(?:days?|weeks?|months?|years?)|\\bafter\\s+(?:\\d+|several|many|a few)\\s+(?:days?|weeks?|months?|years?)|\\bduring the (?:following|next|intervening)\\s+(?:days?|weeks?|months?|years?)|\\btime[- ]skip\\b/i;
const PROFILE_HABIT_CUES = /\\b(always|often|usually|habitually|regularly|repeatedly|tends? to|keeps? doing|whenever|every time|habit|mannerism|recurring|characteristically)\\b/i;
const PROFILE_KIND_CUES = /\\b(kind|gentle|compassionate|empathetic|merciful|caring|warm|benevolent)\\b/i;
const PROFILE_CRUEL_CUES = /\\b(cruel|callous|sadistic|merciless|brutal|ruthless|heartless)\\b/i;

function profileValueKey(value) {
    if (Array.isArray(value)) return value.map(item => normalizeName(item)).filter(Boolean).join(' | ');
    return normalizeName(value);
}

function profileChangeForField(patch, field) {
    const changes = Array.isArray(patch?.profileChanges) ? patch.profileChanges : [];
    return changes.find(raw => raw && typeof raw === 'object' && String(raw.field || '').trim() === field) || null;
}

function profileEvidenceGrounded(evidence, context) {
    const proof = normalizeName(evidence);
    const source = normalizeName(context);
    if (!proof || !source) return false;
    if (source.includes(proof)) return true;
    const stop = new Set(['the','and','that','this','with','from','into','their','they','them','then','when','while','because','after','before','more','less','very','some','current','exchange','npc','player']);
    const proofTokens = proof.split(/\\s+/).filter(token => token.length >= 3 && !stop.has(token));
    const sourceTokens = new Set(source.split(/\\s+/).filter(token => token.length >= 3));
    if (!proofTokens.length) return false;
    const matched = proofTokens.filter(token => sourceTokens.has(token)).length;
    return matched >= Math.min(2, proofTokens.length) && matched / proofTokens.length >= 0.34;
}

function profilePolarityConflict(currentValue, proposedValue) {
    const current = String(currentValue || '');
    const proposed = String(proposedValue || '');
    const currentKind = PROFILE_KIND_CUES.test(current);
    const currentCruel = PROFILE_CRUEL_CUES.test(current);
    const proposedKind = PROFILE_KIND_CUES.test(proposed);
    const proposedCruel = PROFILE_CRUEL_CUES.test(proposed);
    return (currentKind && proposedCruel && !proposedKind) || (currentCruel && proposedKind && !proposedCruel);
}

function appendProfileEvolutionEvidence(npc, change, field, options = {}) {
    const concept = String(change?.concept || '').trim().slice(0, 180);
    const evidence = String(change?.evidence || '').trim().slice(0, 600);
    if (!concept || !evidence) return;
    npc.profileEvolutionEvidence = normalizeProfileEvolutionEvidence([...(npc.profileEvolutionEvidence || []), {
        field,
        mode: String(change?.mode || 'gradual').trim(),
        concept,
        evidence,
        sourceMessageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,
        turn: Number.isInteger(options.turn) ? options.turn : null,
        at: Date.now(),
    }]);
}

function profileEvolutionDecision(npc, patch, field, incomingValue, options = {}) {
    if (!PROFILE_EVOLUTION_FIELDS.has(field)) return { apply: true };
    const currentValue = npc?.[field];
    const currentKey = profileValueKey(currentValue);
    const incomingKey = profileValueKey(incomingValue);
    if (!incomingKey || incomingKey === currentKey) return { apply: Boolean(incomingKey) };

    // A genuinely new dossier may establish its foundational characterization from the
    // first rich scene. This does not authorize later one-scene rewrites.
    if (options.isBootstrap === true) return { apply: true };

    // Sparse existing dossiers can be seeded only through explicit grounded profile
    // evidence. Mannerisms additionally need narration that marks recurrence/habit.
    const change = profileChangeForField(patch, field);
    const context = String(options.profileContext || '');
    const evidence = String(change?.evidence || '').trim();
    const grounded = Boolean(change && evidence && profileEvidenceGrounded(evidence, context));
    if (!currentKey) {
        if (!grounded) return { apply: false };
        if (field === 'mannerisms' && !PROFILE_HABIT_CUES.test(evidence + ' ' + context)) return { apply: false, queue: true, change };
        return { apply: true, queue: true, change };
    }

    if (!grounded) return { apply: false };
    const mode = ['refine', 'gradual', 'explicit', 'batch'].includes(String(change.mode)) ? String(change.mode) : 'gradual';
    const concept = normalizeName(change.concept);
    if (!concept) return { apply: false };

    if (mode === 'refine') {
        if (PROFILE_TRANSITION_CUES.test(evidence + ' ' + String(incomingValue))) return { apply: false, queue: true, change };
        if (profilePolarityConflict(currentValue, incomingValue)) return { apply: false, queue: true, change };
        return { apply: true, queue: true, change };
    }

    if (mode === 'explicit') {
        if (!PROFILE_LASTING_CUES.test(evidence + ' ' + context)) return { apply: false, queue: true, change };
        return { apply: true, queue: true, change };
    }

    if (mode === 'batch') {
        if (!PROFILE_TIME_SKIP_CUES.test(context) || !PROFILE_TRANSITION_CUES.test(evidence + ' ' + context)) return { apply: false, queue: true, change };
        return { apply: true, queue: true, change };
    }

    // Gradual development needs the same labeled concept on a different prior scan.
    const prior = normalizeProfileEvolutionEvidence(npc.profileEvolutionEvidence).find(entry =>
        entry.field === field
        && normalizeName(entry.concept) === concept
        && (entry.sourceMessageId !== options.sourceMessageId || entry.turn !== options.turn));
    return { apply: Boolean(prior), queue: true, change };
}

function applyStablePatch(npc, patch, options = {}) {`,
    'profile evolution helpers',
);
// Remove guarded scalar fields from generic overwrite loop, then apply them explicitly.
scanner = replaceRequired(
    scanner,
    "    const stringFields = ['name', 'role', 'species', 'age', 'apparentAge', 'personality', 'speech', 'background'];",
    "    const stringFields = ['name', 'role', 'species', 'age', 'apparentAge', 'background'];",
    'generic stable scalar fields',
);
scanner = replaceRequired(
    scanner,
    "    if (!locked.has('appearance')) {",
    `    for (const field of ['personality', 'speech']) {
        if (locked.has(field)) continue;
        const value = String(patch?.[field] ?? '').trim();
        if (!value) continue;
        const decision = profileEvolutionDecision(npc, patch, field, value, options);
        if (decision.queue && decision.change) appendProfileEvolutionEvidence(next, decision.change, field, options);
        if (decision.apply) next[field] = value;
    }
    if (!locked.has('appearance')) {`,
    'guarded scalar profile fields',
);
scanner = replaceRequired(
    scanner,
    `    if (!locked.has('behaviorProfile') && Array.isArray(patch?.behaviorProfile)) {
        next.behaviorProfile = appendUnique([], patch.behaviorProfile, limits.behaviorProfile);
    }
    if (!locked.has('mannerisms') && Array.isArray(patch?.mannerisms)) {
        next.mannerisms = appendUnique([], patch.mannerisms, limits.mannerisms);
    }`,
    `    if (!locked.has('behaviorProfile') && Array.isArray(patch?.behaviorProfile)) {
        const incoming = appendUnique([], patch.behaviorProfile, limits.behaviorProfile);
        const decision = profileEvolutionDecision(npc, patch, 'behaviorProfile', incoming, options);
        if (decision.queue && decision.change) appendProfileEvolutionEvidence(next, decision.change, 'behaviorProfile', options);
        if (decision.apply) next.behaviorProfile = incoming;
    }
    if (!locked.has('mannerisms') && Array.isArray(patch?.mannerisms)) {
        const incoming = appendUnique([], patch.mannerisms, limits.mannerisms);
        const decision = profileEvolutionDecision(npc, patch, 'mannerisms', incoming, options);
        if (decision.queue && decision.change) appendProfileEvolutionEvidence(next, decision.change, 'mannerisms', options);
        if (decision.apply) next.mannerisms = incoming;
    }`,
    'guarded profile collections',
);
// Track newly bootstrapped IDs and pass profile evidence context into the stable patcher.
scanner = replaceRequired(
    scanner,
    "    const deletedIds = new Set(state.deletedNpcIds || []);\n    const patchByNpcId = new Map();",
    "    const deletedIds = new Set(state.deletedNpcIds || []);\n    const createdNpcIds = new Set();\n    const patchByNpcId = new Map();",
    'bootstrap id tracking setup',
);
scanner = scanner.replaceAll(
    "                state.npcs.push(created);\n                npc = created;",
    "                state.npcs.push(created);\n                createdNpcIds.add(created.id);\n                npc = created;",
);
scanner = scanner.replaceAll(
    "                            state.npcs.push(created);\n                            npc = created;",
    "                            state.npcs.push(created);\n                            createdNpcIds.add(created.id);\n                            npc = created;",
);
scanner = replaceRequired(
    scanner,
    "            npc = applyStablePatch(npc, patch, { playerName, dossierLimits });",
    "            npc = applyStablePatch(npc, patch, { playerName, dossierLimits, isBootstrap: createdNpcIds.has(npc.id), profileContext: String(options.profileContext || ''), sourceMessageId, turn });",
    'profile stable patch options',
);
// Prompt/output contract for recovery scanner.
scanner = replaceRequired(
    scanner,
    "            behaviorProfile: [], speech: '', mannerisms: [], background: '', keyRelationships: [], memories: [],",
    "            behaviorProfile: [], speech: '', mannerisms: [], profileChanges: [{ field: 'personality|behaviorProfile|speech|mannerisms', mode: 'refine|gradual|explicit|batch', concept: 'short stable concept label', evidence: 'grounded evidence for this durable profile update' }], background: '', keyRelationships: [], memories: [],",
    'recovery profile change contract',
);
scanner = replaceRequired(
    scanner,
    "        '- Stable scalar profile fields should contain only newly established or clearly supported facts. Omit/empty scalar fields rather than guessing.',",
    "        '- Stable scalar profile fields should contain only newly established or clearly supported facts. Omit/empty scalar fields rather than guessing.',\n        '- DURABLE PROFILE EVOLUTION: a new NPC may establish grounded foundational personality/behavior/speech/mannerisms from its first rich scene. For an EXISTING established field, never rewrite personality, behaviorProfile, speech, or mannerisms merely because one scene looks different. Any genuine change requires a matching profileChanges entry with field, mode, stable concept label, and concrete evidence. refine adds compatible detail only and must not smuggle no-longer/became/increasingly transitions or morality flips. gradual development requires the same concept to be independently supported on a later scan. explicit requires narration that clearly establishes a lasting/corrective change. batch requires an actual narrated time skip plus development across that skipped period. A one-off gesture is not a permanent mannerism; mannerism seeding needs recurring/habit language or repeated confirmation.',",
    'recovery durable evolution rule',
);
// Targeted refresh gets the same evidence channel and rules.
scanner = replaceRequired(
    scanner,
    "        'If the chat does not establish a scalar field, leave it empty. Never invent facts.',",
    "        'If the chat does not establish a scalar field, leave it empty. Never invent facts.',\n        'DURABLE PROFILE EVOLUTION: for established personality/behaviorProfile/speech/mannerisms, include a profileChanges entry only when the supplied chat actually supports refine, gradual, explicit, or batch development. refine must remain compatible with existing identity; gradual requires repeated same-concept evidence; explicit requires a lasting/correction cue; batch requires a real narrated time skip. One-off gestures are not mannerisms. Sparse blank fields may be seeded when the evidence directly establishes them.',",
    'targeted durable evolution rule',
);
scanner = replaceRequired(
    scanner,
    "appearanceFormChanges: null, personality: '', behaviorProfile: null, speech: '', mannerisms: null, background:",
    "appearanceFormChanges: null, personality: '', behaviorProfile: null, speech: '', mannerisms: null, profileChanges: null, background:",
    'targeted profile contract',
);
write('v03/scanner.js', scanner);

// Foreground capture receives the same compact evolution contract.
let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',",
    "        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',\n        'DURABLE PROFILE EVOLUTION: new NPCs may establish grounded foundational personality/behavior/speech/mannerisms in their first rich scene. For an EXISTING established personality, behaviorProfile, speech, or mannerisms, any real rewrite requires profileChanges with field, mode refine|gradual|explicit|batch, a short stable concept label, and concrete evidence. refine is compatible detail only, not no-longer/became/increasingly change or a morality flip. gradual means sustained same-concept development and may require later confirmation. explicit requires a clearly lasting/corrective change in this exchange. batch requires an actual narrated time skip plus development across it. Never promote a one-off gesture into a mannerism unless narration marks it recurring/habitual.',",
    'foreground profile rule',
);
injection = replaceRequired(
    injection,
    "\"personality\":\"\",\"behaviorProfile\":[],\"speech\":\"\",\"mannerisms\":[],\"background\":\"\"",
    "\"personality\":\"\",\"behaviorProfile\":[],\"speech\":\"\",\"mannerisms\":[],\"profileChanges\":[{\"field\":\"personality|behaviorProfile|speech|mannerisms\",\"mode\":\"refine|gradual|explicit|batch\",\"concept\":\"short stable concept\",\"evidence\":\"grounded durable-change evidence\"}],\"background\":\"\"",
    'foreground profile output contract',
);
write('v03/injection.js', injection);

// Supply current exchange evidence to automatic/embedded scans. Targeted Refresh gets its
// explicit recent-history window because it is a deliberate maintenance action.
let engine = read('v03/engine.js');
engine = replaceRequired(
    engine,
    "function relationshipContextForExchange(exchange) {",
    `function profileContextForWindow(chat = [], messageId = null, depth = 8) {
    const end = Number.isInteger(messageId) ? Math.min(chat.length - 1, messageId) : chat.length - 1;
    const rows = [];
    for (let i = Math.max(0, end - Math.max(2, Number(depth) || 8) * 2); i <= end; i += 1) {
        const message = chat[i];
        if (!message || message.is_system) continue;
        rows.push(String(message.mes || '').slice(0, 8000));
    }
    return rows.join('\\n');
}

function relationshipContextForExchange(exchange) {`,
    'profile context helper',
);
engine = replaceRequired(
    engine,
    "                relationshipContext: relationshipContextForExchange(exchange),\n                dossierLimits:",
    "                relationshipContext: relationshipContextForExchange(exchange),\n                profileContext: relationshipContextForExchange(exchange),\n                dossierLimits:",
    'separate automatic profile context',
);
// Same marker appears in embedded block after phase 1. Replace remaining occurrence too.
engine = engine.replace(
    "                relationshipContext: relationshipContextForExchange(exchange),\n                dossierLimits: settings.dossierLimits,",
    "                relationshipContext: relationshipContextForExchange(exchange),\n                profileContext: relationshipContextForExchange(exchange),\n                dossierLimits: settings.dossierLimits,",
);
engine = replaceRequired(
    engine,
    "                allowHistoricalProfilePatches: true,\n                relationshipCaps:",
    "                allowHistoricalProfilePatches: true,\n                profileContext: profileContextForWindow(liveChat, messageId, settings.scanDepth),\n                relationshipCaps:",
    'targeted refresh profile context',
);
write('v03/engine.js', engine);

let changelog = read('CHANGELOG.md');
const line = '- Phase 3 restores durable characterization safeguards for Personality, Behavioral Profile, Speech, and Mannerisms. New NPCs can still establish a rich baseline immediately, but established fields require grounded refine/gradual/explicit/batch evidence; gradual concepts need cross-scan confirmation, explicit changes need lasting-change cues, batch changes need a real narrated time skip, refinement cannot hide identity flips, and one-off gestures cannot become permanent mannerisms.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.2\n\n', '## v0.4.2\n\n' + line + '\n', 'phase-3 changelog');
write('CHANGELOG.md', changelog);
console.log('Applied NPC State 0.4.2 phase 3 durable profile evolution safeguards');
