import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase-1 marker: ' + label);
    return source.replace(from, to);
}

// ---------------------------------------------------------------------------
// Schema: restore fractional progress + a short hidden evidence-dedupe ledger.
// ---------------------------------------------------------------------------
let schema = read('v03/schema.js');
schema = replaceRequired(
    schema,
    "export const DEFAULT_RELATIONSHIP_CAPS = Object.freeze({ ordinary: 1, meaningful: 2, major: 5, extreme: 10 });\n",
    "export const DEFAULT_RELATIONSHIP_CAPS = Object.freeze({ ordinary: 1, meaningful: 2, major: 5, extreme: 10 });\nexport const DEFAULT_RELATIONSHIP_PROGRESS = Object.freeze({ trust: 0, affection: 0, desire: 0, tension: 0 });\nexport const RELATIONSHIP_EVIDENCE_HISTORY_LIMIT = 6;\n",
    'relationship progress constants',
);
schema = replaceRequired(
    schema,
    "export function normalizeRelationship(value = {}) {\n    return Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, clampRelationship(value?.[axis])]));\n}\n\nfunction normalizeMilestonePolarity(value) {",
    `export function normalizeRelationship(value = {}) {
    return Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, clampRelationship(value?.[axis])]));
}

export function normalizeRelationshipProgress(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(RELATIONSHIP_AXES.map(axis => {
        const number = Number(source[axis]);
        const safe = Number.isFinite(number) ? Math.max(-0.999999, Math.min(0.999999, number)) : 0;
        return [axis, Math.abs(safe) < 0.000001 ? 0 : Number(safe.toFixed(6))];
    }));
}

export function normalizeRelationshipEvidenceHistory(value = []) {
    const source = Array.isArray(value) ? value : [];
    return source.slice(-RELATIONSHIP_EVIDENCE_HISTORY_LIMIT * 2).map(raw => ({
        impact: ['ordinary', 'meaningful', 'major', 'extreme'].includes(String(raw?.impact)) ? String(raw.impact) : 'ordinary',
        reason: text(raw?.reason, 800),
        evidence: text(raw?.evidence, 800),
        sourceMessageId: Number.isInteger(raw?.sourceMessageId) ? raw.sourceMessageId : null,
        turn: Number.isInteger(raw?.turn) ? raw.turn : null,
        at: Number(raw?.at) || null,
    })).filter(item => item.reason || item.evidence).slice(-RELATIONSHIP_EVIDENCE_HISTORY_LIMIT);
}

function normalizeMilestonePolarity(value) {`,
    'relationship progress normalization',
);
schema = replaceRequired(
    schema,
    "    const relationship = normalizeRelationship(input.relationship || DEFAULT_RELATIONSHIP);\n    const hasMilestoneState = Object.prototype.hasOwnProperty.call(input, 'relationshipMilestones');",
    "    const relationship = normalizeRelationship(input.relationship || DEFAULT_RELATIONSHIP);\n    const relationshipProgress = normalizeRelationshipProgress(input.relationshipProgress || DEFAULT_RELATIONSHIP_PROGRESS);\n    const relationshipEvidenceHistory = normalizeRelationshipEvidenceHistory(input.relationshipEvidenceHistory);\n    const hasMilestoneState = Object.prototype.hasOwnProperty.call(input, 'relationshipMilestones');",
    'relationship progress npc setup',
);
schema = replaceRequired(
    schema,
    "        relationship,\n        relationshipMilestones,\n        relationshipSummary:",
    "        relationship,\n        relationshipProgress,\n        relationshipEvidenceHistory,\n        relationshipMilestones,\n        relationshipSummary:",
    'relationship progress npc storage',
);
write('v03/schema.js', schema);

