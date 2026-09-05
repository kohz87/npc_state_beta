import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.23 marker: ' + label);
    return source.replace(from, to);
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    if (start < 0) {
        if (source.includes(replacement)) return source;
        throw new Error('Missing v0.4.23 range start: ' + label);
    }
    const end = source.indexOf(endMarker, start);
    if (end < 0) throw new Error('Missing v0.4.23 range end: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

let schema = fs.readFileSync('v03/schema.js', 'utf8');
schema = replaceRequired(
    schema,
    "export const DEFAULT_RELATIONSHIP_CAPS = Object.freeze({ ordinary: 1, meaningful: 2, major: 5, extreme: 10 });\n",
    `export const DEFAULT_RELATIONSHIP_CAPS = Object.freeze({ ordinary: 1, meaningful: 2, major: 5, extreme: 10 });
export function normalizeRelationshipCaps(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(DEFAULT_RELATIONSHIP_CAPS).map(([impact, fallback]) => {
        const raw = source[impact] ?? fallback;
        const number = Number(raw);
        return [impact, Number.isFinite(number) ? Math.max(0, number) : fallback];
    }));
}
`,
    'shared relationship cap normalizer',
);
fs.writeFileSync('v03/schema.js', schema);

let policy = fs.readFileSync('v03/relationship-policy.js', 'utf8');
if (!policy.startsWith("import { DEFAULT_RELATIONSHIP_CAPS, normalizeRelationshipCaps } from './schema.js';")) {
    policy = "import { DEFAULT_RELATIONSHIP_CAPS, normalizeRelationshipCaps } from './schema.js';\n\n" + policy;
}
{
    const startMarker = 'export function relationshipMechanicsPrompt() {';
    const endMarker = 'export function relationshipCustomCriteriaPrompt';
    const replacement = `export function relationshipMechanicsPrompt(caps = DEFAULT_RELATIONSHIP_CAPS) {
    const effectiveCaps = normalizeRelationshipCaps(caps);
    const ordinaryUnit = effectiveCaps.ordinary === 1 ? 'point' : 'points';
    return [
        'RELATIONSHIP NUMERIC CONTRACT:',
        \`- ordinary: at most \${effectiveCaps.ordinary} raw \${ordinaryUnit} on at most 1 supported axis; meaningful: at most \${effectiveCaps.meaningful} per supported axis and at most 2 axes; major: at most \${effectiveCaps.major} per supported axis and at most 3 axes; extreme: at most \${effectiveCaps.extreme} per supported axis and at most 4 axes. These are the effective configured ceilings, not targets.\`,
        '- priority orders only supported nonzero axes from strongest/most central to weakest so impact-tier overflow can be resolved. Do not list unsupported or zero axes.',
        '- RELATIONSHIP REPEATS AND GATES: repeated aftermath/restatement is zero unless a genuinely new relationship-changing development occurs. Runtime checkpoints outward depth at 25/50/75/90 independently by axis and direction: crossing 25 needs meaningful+, 50 major+ with raw 3, 75 extreme with raw 5, and 90 extreme relationship-defining with raw 8. Movement toward neutral is not gate-blocked. Never inflate impact/delta to force a gate.',
        '- Raw deltas are pre-inertia evidence weights. Runtime applies the existing depth resistance and retains accepted fractional progress; do not pre-discount raw deltas for inertia.',
        '- Relationship Summary may describe accepted depth/context, but it must not become evidence for a new delta or become deeper/more absolute than the accepted state supports.',
    ].join('\\n');
}

`;
    policy = replaceRange(policy, startMarker, endMarker, replacement, 'settings-aware relationship mechanics prompt');
}
fs.writeFileSync('v03/relationship-policy.js', policy);

let injection = fs.readFileSync('v03/injection.js', 'utf8');
injection = replaceRequired(
    injection,
    '        relationshipMechanicsPrompt(),',
    '        relationshipMechanicsPrompt(settings.relationshipCaps),',
    'foreground effective relationship caps',
);
fs.writeFileSync('v03/injection.js', injection);

let scanner = fs.readFileSync('v03/scanner.js', 'utf8');
scanner = replaceRequired(
    scanner,
    '    normalizeRelationship,\n',
    '    normalizeRelationship,\n    normalizeRelationshipCaps,\n',
    'runtime relationship cap normalizer import',
);
scanner = replaceRequired(
    scanner,
    "export function buildScanPrompt({ state, chat, assistantMessageId, scanDepth = 8, relationshipCriteria = '', memoryCriteria = '', playerName = '', dossierLimits = {}, admissionMode = 'balanced' }) {",
    "export function buildScanPrompt({ state, chat, assistantMessageId, scanDepth = 8, relationshipCriteria = '', relationshipCaps = DEFAULT_RELATIONSHIP_CAPS, memoryCriteria = '', playerName = '', dossierLimits = {}, admissionMode = 'balanced' }) {",
    'recovery relationship caps argument',
);
scanner = replaceRequired(
    scanner,
    '        relationshipMechanicsPrompt(),',
    '        relationshipMechanicsPrompt(relationshipCaps),',
    'recovery effective relationship caps',
);
scanner = replaceRequired(
    scanner,
    "        '- Current exchange decides relationship changes. Older history may recover stable profile facts and durable memories, but must NEVER replay relationship deltas.',",
    "        '- Current exchange decides relationship changes. Older context may establish prior attitudes, relationship baselines, already-counted developments, stable profile facts, and durable memories so you can judge what is genuinely new. It is continuity only: never treat an older development as occurring again or replay relationship deltas.',",
    'recovery older-context continuity semantics',
);
scanner = replaceRequired(
    scanner,
    "        '- Older history is context for stable profile/memory and relationship continuity only. It may help interpret what changed, but it never supplies fresh relationship-event quotations or replays prior deltas.',",
    "        '- Older history is context for stable profile/memory and relationship continuity only. It may establish prior attitudes, baselines, and already-counted developments and may help interpret what changed, but it never supplies fresh relationship-event quotations or replays prior deltas.',",
    'recovery prior-attitude allowance',
);
scanner = replaceRequired(
    scanner,
    '`OLDER CONTEXT FOR PROFILE/MEMORY ONLY:\\n${JSON.stringify(history)}`',
    '`OLDER CONTEXT — CONTINUITY ONLY; NOT NEW EVENT EVIDENCE:\\n${JSON.stringify(history)}`',
    'recovery older-context heading',
);
scanner = replaceRequired(
    scanner,
    '    const cap = Math.max(0, Number(caps?.[impact] ?? DEFAULT_RELATIONSHIP_CAPS[impact] ?? 0));',
    "    const effectiveCaps = normalizeRelationshipCaps(caps);\n    const cap = impact === 'none' ? 0 : Number(effectiveCaps[impact] ?? 0);",
    'runtime scoring shared cap normalization',
);
fs.writeFileSync('v03/scanner.js', scanner);

let engine = fs.readFileSync('v03/engine.js', 'utf8');
engine = replaceRequired(
    engine,
    '                relationshipCriteria: settings.relationshipCriteria,\n                memoryCriteria: settings.memoryCriteria,',
    '                relationshipCriteria: settings.relationshipCriteria,\n                relationshipCaps: settings.relationshipCaps,\n                memoryCriteria: settings.memoryCriteria,',
    'recovery prompt relationship caps plumbing',
);
fs.writeFileSync('v03/engine.js', engine);

let index = fs.readFileSync('v03/index.js', 'utf8');
index = replaceRequired(
    index,
    "import { DEFAULT_BIRTHDAY_RANDOM_CALENDAR, DEFAULT_RELATIONSHIP_CAPS, DOSSIER_LIMIT_DEFAULTS, NPC_STATE_VERSION, normalizeScannerResponseTokens, normalizeBirthdayFillMode, normalizeDossierLimits, normalizeNpcAdmissionMode } from './schema.js';",
    "import { DEFAULT_BIRTHDAY_RANDOM_CALENDAR, DEFAULT_RELATIONSHIP_CAPS, DOSSIER_LIMIT_DEFAULTS, NPC_STATE_VERSION, normalizeScannerResponseTokens, normalizeBirthdayFillMode, normalizeDossierLimits, normalizeNpcAdmissionMode, normalizeRelationshipCaps } from './schema.js';",
    'settings relationship cap normalizer import',
);
index = replaceRequired(
    index,
    '    settings.relationshipCaps = { ...DEFAULT_RELATIONSHIP_CAPS, ...(settings.relationshipCaps || {}) };',
    '    settings.relationshipCaps = normalizeRelationshipCaps(settings.relationshipCaps);',
    'effective settings relationship cap normalization',
);
fs.writeFileSync('v03/index.js', index);

console.log('Applied NPC State 0.4.23 older-context and relationship-cap prompt alignment');
