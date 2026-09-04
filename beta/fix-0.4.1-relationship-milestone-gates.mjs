import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing relationship-gate marker: ' + label);
    return source.replace(from, to);
}

// 1) Restore hidden directional milestone state to the normalized dossier schema.
let schema = read('v03/schema.js');
schema = replaceRequired(
    schema,
    "export const DEFAULT_RELATIONSHIP_CAPS = Object.freeze({ ordinary: 1, meaningful: 2, major: 5, extreme: 10 });\n",
    "export const DEFAULT_RELATIONSHIP_CAPS = Object.freeze({ ordinary: 1, meaningful: 2, major: 5, extreme: 10 });\nexport const RELATIONSHIP_MILESTONE_THRESHOLDS = Object.freeze([25, 50, 75, 90]);\nexport const RELATIONSHIP_MILESTONE_REQUIREMENTS = Object.freeze({ 25: 'meaningful', 50: 'major', 75: 'extreme', 90: 'extreme' });\nexport const RELATIONSHIP_MILESTONE_MIN_RAW = Object.freeze({ 25: 1, 50: 3, 75: 5, 90: 8 });\nexport const RELATIONSHIP_MILESTONE_LIMIT = RELATIONSHIP_AXES.length * 2 * RELATIONSHIP_MILESTONE_THRESHOLDS.length;\n",
    'milestone constants',
);
schema = replaceRequired(
    schema,
    "export function normalizeRelationship(value = {}) {\n    return Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, clampRelationship(value?.[axis])]));\n}\n\nexport function emptyRelationshipChange() {",
    `export function normalizeRelationship(value = {}) {
    return Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, clampRelationship(value?.[axis])]));
}

function normalizeMilestonePolarity(value) {
    const number = Number(value);
    return number > 0 ? 1 : (number < 0 ? -1 : 0);
}

function milestoneIdentity(entry) {
    return String(entry?.axis || '') + ':' + String(entry?.polarity || 0) + ':' + String(entry?.threshold || 0);
}

function inferredRelationshipMilestones(relationship = DEFAULT_RELATIONSHIP, { includeBoundary = false, reason = 'Existing relationship depth predates milestone tracking.' } = {}) {
    const rel = normalizeRelationship(relationship || DEFAULT_RELATIONSHIP);
    const out = [];
    for (const axis of RELATIONSHIP_AXES) {
        const score = Number(rel[axis]) || 0;
        const polarity = Math.sign(score);
        if (!polarity) continue;
        const magnitude = Math.abs(score);
        for (const threshold of RELATIONSHIP_MILESTONE_THRESHOLDS) {
            const established = includeBoundary ? magnitude >= threshold : magnitude > threshold;
            if (!established) continue;
            out.push({
                axis,
                polarity,
                threshold,
                reason,
                evidence: '',
                sourceMessageId: null,
                turn: null,
                at: null,
                inferred: true,
            });
        }
    }
    return out;
}

export function normalizeRelationshipMilestones(value, relationship = DEFAULT_RELATIONSHIP, { inferFromRelationship = true, includeBoundary = false } = {}) {
    const source = Array.isArray(value) ? value : [];
    const map = new Map();
    for (const raw of source) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const axis = RELATIONSHIP_AXES.includes(String(raw.axis || '').trim().toLocaleLowerCase()) ? String(raw.axis).trim().toLocaleLowerCase() : '';
        const polarity = normalizeMilestonePolarity(raw.polarity);
        const threshold = Number(raw.threshold);
        if (!axis || !polarity || !RELATIONSHIP_MILESTONE_THRESHOLDS.includes(threshold)) continue;
        const entry = {
            axis,
            polarity,
            threshold,
            reason: text(raw.reason, 300) || 'Relationship milestone established.',
            evidence: text(raw.evidence, 500),
            sourceMessageId: Number.isInteger(raw.sourceMessageId) ? raw.sourceMessageId : null,
            turn: Number.isInteger(raw.turn) ? raw.turn : null,
            at: Number(raw.at) || null,
            inferred: raw.inferred === true,
        };
        map.set(milestoneIdentity(entry), entry);
    }
    if (inferFromRelationship) {
        for (const entry of inferredRelationshipMilestones(relationship, { includeBoundary })) {
            const key = milestoneIdentity(entry);
            if (!map.has(key)) map.set(key, entry);
        }
    }
    return [...map.values()]
        .sort((a, b) => RELATIONSHIP_AXES.indexOf(a.axis) - RELATIONSHIP_AXES.indexOf(b.axis)
            || a.polarity - b.polarity
            || a.threshold - b.threshold)
        .slice(0, RELATIONSHIP_MILESTONE_LIMIT);
}

export function relationshipMilestoneUnlocked(milestones, axis, polarity, threshold) {
    const key = String(axis || '').trim().toLocaleLowerCase();
    const sign = normalizeMilestonePolarity(polarity);
    const point = Number(threshold);
    if (!key || !sign || !RELATIONSHIP_MILESTONE_THRESHOLDS.includes(point)) return false;
    return normalizeRelationshipMilestones(milestones, DEFAULT_RELATIONSHIP, { inferFromRelationship: false })
        .some(entry => entry.axis === key && entry.polarity === sign && entry.threshold === point);
}

export function applyRelationshipMilestoneCrossings(milestones, crossings = [], { reason = '', evidence = '', sourceMessageId = null, turn = null, at = Date.now() } = {}) {
    const map = new Map(normalizeRelationshipMilestones(milestones, DEFAULT_RELATIONSHIP, { inferFromRelationship: false })
        .map(entry => [milestoneIdentity(entry), entry]));
    for (const raw of Array.isArray(crossings) ? crossings : []) {
        const axis = RELATIONSHIP_AXES.includes(String(raw?.axis || '').trim().toLocaleLowerCase()) ? String(raw.axis).trim().toLocaleLowerCase() : '';
        const polarity = normalizeMilestonePolarity(raw?.polarity);
        const threshold = Number(raw?.threshold);
        if (!axis || !polarity || !RELATIONSHIP_MILESTONE_THRESHOLDS.includes(threshold)) continue;
        const entry = {
            axis,
            polarity,
            threshold,
            reason: text(reason || raw.reason, 300) || ('Relationship crossed the ' + (polarity > 0 ? '+' : '-') + threshold + ' ' + axis + ' milestone.'),
            evidence: text(evidence || raw.evidence, 500),
            sourceMessageId: Number.isInteger(sourceMessageId) ? sourceMessageId : null,
            turn: Number.isInteger(turn) ? turn : null,
            at: Number(at) || Date.now(),
            inferred: false,
        };
        map.set(milestoneIdentity(entry), entry);
    }
    return normalizeRelationshipMilestones([...map.values()], DEFAULT_RELATIONSHIP, { inferFromRelationship: false });
}

export function emptyRelationshipChange() {`,
    'milestone normalization helpers',
);
schema = replaceRequired(
    schema,
    "    const appearanceForms = normalizeAppearanceForms(input.appearanceForms);\n    const requestedCurrentForm = text(input.currentForm, 80);",
    "    const relationship = normalizeRelationship(input.relationship || DEFAULT_RELATIONSHIP);\n    const hasMilestoneState = Object.prototype.hasOwnProperty.call(input, 'relationshipMilestones');\n    const relationshipMilestones = normalizeRelationshipMilestones(input.relationshipMilestones, relationship, { inferFromRelationship: !hasMilestoneState });\n    const appearanceForms = normalizeAppearanceForms(input.appearanceForms);\n    const requestedCurrentForm = text(input.currentForm, 80);",
    'npc milestone setup',
);
schema = replaceRequired(
    schema,
    "        relationship: normalizeRelationship(input.relationship || DEFAULT_RELATIONSHIP),\n        relationshipSummary: text(input.relationshipSummary, 1000),",
    "        relationship,\n        relationshipMilestones,\n        relationshipSummary: text(input.relationshipSummary, 1000),",
    'stored milestone state',
);
write('v03/schema.js', schema);