// ---------------------------------------------------------------------------
// Scanner: deterministic v2-style inertia, fractional progress, axis limits,
// semantic event dedupe, Desire narration firewall, and summary calibration.
// ---------------------------------------------------------------------------
let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "    normalizeRelationship,\n    normalizeState,\n    relationshipMilestoneUnlocked,",
    "    normalizeRelationship,\n    normalizeRelationshipEvidenceHistory,\n    normalizeRelationshipProgress,\n    normalizeState,\n    relationshipMilestoneUnlocked,",
    'scanner progress imports',
);
scanner = replaceRequired(
    scanner,
    `function applyDynamicPatch(npc, patch, options = {}) {
    const next = applyLivePatch(npc, patch);
    const relationshipSummary = String(patch?.relationshipSummary ?? '').trim();
    if (relationshipSummary) next.relationshipSummary = relationshipSummary;
    if (Array.isArray(patch?.memories)) {
        const limits = normalizeDossierLimits(options.dossierLimits);
        next.memories = appendUnique([], patch.memories, limits.memories);
    }
    return next;
}`,
    `function applyDynamicPatch(npc, patch, options = {}) {
    const next = applyLivePatch(npc, patch);
    // relationshipSummary is player-relationship state. It is deliberately deferred to
    // applyRelationshipChange so a blocked/duplicate/unsupported event cannot rewrite it.
    if (Array.isArray(patch?.memories)) {
        const limits = normalizeDossierLimits(options.dossierLimits);
        next.memories = appendUnique([], patch.memories, limits.memories);
    }
    return next;
}`,
    'defer relationship summary',
);
const relationshipStart = scanner.indexOf('function relationshipImpactRank(value) {');
const relationshipEnd = scanner.indexOf('\nfunction applyLifeState(npc, patch, options) {', relationshipStart);
if (relationshipStart < 0 || relationshipEnd < 0) throw new Error('Missing phase-1 relationship block');
const hardeningBlock = `function relationshipImpactRank(value) {
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

function relationshipInertiaFactor(currentValue, proposedDelta, impact = 'ordinary') {
    const current = Number(currentValue) || 0;
    const delta = Number(proposedDelta) || 0;
    if (!delta) return 0;
    const magnitude = Math.abs(current);
    const deepening = current === 0 || Math.sign(current) === Math.sign(delta);
    if (deepening) {
        if (magnitude < 30) return 1;
        if (magnitude < 50) return 0.75;
        if (magnitude < 70) return 0.5;
        if (magnitude < 85) return 0.35;
        if (magnitude < 95) return 0.2;
        return 0.1;
    }
    if (impact === 'extreme') return 1;
    if (impact === 'major') {
        if (magnitude < 50) return 1;
        if (magnitude < 70) return 0.9;
        if (magnitude < 85) return 0.8;
        if (magnitude < 95) return 0.7;
        return 0.6;
    }
    if (impact === 'meaningful') {
        if (magnitude < 30) return 1;
        if (magnitude < 50) return 0.9;
        if (magnitude < 70) return 0.8;
        if (magnitude < 85) return 0.65;
        if (magnitude < 95) return 0.5;
        return 0.4;
    }
    if (magnitude < 30) return 1;
    if (magnitude < 50) return 0.85;
    if (magnitude < 70) return 0.7;
    if (magnitude < 85) return 0.55;
    if (magnitude < 95) return 0.4;
    return 0.3;
}

function relationshipAxisLimit(impact) {
    if (impact === 'ordinary') return 1;
    if (impact === 'meaningful') return 2;
    if (impact === 'major') return 3;
    if (impact === 'extreme') return 4;
    return 0;
}

function selectRelationshipAxes(delta, axisLimit) {
    const ranked = RELATIONSHIP_AXES
        .filter(axis => Number(delta?.[axis]) !== 0)
        .map(axis => ({ axis, magnitude: Math.abs(Number(delta[axis]) || 0) }))
        .sort((a, b) => b.magnitude - a.magnitude || RELATIONSHIP_AXES.indexOf(a.axis) - RELATIONSHIP_AXES.indexOf(b.axis));
    if (!axisLimit || !ranked.length) return new Set();
    if (ranked.length <= axisLimit) return new Set(ranked.map(item => item.axis));
    const cutoff = ranked[axisLimit - 1]?.magnitude ?? Infinity;
    const above = ranked.filter(item => item.magnitude > cutoff);
    const tied = ranked.filter(item => item.magnitude === cutoff);
    const slots = Math.max(0, axisLimit - above.length);
    // Do not create a fixed Trust/Affection bias when too many equal axes compete for
    // too few legal slots. Ambiguous tied overflow is rejected as a group.
    const acceptedTied = tied.length <= slots ? tied : [];
    return new Set([...above, ...acceptedTied].map(item => item.axis));
}

const DESIRE_EVIDENCE_CUES = /\\b(desire|desires|desired|desiring|attract|attracts|attracted|attraction|romantic|romance|intimacy|intimate|kiss|kisses|kissed|kissing|sexual|sexually|lust|longing|yearn|yearns|yearned|yearning|flirt|flirts|flirted|flirting|date|dating|lover|physical closeness|physical contact|physically drawn|wants? (?:him|her|them|the player) physically|drawn to)\\b/i;

function relationshipTextTokens(value) {
    return normalizeName(value).split(/\\s+/).filter(token => token.length >= 3);
}

function relationshipTextSimilarity(a, b) {
    const leftText = normalizeName(a);
    const rightText = normalizeName(b);
    if (!leftText || !rightText) return 0;
    if (leftText === rightText) return 1;
    const left = new Set(relationshipTextTokens(leftText));
    const right = new Set(relationshipTextTokens(rightText));
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    for (const token of left) if (right.has(token)) intersection += 1;
    const union = new Set([...left, ...right]).size;
    const jaccard = union ? intersection / union : 0;
    const containment = intersection / Math.min(left.size, right.size);
    return Math.max(jaccard, containment * 0.85);
}

function relationshipChangeLooksDuplicate(npc, change, { sourceMessageId = null, turn = null } = {}) {
    const currentText = [change?.reason, change?.evidence].filter(Boolean).join(' ');
    if (!currentText) return false;
    const history = normalizeRelationshipEvidenceHistory(npc?.relationshipEvidenceHistory);
    return history.some(previous => {
        const priorTurn = Number(previous.turn);
        const currentTurn = Number(turn);
        const recentByTurn = Number.isFinite(priorTurn) && Number.isFinite(currentTurn) && Math.abs(currentTurn - priorTurn) <= 8;
        const recentByMessage = Number.isInteger(sourceMessageId) && Number.isInteger(previous.sourceMessageId)
            && Math.abs(sourceMessageId - previous.sourceMessageId) <= 10;
        if (!recentByTurn && !recentByMessage) return false;
        return relationshipTextSimilarity([previous.reason, previous.evidence].filter(Boolean).join(' '), currentText) >= 0.68;
    });
}

function relationshipSummarySupported(value, relationship, milestones) {
    const summary = String(value || '').trim();
    if (!summary) return false;
    const rel = normalizeRelationship(relationship || {});
    const positiveStrength = Math.max(0, rel.trust, rel.affection, rel.desire);
    const unlocked = (axis, polarity, threshold) => relationshipMilestoneUnlocked(milestones, axis, polarity, threshold);
    const desireClaims = /\\b(madly in love|in love|romantic|romance|sexually|sexual attraction|lust|desire[sd]?|intimate attraction|physically attracted|yearns? for)\\b/i;
    const tropeClaims = /\\b(possessive|jealous|obsessive|obsessed|would kill|kill anyone|belongs to (?:him|her|them|the player)|unconditionally devoted|utterly devoted)\\b/i;
    const absoluteClaims = /\\b(indispensable|everything to (?:her|him|them)|cannot live without|can't live without|completely dependent|utterly dependent)\\b/i;
    const deepTrustClaims = /\\b(deep(?:est)? trust|deeply trusts?|profound trust|unwavering trust|unquestion(?:ing|ed) trust|complete trust|implicit trust)\\b/i;
    const exceptionalTrustClaims = /\\b(absolute trust|unbreakable trust|trusts? (?:him|her|them|the player) with (?:her|his|their) life|without reservation)\\b/i;
    const deepAffectionClaims = /\\b(deep affection|deeply attached|profound attachment|one of (?:her|his|their) most important people)\\b/i;
    const exceptionalAffectionClaims = /\\b(inseparable|irreplaceable|life-defining bond|devoted to (?:him|her|them|the player))\\b/i;
    const deepDistrustClaims = /\\b(deep distrust|profound distrust|deeply distrusts?|cannot trust (?:him|her|them|the player) at all)\\b/i;
    const deepDislikeClaims = /\\b(deep hatred|profound hatred|deep resentment|utterly hates?)\\b/i;
    if (rel.desire < 30 && desireClaims.test(summary)) return false;
    if (tropeClaims.test(summary)) return false;
    if (positiveStrength < 70 && absoluteClaims.test(summary)) return false;
    if (deepTrustClaims.test(summary) && !unlocked('trust', 1, 50)) return false;
    if (exceptionalTrustClaims.test(summary) && !unlocked('trust', 1, 75)) return false;
    if (deepAffectionClaims.test(summary) && !unlocked('affection', 1, 50)) return false;
    if (exceptionalAffectionClaims.test(summary) && !unlocked('affection', 1, 75)) return false;
    if (deepDistrustClaims.test(summary) && !unlocked('trust', -1, 50)) return false;
    if (deepDislikeClaims.test(summary) && !unlocked('affection', -1, 50)) return false;
    return true;
}

function relationshipDeltaForPatch(patch, caps = DEFAULT_RELATIONSHIP_CAPS) {
    const change = patch?.relationshipChange && typeof patch.relationshipChange === 'object' ? patch.relationshipChange : {};
    const impact = IMPACTS.has(String(change.impact)) ? String(change.impact) : 'none';
    const evidence = String(change.evidence || '').trim();
    const reason = String(change.reason || '').trim();
    if (impact === 'none' || !evidence || !reason) return { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' };
    const cap = Math.max(0, Number(caps?.[impact] ?? DEFAULT_RELATIONSHIP_CAPS[impact] ?? 0));
    const proposed = change.delta && typeof change.delta === 'object' ? change.delta : {};
    const delta = {};
    for (const axis of RELATIONSHIP_AXES) {
        const number = Number(proposed[axis]);
        delta[axis] = Number.isFinite(number) ? Math.max(-cap, Math.min(cap, Math.round(number))) : 0;
    }
    if (!Object.values(delta).some(Boolean)) return { impact: 'none', delta, evidence: '', reason: '' };
    return { impact, delta, evidence: evidence.slice(0, 800), reason: reason.slice(0, 800) };
}

function applyRelationshipChange(npc, patch, options = {}) {
    const caps = options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS;
    const change = relationshipDeltaForPatch(patch, caps);
    if (change.impact === 'none') return npc;
    if (relationshipChangeLooksDuplicate(npc, change, options)) return npc;

    const context = String(options.relationshipContext || '').trim();
    const filteredDelta = { ...change.delta };
    if (filteredDelta.desire !== 0) {
        const evidenceSupportsDesire = DESIRE_EVIDENCE_CUES.test(change.evidence) || DESIRE_EVIDENCE_CUES.test(change.reason);
        const narrationSupportsDesire = !context || DESIRE_EVIDENCE_CUES.test(context);
        if (!evidenceSupportsDesire || !narrationSupportsDesire) filteredDelta.desire = 0;
    }

    const axisLimit = relationshipAxisLimit(change.impact);
    const allowedAxes = selectRelationshipAxes(filteredDelta, axisLimit);
    const next = structuredClone(npc);
    const baseline = normalizeRelationship(next.relationship);
    const priorProgress = normalizeRelationshipProgress(next.relationshipProgress);
    const updated = { ...baseline };
    const progress = { ...priorProgress };
    const actualDelta = { trust: 0, affection: 0, desire: 0, tension: 0 };
    const crossings = [];
    let acceptedEvidence = false;

    for (const axis of RELATIONSHIP_AXES) {
        const raw = allowedAxes.has(axis) ? Number(filteredDelta[axis]) || 0 : 0;
        if (!raw) continue;
        acceptedEvidence = true;
        const weighted = raw * relationshipInertiaFactor(baseline[axis], raw, change.impact);
        let accumulated = priorProgress[axis] + weighted;
        const baselineValue = baseline[axis];
        const baselinePolarity = Math.sign(baselineValue);
        const proposedPolarity = Math.sign(raw);

        if (baselinePolarity === proposedPolarity) {
            const lockedBoundary = RELATIONSHIP_MILESTONE_THRESHOLDS.find(threshold =>
                Math.abs(baselineValue) === threshold
                && !relationshipMilestoneUnlocked(next.relationshipMilestones, axis, proposedPolarity, threshold));
            if (lockedBoundary) {
                if (!relationshipMilestoneEventQualifies({ ...change, delta: filteredDelta }, axis, lockedBoundary, caps)) {
                    accumulated = 0;
                } else if (!crossings.some(entry => entry.axis === axis && entry.polarity === proposedPolarity && entry.threshold === lockedBoundary)) {
                    crossings.push({ axis, polarity: proposedPolarity, threshold: lockedBoundary });
                }
            }
        }

        let whole = Math.trunc(accumulated);
        let candidate = Math.max(-100, Math.min(100, baselineValue + whole));
        let blockedAt = null;
        if (Math.abs(candidate) >= Math.abs(baselineValue)) {
            const movementPolarity = Math.sign(candidate) || proposedPolarity;
            const lowMagnitude = baselinePolarity === movementPolarity ? Math.abs(baselineValue) : 0;
            let highMagnitude = Math.abs(candidate);
            for (const threshold of RELATIONSHIP_MILESTONE_THRESHOLDS) {
                if (threshold < lowMagnitude || highMagnitude < threshold) continue;
                if (relationshipMilestoneUnlocked(next.relationshipMilestones, axis, movementPolarity, threshold)) continue;
                const qualifies = relationshipMilestoneEventQualifies({ ...change, delta: filteredDelta }, axis, threshold, caps);
                if (highMagnitude === threshold) {
                    if (lowMagnitude < threshold && qualifies && !crossings.some(entry => entry.axis === axis && entry.polarity === movementPolarity && entry.threshold === threshold)) {
                        crossings.push({ axis, polarity: movementPolarity, threshold });
                    }
                    break;
                }
                if (qualifies) {
                    if (!crossings.some(entry => entry.axis === axis && entry.polarity === movementPolarity && entry.threshold === threshold)) crossings.push({ axis, polarity: movementPolarity, threshold });
                    continue;
                }
                blockedAt = threshold;
                candidate = movementPolarity * threshold;
                highMagnitude = threshold;
                break;
            }
        }

        whole = candidate - baselineValue;
        let remainder = accumulated - whole;
        const finalPolarity = Math.sign(candidate);
        const lockedFinalBoundary = finalPolarity && RELATIONSHIP_MILESTONE_THRESHOLDS.find(threshold =>
            Math.abs(candidate) === threshold
            && !relationshipMilestoneUnlocked(next.relationshipMilestones, axis, finalPolarity, threshold)
            && !crossings.some(entry => entry.axis === axis && entry.polarity === finalPolarity && entry.threshold === threshold));
        if (blockedAt || (lockedFinalBoundary && Math.sign(remainder) === finalPolarity)) remainder = 0;
        if ((candidate >= 100 && remainder > 0) || (candidate <= -100 && remainder < 0)) remainder = 0;
        if (Math.abs(remainder) < 0.000001) remainder = 0;

        updated[axis] = candidate;
        actualDelta[axis] = whole;
        progress[axis] = Number(Math.max(-0.999999, Math.min(0.999999, remainder)).toFixed(6));
    }

    if (!acceptedEvidence) return npc;

    next.relationship = updated;
    next.relationshipProgress = normalizeRelationshipProgress(progress);
    next.relationshipMilestones = applyRelationshipMilestoneCrossings(next.relationshipMilestones, crossings, {
        reason: change.reason,
        evidence: change.evidence,
        sourceMessageId: options.sourceMessageId,
        turn: options.turn,
    });

    const evidenceEvent = {
        impact: change.impact,
        evidence: change.evidence,
        reason: change.reason,
        sourceMessageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,
        turn: Number.isInteger(options.turn) ? options.turn : null,
        at: Date.now(),
    };
    next.relationshipEvidenceHistory = normalizeRelationshipEvidenceHistory([...(next.relationshipEvidenceHistory || []), evidenceEvent]);

    const visibleChanged = Object.values(actualDelta).some(Boolean);
    if (visibleChanged) {
        const event = { ...evidenceEvent, delta: actualDelta };
        next.lastRelationshipChange = event;
        next.relationshipHistory = [...(next.relationshipHistory || []), event].slice(-24);
    }

    const summary = String(patch?.relationshipSummary ?? '').trim();
    if (summary && relationshipSummarySupported(summary, next.relationship, next.relationshipMilestones)) {
        next.relationshipSummary = summary.slice(0, 1000);
    }
    return next;
}`;
scanner = scanner.slice(0, relationshipStart) + hardeningBlock + scanner.slice(relationshipEnd);
scanner = replaceRequired(
    scanner,
    "                relationshipCaps: options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                sourceMessageId,\n                turn,\n            });",
    "                relationshipCaps: options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                relationshipContext: String(options.relationshipContext || ''),\n                sourceMessageId,\n                turn,\n            });",
    'relationship context apply option',
);
scanner = replaceRequired(
    scanner,
    "        '- Only propose a relationshipChange when the current exchange contains concrete evidence. If unsure, use impact none and zero deltas.',\n        '- RELATIONSHIP MILESTONE GATES",
    "        '- Only propose a relationshipChange when the current exchange contains concrete evidence. If unsure, use impact none and zero deltas.',\n        '- RELATIONSHIP HARDENING: ordinary may affect at most 1 axis, meaningful 2, major 3, extreme 4. Repeated aftermath or semantically duplicate events must be zero. High relationship depth has increasing inertia, so raw deltas are evidence weights rather than guaranteed visible points. Desire requires explicit romantic/intimate/physical attraction evidence in the CURRENT narration, not friendship, gratitude, rescue, beauty, proximity, trust, or generic affection. Relationship Summary must describe only depth actually supported by the accepted relationship state.',\n        '- RELATIONSHIP MILESTONE GATES",
    'recovery relationship hardening prompt',
);
write('v03/scanner.js', scanner);

// ---------------------------------------------------------------------------
// Engine: supply the actual current exchange to deterministic Desire validation,
// and clear fractional residue when the user manually edits a relationship axis.
// ---------------------------------------------------------------------------
let engine = read('v03/engine.js');
engine = replaceRequired(
    engine,
    "function latestAssistantMessageId(chat = []) {",
    `function relationshipContextForExchange(exchange) {
    if (!exchange) return '';
    return [exchange.user?.mes, exchange.assistant?.mes].map(value => String(value || '').trim()).filter(Boolean).join('\n');
}

function latestAssistantMessageId(chat = []) {`,
    'relationship context helper',
);
engine = replaceRequired(
    engine,
    "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                dossierLimits: settings.dossierLimits,",
    "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                relationshipContext: relationshipContextForExchange(exchange),\n                dossierLimits: settings.dossierLimits,",
    'separate scanner relationship context',
);
engine = replaceRequired(
    engine,
    "            const startEpoch = epoch(chatKey);\n            const startFingerprint = fingerprintMessage(message);\n            const working = normalizeState(state, chatKey);",
    "            const startEpoch = epoch(chatKey);\n            const startFingerprint = fingerprintMessage(message);\n            const exchange = currentExchange(chat, messageId) || { assistant: { ...message, id: messageId }, user: null };\n            const working = normalizeState(state, chatKey);",
    'embedded exchange context setup',
);
engine = replaceRequired(
    engine,
    "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                dossierLimits: settings.dossierLimits,\n                applyReturnedNpcPatches: true,\n            });\n            const relationshipHistoryLimit",
    "                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                relationshipContext: relationshipContextForExchange(exchange),\n                dossierLimits: settings.dossierLimits,\n                applyReturnedNpcPatches: true,\n            });\n            const relationshipHistoryLimit",
    'embedded relationship context option',
);
engine = replaceRequired(
    engine,
    "            const exchange = currentExchange(chat, messageId) || { assistant: { ...message, id: messageId }, user: null };\n            const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, exchange);",
    "            const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, exchange);",
    'remove duplicate embedded exchange declaration',
);
engine = replaceRequired(
    engine,
    "                nextRaw.relationshipMilestones = normalizeRelationshipMilestones(current.relationshipMilestones, after, { inferFromRelationship: true, includeBoundary: true });\n                const delta = Object.fromEntries(Object.keys(before).map(axis => [axis, after[axis] - before[axis]]));",
    "                nextRaw.relationshipMilestones = normalizeRelationshipMilestones(current.relationshipMilestones, after, { inferFromRelationship: true, includeBoundary: true });\n                const delta = Object.fromEntries(Object.keys(before).map(axis => [axis, after[axis] - before[axis]]));\n                nextRaw.relationshipProgress = { ...(current.relationshipProgress || {}) };\n                for (const axis of Object.keys(delta)) if (delta[axis] !== 0) nextRaw.relationshipProgress[axis] = 0;",
    'manual relationship progress reset',
);
write('v03/engine.js', engine);