// 2) Enforce checkpoint gates in backend relationship application.
let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "    DEFAULT_RELATIONSHIP_CAPS,\n    RELATIONSHIP_AXES,\n    STABLE_PROFILE_FIELDS,",
    "    DEFAULT_RELATIONSHIP_CAPS,\n    RELATIONSHIP_AXES,\n    RELATIONSHIP_MILESTONE_MIN_RAW,\n    RELATIONSHIP_MILESTONE_REQUIREMENTS,\n    RELATIONSHIP_MILESTONE_THRESHOLDS,\n    STABLE_PROFILE_FIELDS,\n    applyRelationshipMilestoneCrossings,",
    'scanner milestone imports head',
);
scanner = replaceRequired(
    scanner,
    "    normalizeRelationship,\n    normalizeState,",
    "    normalizeRelationship,\n    normalizeState,\n    relationshipMilestoneUnlocked,",
    'scanner milestone imports tail',
);
scanner = replaceRequired(
    scanner,
    "function relationshipDeltaForPatch(patch, caps = DEFAULT_RELATIONSHIP_CAPS) {",
    `function relationshipImpactRank(value) {
    return { none: 0, ordinary: 1, meaningful: 2, major: 3, extreme: 4 }[String(value || '').trim()] || 0;
}

function relationshipMilestoneEventQualifies(change, axis, threshold, caps = DEFAULT_RELATIONSHIP_CAPS) {
    const requiredImpact = RELATIONSHIP_MILESTONE_REQUIREMENTS[Number(threshold)] || 'extreme';
    if (relationshipImpactRank(change?.impact) < relationshipImpactRank(requiredImpact)) return false;
    const rawWeight = Math.abs(Number(change?.delta?.[axis]) || 0);
    const tierCap = Math.max(0, Number(caps?.[change?.impact] ?? DEFAULT_RELATIONSHIP_CAPS[change?.impact] ?? 0));
    const stockMinimum = Math.max(1, Number(RELATIONSHIP_MILESTONE_MIN_RAW[Number(threshold)]) || 1);
    const requiredRaw = tierCap > 0 ? Math.min(tierCap, stockMinimum) : stockMinimum;
    return rawWeight >= requiredRaw;
}

function gatedRelationshipAxis(currentValue, proposedDelta, axis, milestones, change, caps = DEFAULT_RELATIONSHIP_CAPS) {
    const current = Math.max(-100, Math.min(100, Math.round(Number(currentValue) || 0)));
    const delta = Math.round(Number(proposedDelta) || 0);
    const desired = Math.max(-100, Math.min(100, current + delta));
    if (!delta || desired === current) return { value: current, crossings: [] };

    const currentPolarity = Math.sign(current);
    const desiredPolarity = Math.sign(desired);
    const movementPolarity = desiredPolarity || Math.sign(delta);
    const currentMagnitude = currentPolarity === movementPolarity ? Math.abs(current) : 0;
    const desiredMagnitude = Math.abs(desired);

    // Movement toward neutral never meets an outward milestone gate.
    if (currentPolarity && desiredPolarity === currentPolarity && desiredMagnitude < Math.abs(current)) {
        return { value: desired, crossings: [] };
    }

    let allowedMagnitude = desiredMagnitude;
    const crossings = [];
    for (const threshold of RELATIONSHIP_MILESTONE_THRESHOLDS) {
        if (threshold < currentMagnitude) continue;
        if (relationshipMilestoneUnlocked(milestones, axis, movementPolarity, threshold)) continue;
        if (allowedMagnitude < threshold) continue;

        const qualifies = relationshipMilestoneEventQualifies(change, axis, threshold, caps);
        if (allowedMagnitude === threshold) {
            if (currentMagnitude < threshold && qualifies) crossings.push({ axis, polarity: movementPolarity, threshold });
            break;
        }
        if (qualifies) {
            crossings.push({ axis, polarity: movementPolarity, threshold });
            continue;
        }
        allowedMagnitude = threshold;
        break;
    }
    return { value: movementPolarity * allowedMagnitude, crossings };
}

function relationshipDeltaForPatch(patch, caps = DEFAULT_RELATIONSHIP_CAPS) {`,
    'relationship gate helpers',
);
scanner = replaceRequired(
    scanner,
    `function applyRelationshipChange(npc, patch, options) {
    const change = relationshipDeltaForPatch(patch, options.relationshipCaps);
    if (change.impact === 'none') return npc;
    const next = structuredClone(npc);
    const current = normalizeRelationship(next.relationship);
    const updated = {};
    for (const axis of RELATIONSHIP_AXES) updated[axis] = Math.max(-100, Math.min(100, current[axis] + change.delta[axis]));
    next.relationship = updated;
    const event = {
        ...change,
        sourceMessageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,
        turn: Number.isInteger(options.turn) ? options.turn : null,
        at: Date.now(),
    };
    next.lastRelationshipChange = event;
    next.relationshipHistory = [...(next.relationshipHistory || []), event].slice(-24);
    return next;
}`,
    `function applyRelationshipChange(npc, patch, options) {
    const caps = options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS;
    const change = relationshipDeltaForPatch(patch, caps);
    if (change.impact === 'none') return npc;
    const next = structuredClone(npc);
    const current = normalizeRelationship(next.relationship);
    const updated = {};
    const crossings = [];
    const actualDelta = {};
    for (const axis of RELATIONSHIP_AXES) {
        const gated = gatedRelationshipAxis(current[axis], change.delta[axis], axis, next.relationshipMilestones, change, caps);
        updated[axis] = gated.value;
        actualDelta[axis] = gated.value - current[axis];
        crossings.push(...gated.crossings);
    }
    next.relationshipMilestones = applyRelationshipMilestoneCrossings(next.relationshipMilestones, crossings, {
        reason: change.reason,
        evidence: change.evidence,
        sourceMessageId: options.sourceMessageId,
        turn: options.turn,
    });
    if (!Object.values(actualDelta).some(Boolean)) return next;
    next.relationship = updated;
    const event = {
        ...change,
        delta: actualDelta,
        sourceMessageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,
        turn: Number.isInteger(options.turn) ? options.turn : null,
        at: Date.now(),
    };
    next.lastRelationshipChange = event;
    next.relationshipHistory = [...(next.relationshipHistory || []), event].slice(-24);
    return next;
}`,
    'gated relationship application',
);
scanner = replaceRequired(
    scanner,
    "        '- Only propose a relationshipChange when the current exchange contains concrete evidence. If unsure, use impact none and zero deltas.',",
    "        '- Only propose a relationshipChange when the current exchange contains concrete evidence. If unsure, use impact none and zero deltas.',\n        '- RELATIONSHIP MILESTONE GATES are enforced by NPC State at absolute depth 25, 50, 75, and 90 independently for each axis and positive/negative polarity. Ordinary evidence may reach a locked boundary but cannot deepen beyond it. Crossing 25 requires meaningful-or-stronger evidence; crossing 50 requires a major-or-stronger event with at least 3 raw points on that axis; crossing 75 requires extreme evidence with at least 5 raw points; crossing 90 requires extreme relationship-defining evidence with at least 8 raw points. Movement back toward neutral is never gate-blocked. Classify impact and deltas from the story honestly; never inflate them merely to open a gate.',",
    'recovery scanner gate semantics',
);
write('v03/scanner.js', scanner);