// ---------------------------------------------------------------------------
// Foreground prompt + stock rubric: tell the model the same contract, while
// retaining backend authority when the model gets enthusiastic.
// ---------------------------------------------------------------------------
let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak.',\n        'RELATIONSHIP MILESTONE GATES:",
    "        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak.',\n        'RELATIONSHIP HARDENING: ordinary may affect at most 1 axis, meaningful 2, major 3, extreme 4. Repeated aftermath or semantically duplicate events are zero. Raw deltas are evidence weights and high established relationships resist further deepening. Desire requires explicit romantic/intimate/physical attraction evidence in the visible CURRENT exchange; friendship, gratitude, rescue, beauty, proximity, trust, and generic affection are not Desire. Do not write a Relationship Summary deeper or more absolute than the accepted relationship state supports.',\n        'RELATIONSHIP MILESTONE GATES:",
    'foreground relationship hardening prompt',
);
write('v03/injection.js', injection);

let index = read('v03/index.js');
index = replaceRequired(
    index,
    "Ordinary events may change up to 1 point on one supported axis. Meaningful events may change up to 2 per supported axis, major up to 5, extreme up to 10. Every moved axis needs its own concrete evidence.\nRELATIONSHIP MILESTONES:",
    "Ordinary events may change up to 1 point on one supported axis. Meaningful events may change up to 2 per supported axis and at most two axes, major up to 5 and at most three axes, extreme up to 10 and at most four axes. Every moved axis needs its own concrete evidence. Raw deltas are evidence weights: deep established relationships gain further depth progressively more slowly, and accepted fractional evidence is retained behind the integer display. Do not replay the same event or its aftermath; semantically duplicate recent events score zero.\nRELATIONSHIP MILESTONES:",
    'stock relationship hardening rubric',
);
write('v03/index.js', index);

let changelog = read('CHANGELOG.md');
const line = '- Phase 1 restores v0.2 relationship hardening on top of the v0.4 milestone gates: fractional evidence progress, depth inertia, tier axis-count limits with tied-overflow rejection, recent semantic event dedupe, a narration-backed Desire firewall, and Relationship Summary depth validation. Blocked/duplicate events cannot rewrite the summary, while checkpoint-blocked evidence is retained only in the short hidden dedupe ledger.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.2\n\n', '## v0.4.2\n\n' + line + '\n', 'phase-1 changelog');
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.2 phase 1 relationship hardening');