// 3) Foreground scanner gets the same gate semantics, while milestone unlock state stays private.
let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak.',",
    "        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak.',\n        'RELATIONSHIP MILESTONE GATES: absolute relationship depth is checkpointed at 25, 50, 75, and 90 independently per axis and positive/negative direction. Ordinary evidence may reach a locked boundary but cannot deepen beyond it. Crossing 25 requires meaningful-or-stronger evidence; 50 requires major-or-stronger with at least 3 raw points on that axis; 75 requires extreme with at least 5 raw points; 90 requires an extreme relationship-defining event with at least 8 raw points. Movement toward neutral is never gate-blocked. Do not inflate impact or delta merely to open a gate; the backend is authoritative.',",
    'foreground gate semantics',
);
write('v03/injection.js', injection);

// 4) Restore the stock evidence rubric and upgrade only the exact pre-gate stock setting.
let index = read('v03/index.js');
const oldCriteria = `Relationship deltas measure only changes caused by the current USER+ASSISTANT exchange.
Trust: confidence in the player's reliability, honesty, competence, safety, or judgment.
Affection: warmth, fondness, attachment, tenderness, or personal liking toward the player.
Desire: attraction or intimate interest. Never infer it from friendliness, gratitude, beauty, proximity, or generic affection.
Tension: interpersonal strain, fear, suspicion, anger, unresolved conflict, pressure, or charged friction.
Ordinary events should usually change 0-1 points. Meaningful events may change up to 2, major events up to 5, extreme life-defining events up to 10. Zero is correct when evidence is weak or merely repeated from earlier context.`;
const newCriteria = `Relationship deltas measure only genuinely NEW changes caused by the current USER+ASSISTANT exchange. Routine continuation, repeated aftermath, greetings, neutral transactions, and already-scored beats are normally zero.
Trust: confidence in the player's reliability, honesty, competence, safety, or judgment. Trust is not obedience.
Affection: warmth, fondness, attachment, tenderness, or personal liking toward the player. Affection is not devotion, clinginess, jealousy, or self-erasure.
Desire: attraction or intimate interest. Positive Desire requires explicit attraction/romantic/intimate/physical evidence. Never infer it from friendliness, gratitude, beauty, rescue, proximity, trust, or generic affection.
Tension: interpersonal strain, fear, suspicion, anger, unresolved conflict, pressure, or charged friction.
Ordinary events may change up to 1 point on one supported axis. Meaningful events may change up to 2 per supported axis, major up to 5, extreme up to 10. Every moved axis needs its own concrete evidence.
RELATIONSHIP MILESTONES: outward depth is gated independently by axis and direction at 25, 50, 75, and 90. Ordinary evidence may reach 25 but cannot deepen past a locked gate. Crossing 25 requires meaningful-or-stronger evidence; 50 requires major-or-stronger with at least 3 raw points on that axis; 75 requires extreme with at least 5 raw points; 90 requires an extreme relationship-defining event with at least 8 raw points. Movement back toward neutral is never checkpoint-blocked. Never inflate a tier or delta just to pass a gate.`;
index = replaceRequired(
    index,
    'const DEFAULT_RELATIONSHIP_CRITERIA = `' + oldCriteria + '`;',
    'const PRE_GATE_RELATIONSHIP_CRITERIA = `' + oldCriteria + '`;\n\nconst DEFAULT_RELATIONSHIP_CRITERIA = `' + newCriteria + '`;',
    'default relationship criteria',
);
index = replaceRequired(
    index,
    "    if (legacyPositivePrompt !== undefined) settings.portraitPositivePrompt = legacyPositivePrompt;\n    settings.schemaVersion = SETTINGS_SCHEMA;",
    "    if (legacyPositivePrompt !== undefined) settings.portraitPositivePrompt = legacyPositivePrompt;\n    if (String(settings.relationshipCriteria || '').trim() === PRE_GATE_RELATIONSHIP_CRITERIA.trim()) settings.relationshipCriteria = DEFAULT_RELATIONSHIP_CRITERIA;\n    settings.schemaVersion = SETTINGS_SCHEMA;",
    'stock criteria migration',
);
write('v03/index.js', index);

// 5) Manual relationship edits are authoritative and infer any manually established gates.
let engine = read('v03/engine.js');
engine = replaceRequired(
    engine,
    "    normalizeNpc,\n    normalizeRelationship,\n    normalizeState,",
    "    normalizeNpc,\n    normalizeRelationship,\n    normalizeRelationshipMilestones,\n    normalizeState,",
    'engine milestone import',
);
engine = replaceRequired(
    engine,
    "                const before = normalizeRelationship(current.relationship);\n                const after = normalizeRelationship(patch.relationship);\n                const delta = Object.fromEntries(Object.keys(before).map(axis => [axis, after[axis] - before[axis]]));",
    "                const before = normalizeRelationship(current.relationship);\n                const after = normalizeRelationship(patch.relationship);\n                nextRaw.relationshipMilestones = normalizeRelationshipMilestones(current.relationshipMilestones, after, { inferFromRelationship: true, includeBoundary: true });\n                const delta = Object.fromEntries(Object.keys(before).map(axis => [axis, after[axis] - before[axis]]));",
    'manual milestone inference',
);
write('v03/engine.js', engine);

// 6) Changelog.
let changelog = read('CHANGELOG.md');
const line = '- Restored deterministic relationship milestone gates from the pre-v0.3 relationship model: each axis/direction now checkpoints at 25/50/75/90, requires meaningful/major/extreme evidence to deepen past those boundaries, records hidden directional unlock history, allows movement toward neutral, preserves already-passed legacy depths, and upgrades the exact old stock evidence rubric without overwriting custom rubrics.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line + '\n', 'changelog heading');
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.1 deterministic relationship milestone gates');
