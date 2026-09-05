import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.20 relationship evidence marker: ' + label);
    return source.replace(from, to);
}

function replaceSection(source, startMarker, endMarker, replacement, label, doneMarker = '') {
    if (doneMarker && source.includes(doneMarker)) return source;
    const start = source.indexOf(startMarker);
    const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
    if (start < 0 || end < 0) throw new Error('Missing v0.4.20 relationship evidence section: ' + label);
    return source.slice(0, start) + replacement + '\n\n' + source.slice(end);
}

// Preserve current-exchange relationship source boundaries. World_State and reference/control
// blocks remain excluded from relationship-event quotation provenance.
{
    const path = 'v03/evidence-adapter.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceSection(
        source,
        'export function buildExchangeEvidencePolicy(exchange) {',
        'function containsReference(text, variants) {',
        `export function buildExchangeEvidencePolicy(exchange) {
    const user = analyzeStructuredEvidence(exchange?.user?.mes || '');
    const assistant = analyzeStructuredEvidence(exchange?.assistant?.mes || '');
    const relationshipSources = [
        { id: 'user-visible', kind: 'visible', text: clean(user.visibleText, 30000) },
        { id: 'user-inner', kind: 'inner', text: clean(user.innerChatterText, 30000) },
        { id: 'assistant-visible', kind: 'visible', text: clean(assistant.visibleText, 30000) },
        { id: 'assistant-inner', kind: 'inner', text: clean(assistant.innerChatterText, 30000) },
    ].filter(source => source.text);
    return {
        detected: user.detected || assistant.detected,
        visibleText: [user.visibleText, assistant.visibleText].filter(Boolean).join('\\n'),
        worldStateText: [user.worldStateText, assistant.worldStateText].filter(Boolean).join('\\n'),
        innerChatterText: [user.innerChatterText, assistant.innerChatterText].filter(Boolean).join('\\n'),
        excludedText: [user.excludedText, assistant.excludedText].filter(Boolean).join('\\n'),
        excludedTags: [...new Set([...(user.excludedTags || []), ...(assistant.excludedTags || [])])],
        relationshipSources,
    };
}`,
        'bounded relationship evidence sources',
        'relationshipSources,',
    );
    fs.writeFileSync(path, source);
}

// Exact quotation provenance is deliberately formatting-tolerant but semantically ignorant.
// It proves that a model-supplied excerpt exists in one allowed source; it does not decide
// what the scene means.
{
    const path = 'v03/relationship-evidence.js';
    let source = fs.readFileSync(path, 'utf8');
    if (!source.includes('export function relationshipEvidenceExcerptMatch')) {
        const marker = 'export function relationshipEvidenceGrounding(evidence, context, expectations = {}) {';
        const index = source.indexOf(marker);
        if (index < 0) throw new Error('Missing relationship evidence export marker');
        const helper = `function relationshipQuoteComparable(value, max = 40000) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/\\r\\n?/g, '\\n')
        .replace(/[“”„‟]/g, '"')
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[‐‑‒–—―]/g, '-')
        .replace(/\\u00a0/g, ' ')
        .replace(/[*_\\x60]/g, '')
        .replace(/\\s+/g, ' ')
        .replace(/\\s+([,.;:!?])/g, '$1')
        .trim()
        .toLocaleLowerCase()
        .slice(0, max);
}

export function relationshipEvidenceExcerptMatch(excerpt, sources = []) {
    const quote = relationshipQuoteComparable(excerpt, 1200);
    if (!quote) return null;
    for (const raw of Array.isArray(sources) ? sources.slice(0, 8) : []) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const source = relationshipQuoteComparable(raw.text, 40000);
        if (!source || !source.includes(quote)) continue;
        return {
            sourceId: String(raw.id || 'relationship-source').trim().slice(0, 80),
            kind: ['visible', 'inner'].includes(String(raw.kind || '').trim()) ? String(raw.kind).trim() : 'visible',
        };
    }
    return null;
}

`;
        source = source.slice(0, index) + helper + source.slice(index);
    }
    fs.writeFileSync(path, source);
}

// Persist the new diagnostic/evidence metadata without touching existing score state.
{
    const path = 'v03/schema.js';
    let source = fs.readFileSync(path, 'utf8');
    if (!source.includes('export function normalizeRelationshipAxisEvidence')) {
        const marker = 'export function normalizeRelationshipEvidenceHistory(value = []) {';
        const index = source.indexOf(marker);
        if (index < 0) throw new Error('Missing relationship history normalizer marker');
        const helpers = `export function normalizeRelationshipAxisEvidence(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = {};
    for (const axis of RELATIONSHIP_AXES) {
        const raw = source[axis];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const excerpts = list(raw.excerpts, 3, 800);
        const explanation = text(raw.explanation, 800);
        if (!excerpts.length && !explanation) continue;
        out[axis] = { excerpts, explanation };
    }
    return out;
}

export function normalizeRelationshipPriority(value = []) {
    const out = [];
    for (const raw of Array.isArray(value) ? value : []) {
        const axis = String(raw || '').trim().toLocaleLowerCase();
        if (!RELATIONSHIP_AXES.includes(axis) || out.includes(axis)) continue;
        out.push(axis);
    }
    return out;
}

export function normalizeRelationshipVerifiedSources(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, list(source[axis], 6, 120)]).filter(([, rows]) => rows.length));
}

function normalizeRelationshipAxisReasons(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, list(source[axis], 8, 80)]).filter(([, rows]) => rows.length));
}

`;
        source = source.slice(0, index) + helpers + source.slice(index);
    }
    source = replaceSection(
        source,
        'export function normalizeRelationshipEvidenceHistory(value = []) {',
        'export function normalizeRelationshipDiagnostics(value = []) {',
        `export function normalizeRelationshipEvidenceHistory(value = []) {
    const source = Array.isArray(value) ? value : [];
    return source.slice(-RELATIONSHIP_EVIDENCE_HISTORY_LIMIT * 2).map(raw => ({
        delta: raw?.delta && typeof raw.delta === 'object' ? normalizeRelationship(raw.delta) : null,
        impact: ['ordinary', 'meaningful', 'major', 'extreme'].includes(String(raw?.impact)) ? String(raw.impact) : 'ordinary',
        reason: text(raw?.reason, 800),
        evidence: text(raw?.evidence, 800),
        axisEvidence: normalizeRelationshipAxisEvidence(raw?.axisEvidence),
        priority: normalizeRelationshipPriority(raw?.priority),
        verifiedSources: normalizeRelationshipVerifiedSources(raw?.verifiedSources),
        sourceMessageId: Number.isInteger(raw?.sourceMessageId) ? raw.sourceMessageId : null,
        turn: Number.isInteger(raw?.turn) ? raw.turn : null,
        at: Number(raw?.at) || null,
    })).filter(item => item.reason || item.evidence || Object.keys(item.axisEvidence).length).slice(-RELATIONSHIP_EVIDENCE_HISTORY_LIMIT);
}`,
        'relationship evidence history metadata',
        'axisEvidence: normalizeRelationshipAxisEvidence(raw?.axisEvidence)',
    );
    source = replaceSection(
        source,
        'export function normalizeRelationshipDiagnostics(value = []) {',
        'function normalizeMilestonePolarity(value) {',
        `export function normalizeRelationshipDiagnostics(value = []) {
    return (Array.isArray(value) ? value : []).slice(-12).map(raw => ({
        impact: text(raw?.impact, 20),
        reason: text(raw?.reason, 800),
        evidence: text(raw?.evidence, 800),
        before: normalizeRelationship(raw?.before),
        after: normalizeRelationship(raw?.after),
        proposed: normalizeRelationship(raw?.proposed),
        capped: normalizeRelationship(raw?.capped ?? raw?.proposed),
        applied: normalizeRelationship(raw?.applied),
        progressBefore: normalizeRelationshipProgress(raw?.progressBefore),
        progressAfter: normalizeRelationshipProgress(raw?.progressAfter),
        axisEvidence: normalizeRelationshipAxisEvidence(raw?.axisEvidence),
        priority: normalizeRelationshipPriority(raw?.priority),
        verifiedSources: normalizeRelationshipVerifiedSources(raw?.verifiedSources),
        axisReasons: normalizeRelationshipAxisReasons(raw?.axisReasons),
        reasons: list(raw?.reasons, 20, 100),
        unlocks: normalizeRelationshipMilestones(raw?.unlocks, DEFAULT_RELATIONSHIP, { inferFromRelationship: false }),
        sourceMessageId: Number.isInteger(raw?.sourceMessageId) ? raw.sourceMessageId : null,
        turn: Number.isInteger(raw?.turn) ? raw.turn : null,
        at: Number(raw?.at) || null,
    }));
}`,
        'relationship diagnostics metadata',
        'capped: normalizeRelationship(raw?.capped ?? raw?.proposed)',
    );
    fs.writeFileSync(path, source);
}

// Put semantic interpretation squarely in the model prompt, including contextual cautions.
{
    const path = 'v03/relationship-policy.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceSection(
        source,
        'export function relationshipAxisIndependencePrompt() {',
        '}',
        `export function relationshipAxisIndependencePrompt() {
    return [
        'RELATIONSHIP JUDGMENT AND PER-AXIS EVIDENCE:',
        '- You interpret the narrative meaning. Deterministic runtime checks quotation provenance, structure, numeric limits, duplicate application, inertia, and milestone gates; it does NOT use keywords to decide whether your interpretation is emotionally correct.',
        '- For every exchange-active NPC, decide who acted, who experienced or expressed a reaction, and toward whom that reaction is directed. Distinguish events that actually occurred now from hypotheticals, negated events, remembered history, plans, proposals, or reports about someone else.',
        '- Judge what changed in THIS exchange. Score trust, affection, desire, and tension independently. Zero is explicitly allowed and is usually correct when no relationship movement is warranted.',
        '- Every nonzero axis MUST have axisEvidence for that axis: 1-3 short verbatim excerpt strings copied from permitted CURRENT-exchange relationship evidence, plus a concise explanation of why those narrated facts change THIS NPC on THAT axis toward the PLAYER.',
        '- One event may support multiple axes only when each axis has its own explanation. Reusing an excerpt is allowed when it genuinely supports more than one distinct judgment, but do not spread a general positive/negative impression across axes.',
        '- priority is an ordered list of the supported nonzero axes, strongest or most central first. It resolves impact-tier overflow; do not list unsupported or zero axes.',
        '- Financial/material relief does not automatically establish Trust or Affection. Intimacy does not automatically establish Desire toward the player. General relaxation does not automatically mean reduced interpersonal Tension toward the player. Grief or distress concerning another person must not be attributed to the player.',
        '- Private relationship thoughts may support an internal attitude when supplied as permitted relationship context, but private thought does not by itself prove a visible action, spoken line, gesture, or visible reaction.',
        '- A quotation proves source provenance only. Choose impact and modest deltas from your contextual judgment; do not inflate impact or deltas to force a milestone.',
        '- Repeated aftermath, restatement, or continued consequences of an already-scored event are zero unless a genuinely new relationship-changing event occurs.',
    ].join('\\n');
}`,
        'relationship judgment prompt',
        'RELATIONSHIP JUDGMENT AND PER-AXIS EVIDENCE:',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "import { relationshipEvidenceGrounding, relationshipEvidencePolarityConflict, relationshipOutcomesConflict } from './relationship-evidence.js';",
        "import { relationshipEvidenceExcerptMatch } from './relationship-evidence.js';",
        'scanner relationship evidence import',
    );
    source = replaceRequired(
        source,
        '    normalizeRelationshipEvidenceHistory,\n    normalizeRelationshipDiagnostics,\n    normalizeRelationshipProgress,',
        '    normalizeRelationshipEvidenceHistory,\n    normalizeRelationshipDiagnostics,\n    normalizeRelationshipAxisEvidence,\n    normalizeRelationshipPriority,\n    normalizeRelationshipProgress,',
        'scanner relationship metadata imports',
    );

    source = replaceSection(
        source,
        'function selectRelationshipAxes(delta, axisLimit) {',
        'function relationshipSummarySupported(value, relationship, milestones) {',
        `function selectRelationshipAxes(delta, axisLimit, priority = []) {
    if (!axisLimit) return new Set();
    const moving = RELATIONSHIP_AXES.filter(axis => Number(delta?.[axis]) !== 0);
    if (!moving.length) return new Set();
    const ordered = [];
    for (const axis of normalizeRelationshipPriority(priority)) {
        if (moving.includes(axis) && !ordered.includes(axis)) ordered.push(axis);
    }
    const remainder = moving.filter(axis => !ordered.includes(axis)).sort((left, right) =>
        Math.abs(Number(delta[right]) || 0) - Math.abs(Number(delta[left]) || 0)
        || RELATIONSHIP_AXES.indexOf(left) - RELATIONSHIP_AXES.indexOf(right));
    // Legacy/fallback order is deterministic: raw magnitude, then canonical axis order.
    // Equal candidates always fill available slots instead of being rejected as a tied group.
    return new Set([...ordered, ...remainder].slice(0, axisLimit));
}

function relationshipAxisEvidenceText(change, axis) {
    return (change?.axisEvidence?.[axis]?.excerpts || []).join(' ');
}

function relationshipAxisLooksDuplicate(npc, change, axis, { sourceMessageId = null, turn = null } = {}) {
    const direction = Math.sign(Number(change?.delta?.[axis]) || 0);
    if (!direction) return false;
    const history = normalizeRelationshipEvidenceHistory(npc?.relationshipEvidenceHistory);
    return history.some(previous => {
        const priorDirection = Math.sign(Number(previous?.delta?.[axis]) || 0);
        if (!priorDirection || priorDirection !== direction) return false;
        if (Number.isInteger(sourceMessageId) && Number.isInteger(previous.sourceMessageId)) {
            return previous.sourceMessageId === sourceMessageId;
        }
        if (Number.isInteger(turn) && Number.isInteger(previous.turn)) return previous.turn === turn;
        return false;
    });
}

function relationshipEvidenceSourcesForOptions(options = {}) {
    const explicit = Array.isArray(options.relationshipEvidenceSources) ? options.relationshipEvidenceSources : [];
    if (explicit.length) return explicit.slice(0, 8);
    // Compatibility for direct deterministic callers that predate evidencePolicy plumbing.
    // The new per-axis excerpt contract is still mandatory, and production engine paths pass
    // bounded user/assistant visible/private sources so this fallback cannot cross real source boundaries.
    const legacy = String(options.relationshipContext || '').trim();
    return legacy ? [{ id: 'legacy-context', kind: 'visible', text: legacy }] : [];
}

function relationshipAcceptedEvidenceSummary(change, allowedAxes) {
    const rows = [];
    for (const axis of RELATIONSHIP_AXES) {
        if (!allowedAxes.has(axis)) continue;
        for (const excerpt of change?.axisEvidence?.[axis]?.excerpts || []) if (!rows.includes(excerpt)) rows.push(excerpt);
    }
    return rows.join(' | ').slice(0, 800);
}

function relationshipAcceptedAxisEvidence(change, allowedAxes) {
    return Object.fromEntries(RELATIONSHIP_AXES
        .filter(axis => allowedAxes.has(axis) && change?.axisEvidence?.[axis])
        .map(axis => [axis, change.axisEvidence[axis]]));
}`,
        'axis selection and duplicate policy',
        'function relationshipAxisLooksDuplicate',
    );

    source = replaceSection(
        source,
        'function relationshipDeltaForPatch(patch, caps = DEFAULT_RELATIONSHIP_CAPS) {',
        'function applyRelationshipChange(npc, patch, options = {}) {',
        `function relationshipDeltaForPatch(patch, caps = DEFAULT_RELATIONSHIP_CAPS) {
    const raw = patch?.relationshipChange && typeof patch.relationshipChange === 'object' && !Array.isArray(patch.relationshipChange)
        ? patch.relationshipChange : null;
    const reasons = [];
    const zero = { trust: 0, affection: 0, desire: 0, tension: 0 };
    if (!raw) return { evaluated: false, impactValid: false, impact: 'none', proposed: zero, delta: zero, axisEvidence: {}, priority: [], evidence: '', reason: '', reasons, hasRawMovement: false };
    const impactText = String(raw.impact || '').trim();
    const impactValid = IMPACTS.has(impactText);
    const impact = impactValid ? impactText : 'none';
    const proposedRaw = raw.delta && typeof raw.delta === 'object' && !Array.isArray(raw.delta) ? raw.delta : {};
    const proposed = { ...zero };
    const delta = { ...zero };
    const cap = Math.max(0, Number(caps?.[impact] ?? DEFAULT_RELATIONSHIP_CAPS[impact] ?? 0));
    let hasRawMovement = false;
    for (const key of Object.keys(proposedRaw)) {
        if (!RELATIONSHIP_AXES.includes(String(key))) reasons.push('proposal:unknown-axis:' + String(key).slice(0, 40));
    }
    for (const axis of RELATIONSHIP_AXES) {
        if (!Object.prototype.hasOwnProperty.call(proposedRaw, axis)) continue;
        const number = Number(proposedRaw[axis]);
        if (!Number.isFinite(number)) {
            hasRawMovement = true;
            reasons.push(axis + ':non-finite');
            continue;
        }
        const rounded = Math.round(number);
        proposed[axis] = rounded;
        if (!rounded) continue;
        hasRawMovement = true;
        delta[axis] = Math.max(-cap, Math.min(cap, rounded));
        if (delta[axis] !== rounded) reasons.push(axis + ':cap-clamped');
    }

    const rawAxisEvidence = raw.axisEvidence && typeof raw.axisEvidence === 'object' && !Array.isArray(raw.axisEvidence) ? raw.axisEvidence : {};
    for (const key of Object.keys(rawAxisEvidence)) if (!RELATIONSHIP_AXES.includes(String(key))) reasons.push('proposal:unknown-axis-evidence:' + String(key).slice(0, 40));
    const axisEvidence = {};
    const axisEvidenceStatus = {};
    for (const axis of RELATIONSHIP_AXES) {
        if (!delta[axis]) continue;
        const item = rawAxisEvidence[axis];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            axisEvidenceStatus[axis] = 'missing-axis-evidence';
            continue;
        }
        const rawExcerpts = item.excerpts;
        const explanation = String(item.explanation || '').trim().slice(0, 800);
        if (!Array.isArray(rawExcerpts) || rawExcerpts.length < 1 || rawExcerpts.length > 3
            || rawExcerpts.some(excerpt => typeof excerpt !== 'string' || !excerpt.trim())) {
            axisEvidenceStatus[axis] = 'malformed-axis-evidence';
            axisEvidence[axis] = { excerpts: [], explanation };
            continue;
        }
        const excerpts = rawExcerpts.map(excerpt => String(excerpt).trim().slice(0, 800));
        axisEvidence[axis] = { excerpts, explanation };
        axisEvidenceStatus[axis] = explanation ? 'valid' : 'missing-explanation';
    }

    let priority = [];
    if (raw.priority != null) {
        if (!Array.isArray(raw.priority)) reasons.push('priority:malformed');
        else {
            for (const entry of raw.priority) {
                const axis = String(entry || '').trim().toLocaleLowerCase();
                if (!RELATIONSHIP_AXES.includes(axis)) { reasons.push('priority:unknown-axis:' + axis.slice(0, 40)); continue; }
                if (!delta[axis]) { reasons.push('priority:nonmoving-axis:' + axis); continue; }
                if (!priority.includes(axis)) priority.push(axis);
            }
        }
    }
    priority = normalizeRelationshipPriority(priority);
    return {
        evaluated: raw.evaluated === true,
        impactValid,
        impact,
        proposed,
        delta,
        axisEvidence: normalizeRelationshipAxisEvidence(axisEvidence),
        axisEvidenceStatus,
        priority,
        evidence: String(raw.evidence || '').trim().slice(0, 800),
        reason: String(raw.reason || '').trim().slice(0, 800),
        reasons,
        hasRawMovement,
        verifiedSources: {},
    };
}

function relationshipAxisReasons(reasons = []) {
    return Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, reasons
        .filter(reason => String(reason).startsWith(axis + ':'))
        .map(reason => String(reason).slice(axis.length + 1))]).filter(([, rows]) => rows.length));
}

function relationshipDiagnostic(npc, next, change, options, reasons = [], unlocks = []) {
    const event = {
        impact: change.impact, reason: change.reason, evidence: change.evidence,
        before: npc.relationship, after: next.relationship,
        proposed: change.proposed || change.delta,
        capped: change.delta,
        applied: Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, (next.relationship?.[axis] || 0) - (npc.relationship?.[axis] || 0)])),
        progressBefore: npc.relationshipProgress, progressAfter: next.relationshipProgress,
        axisEvidence: change.axisEvidence || {}, priority: change.priority || [], verifiedSources: change.verifiedSources || {},
        axisReasons: relationshipAxisReasons(reasons),
        reasons, unlocks, sourceMessageId: options.sourceMessageId, turn: options.turn, at: Date.now(),
    };
    return { ...next, relationshipDiagnostics: normalizeRelationshipDiagnostics([...(npc.relationshipDiagnostics || []), event]) };
}

function relationshipEvaluationDiagnostic(npc, patch, options = {}) {
    const raw = patch?.relationshipChange && typeof patch.relationshipChange === 'object' && !Array.isArray(patch.relationshipChange)
        ? patch.relationshipChange : null;
    const zero = { trust: 0, affection: 0, desire: 0, tension: 0 };
    if (!raw) {
        return relationshipDiagnostic(npc, npc, {
            impact: 'none', proposed: zero, delta: zero, axisEvidence: {}, priority: [], verifiedSources: {}, evidence: '',
            reason: 'Scanner omitted relationship evaluation for an exchange-active NPC.',
        }, options, ['evaluation-missing']);
    }
    const proposal = relationshipDeltaForPatch(patch, options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS);
    const rawDelta = raw.delta && typeof raw.delta === 'object' && !Array.isArray(raw.delta) ? raw.delta : {};
    const hasRawDelta = RELATIONSHIP_AXES.some(axis => Number(rawDelta?.[axis]) !== 0);
    const reason = String(raw.reason || '').trim().slice(0, 800);
    if (proposal.evaluated && proposal.impactValid && proposal.impact === 'none' && !hasRawDelta && reason) {
        return relationshipDiagnostic(npc, npc, { ...proposal, proposed: zero, delta: zero, reason }, options, ['evaluated-no-change']);
    }
    const diagnosticReason = proposal.evaluated
        ? (reason || 'Scanner returned an incomplete relationship evaluation.')
        : 'Scanner omitted the required relationshipChange.evaluated flag for an exchange-active NPC.';
    const diagnosticReasons = [...proposal.reasons, proposal.evaluated ? 'evaluation-invalid' : 'evaluation-missing'];
    return relationshipDiagnostic(npc, npc, { ...proposal, reason: diagnosticReason }, options, diagnosticReasons);
}

function relationshipAxisProvenance(change, options, delta, reasons) {
    const filtered = { ...delta };
    const sources = relationshipEvidenceSourcesForOptions(options);
    const verifiedSources = {};
    for (const axis of RELATIONSHIP_AXES) {
        if (!Number(filtered[axis])) continue;
        const status = change.axisEvidenceStatus?.[axis] || 'missing-axis-evidence';
        if (status !== 'valid') {
            filtered[axis] = 0;
            reasons.push(axis + ':' + status);
            continue;
        }
        if (!sources.length) {
            filtered[axis] = 0;
            reasons.push(axis + ':no-permitted-evidence-source');
            continue;
        }
        const matched = [];
        let valid = true;
        for (const excerpt of change.axisEvidence?.[axis]?.excerpts || []) {
            const provenance = relationshipEvidenceExcerptMatch(excerpt, sources);
            if (!provenance) { valid = false; break; }
            const label = provenance.sourceId + ':' + provenance.kind;
            if (!matched.includes(label)) matched.push(label);
        }
        if (!valid) {
            filtered[axis] = 0;
            reasons.push(axis + ':unverifiable-excerpt');
            continue;
        }
        verifiedSources[axis] = matched;
    }
    return { delta: filtered, verifiedSources };
}`,
        'relationship proposal/provenance pipeline',
        'function relationshipAxisProvenance',
    );

    source = replaceSection(
        source,
        'function applyRelationshipChange(npc, patch, options = {}) {',
        '    const next = structuredClone(npc);',
        `function applyRelationshipChange(npc, patch, options = {}) {
    const caps = options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS;
    const change = relationshipDeltaForPatch(patch, caps);
    if (!change.evaluated || !change.impactValid || change.impact === 'none') return relationshipEvaluationDiagnostic(npc, patch, { ...options, relationshipCaps: caps });
    const reasons = [...change.reasons];
    if (!change.hasRawMovement) return relationshipDiagnostic(npc, npc, change, options, [...reasons, 'evaluation-invalid']);
    if (!RELATIONSHIP_AXES.some(axis => Number(change.delta[axis]) !== 0)) {
        return relationshipDiagnostic(npc, npc, change, options, reasons.length ? reasons : ['evaluation-invalid']);
    }

    let filteredDelta = { ...change.delta };
    const provenance = relationshipAxisProvenance(change, options, filteredDelta, reasons);
    filteredDelta = provenance.delta;
    change.verifiedSources = provenance.verifiedSources;
    for (const axis of RELATIONSHIP_AXES) {
        if (!Number(filteredDelta[axis])) continue;
        if (!relationshipAxisLooksDuplicate(npc, { ...change, delta: filteredDelta }, axis, options)) continue;
        filteredDelta[axis] = 0;
        reasons.push(axis + ':duplicate');
    }
    if (!RELATIONSHIP_AXES.some(axis => Number(filteredDelta[axis]) !== 0)) {
        if (!reasons.length) reasons.push('no-valid-axis');
        return relationshipDiagnostic(npc, npc, change, options, reasons);
    }

    const axisLimit = relationshipAxisLimit(change.impact);
    const allowedAxes = selectRelationshipAxes(filteredDelta, axisLimit, change.priority);
    for (const axis of RELATIONSHIP_AXES) if (filteredDelta[axis] && !allowedAxes.has(axis)) reasons.push(axis + ':axis-limit');`,
        'relationship application prelude',
        'relationshipAxisProvenance(change, options, filteredDelta, reasons)',
    );

    source = replaceRequired(
        source,
        `    next.relationship = updated;
    next.relationshipProgress = normalizeRelationshipProgress(progress);
    next.relationshipMilestones = applyRelationshipMilestoneCrossings(next.relationshipMilestones, crossings, {
        reason: change.reason,
        evidence: change.evidence,
        sourceMessageId: options.sourceMessageId,
        turn: options.turn,
    });

    const evidenceEvent = {
        delta: Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, allowedAxes.has(axis) ? filteredDelta[axis] : 0])),
        impact: change.impact,
        evidence: change.evidence,
        reason: change.reason,
        sourceMessageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,
        turn: Number.isInteger(options.turn) ? options.turn : null,
        at: Date.now(),
    };`,
        `    next.relationship = updated;
    next.relationshipProgress = normalizeRelationshipProgress(progress);
    const acceptedEvidenceText = relationshipAcceptedEvidenceSummary(change, allowedAxes);
    const acceptedAxisEvidence = relationshipAcceptedAxisEvidence(change, allowedAxes);
    const acceptedVerifiedSources = Object.fromEntries(RELATIONSHIP_AXES
        .filter(axis => allowedAxes.has(axis) && change.verifiedSources?.[axis]?.length)
        .map(axis => [axis, change.verifiedSources[axis]]));
    next.relationshipMilestones = applyRelationshipMilestoneCrossings(next.relationshipMilestones, crossings, {
        reason: change.reason,
        evidence: acceptedEvidenceText || change.evidence,
        sourceMessageId: options.sourceMessageId,
        turn: options.turn,
    });

    const evidenceEvent = {
        delta: Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, allowedAxes.has(axis) ? filteredDelta[axis] : 0])),
        impact: change.impact,
        evidence: acceptedEvidenceText || change.evidence,
        reason: change.reason,
        axisEvidence: acceptedAxisEvidence,
        priority: change.priority,
        verifiedSources: acceptedVerifiedSources,
        sourceMessageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,
        turn: Number.isInteger(options.turn) ? options.turn : null,
        at: Date.now(),
    };`,
        'accepted per-axis evidence history',
    );

    source = replaceRequired(
        source,
        `    const partialAxisRejection = reasons.some(reason => /^(?:trust|affection|desire|tension):/.test(reason));
    if (relationshipStateChanged && partialAxisRejection && !reasons.includes('partial-applied')) reasons.push('partial-applied');`,
        `    const partialAxisRejection = reasons.some(reason => /^(?:trust|affection|desire|tension):(?:non-finite|missing-axis-evidence|malformed-axis-evidence|missing-explanation|no-permitted-evidence-source|unverifiable-excerpt|duplicate|axis-limit)$/.test(reason));
    if (relationshipStateChanged && partialAxisRejection && !reasons.includes('partial-applied')) reasons.push('partial-applied');`,
        'partial application reason precision',
    );

    source = replaceRequired(
        source,
        `                relationshipContext: String(options.relationshipContext || ''),
                playerName,`,
        `                relationshipContext: String(options.relationshipContext || ''),
                relationshipEvidenceSources: Array.isArray(options.evidencePolicy?.relationshipSources) ? options.evidencePolicy.relationshipSources : [],
                playerName,`,
        'bounded relationship source plumbing',
    );

    const oldContract = `            relationshipChange: { evaluated: true, impact: 'none|ordinary|meaningful|major|extreme', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: 'required even when impact is none' },`;
    const newContract = `            relationshipChange: { evaluated: true, impact: 'none|ordinary|meaningful|major|extreme', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: ['supported nonzero axes strongest/most central first'], axisEvidence: { trust: { excerpts: ['1-3 exact current-exchange quotations'], explanation: 'why this changes Trust toward the PLAYER' }, affection: { excerpts: [], explanation: '' }, desire: { excerpts: [], explanation: '' }, tension: { excerpts: [], explanation: '' } }, evidence: 'optional compact overall event summary', reason: 'overall evaluation; required concise reason when impact is none' },`;
    source = replaceRequired(source, oldContract, newContract, 'recovery output contract');

    source = source.replaceAll(
        `relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' }`,
        `relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: '' }`,
    );

    source = replaceRequired(
        source,
        "        '- MULTI-AXIS RELATIONSHIP EVIDENCE: each nonzero axis must be independently supported by the current exchange. Make evidence/reason concrete enough to justify every proposed axis separately. Runtime may discard an unsupported axis while preserving independently grounded axes; never inflate extra axes merely because one part of the interaction was intense.',",
        `        '- PER-AXIS RELATIONSHIP EVIDENCE: for every nonzero axis, return axisEvidence[axis] with 1-3 short VERBATIM excerpts copied from permitted CURRENT-exchange relationship evidence and a concise explanation connecting those facts to that axis toward the PLAYER. Runtime verifies quotation provenance only; your contextual judgment decides meaning.',
        '- Decide who acted, who reacted or experienced the feeling, and toward whom. Distinguish events that occurred now from hypotheticals, negations, remembered history, proposals, or reports about another person.',
        '- Financial relief does not automatically establish Trust or Affection. Intimacy does not automatically establish Desire toward the player. General relaxation does not automatically mean reduced interpersonal Tension toward the player. Grief about another person must not be attributed to the player.',
        '- priority must order supported nonzero axes from strongest/most central to weakest. Repeated aftermath or restatement of an already-scored event is zero unless something genuinely new happens.',`,
        'recovery per-axis LLM instructions',
    );

    fs.writeFileSync(path, source);
}

// Keep the foreground generation contract identical to recovery scanning.
{
    const path = 'v03/injection.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak, but zero must still be reported as an explicit evaluation.',
        'MULTI-AXIS RELATIONSHIP EVIDENCE: justify every nonzero axis independently from the current exchange. Runtime may discard unsupported axes while preserving independently grounded axes, so do not bundle speculative Trust/Affection/Desire/Tension movement onto one strong event.',
        'RELATIONSHIP HARDENING: ordinary may affect at most 1 axis, meaningful 2, major 3, extreme 4. Repeated aftermath or semantically duplicate events are zero. Raw deltas are evidence weights and high established relationships resist further deepening. Desire requires explicit romantic/intimate/physical attraction evidence in the visible CURRENT exchange; friendship, gratitude, rescue, beauty, proximity, trust, and generic affection are not Desire. Do not write a Relationship Summary deeper or more absolute than the accepted relationship state supports. The injected Player relationship lens is deliberately QUALITATIVE; never infer or echo hidden numeric meter values from its wording.',
        'RELATIONSHIP EVIDENCE: quote a short concrete event from the current exchange; preserve who acted, negation, and the outcome. Do not replace a quote with an inferred absolute trust/affection claim. Opposite outcomes are new events, while repeated aftermath earns zero. RELATIONSHIP MILESTONE GATES: absolute relationship depth is checkpointed at 25, 50, 75, and 90 independently per axis and positive/negative direction. Ordinary evidence may reach a locked boundary but cannot deepen beyond it. Crossing 25 requires meaningful-or-stronger evidence; 50 requires major-or-stronger with at least 3 raw points on that axis; 75 requires extreme with at least 5 raw points; 90 requires an extreme relationship-defining event with at least 8 raw points. Movement toward neutral is never gate-blocked. Do not inflate impact or delta merely to open a gate; the backend is authoritative.',`,
        `        'Relationship deltas require concrete CURRENT-exchange evidence. You interpret narrative meaning; runtime validates per-axis quotation provenance, structure, numeric limits, duplicate application, inertia, and milestone gates rather than using relationship keywords as semantic authority.',
        'PER-AXIS RELATIONSHIP EVIDENCE: every nonzero Trust/Affection/Desire/Tension proposal MUST include axisEvidence[axis] with 1-3 short VERBATIM excerpts copied from permitted current-exchange relationship evidence and a concise explanation of why those facts change THIS NPC on THAT axis toward the PLAYER. One event may support several axes only with a separate explanation for each.',
        'RELATIONSHIP CONTEXT JUDGMENT: identify who acted, who reacted or experienced the feeling, and toward whom. Distinguish events that actually occurred now from hypotheticals, negations, memories, plans, proposals, or reports. Financial/material relief is not automatically Trust/Affection; intimacy is not automatically Desire toward the player; general relaxation is not automatically reduced interpersonal Tension; grief about another person is not a player-caused relationship shift.',
        'RELATIONSHIP PRIORITY: ordinary may affect at most 1 axis, meaningful 2, major 3, extreme 4. Put supported nonzero axes in priority strongest/most central first so overflow can be resolved without discarding tied candidates. Raw deltas are evidence weights and high established relationships resist further deepening.',
        'RELATIONSHIP EVIDENCE BOUNDARIES: visible narrative and permitted private relationship context may be quoted according to the structured-evidence rules. World_State and reference/control blocks are not unrestricted relationship-event evidence. Private thought may support an internal attitude but does not by itself prove visible speech, action, gesture, or reaction.',
        'RELATIONSHIP REPEATS AND GATES: repeated aftermath/restatement of an already-scored event is zero unless a genuinely new relationship-changing event occurs. Absolute depth is checkpointed at 25/50/75/90 independently by axis/polarity. Ordinary may reach a locked boundary but not deepen beyond it; crossing 25 needs meaningful+, 50 major+ with raw 3, 75 extreme raw 5, 90 extreme relationship-defining raw 8. Movement toward neutral is not gate-blocked. Never inflate impact/delta to force a gate.',
        'Do not write a Relationship Summary deeper or more absolute than accepted state supports. The Player relationship lens is deliberately QUALITATIVE; never infer or echo hidden numeric meter values from its wording.',`,
        'foreground LLM relationship instructions',
    );
    source = replaceRequired(
        source,
        `"relationshipChange":{"evaluated":true,"impact":"none|ordinary|meaningful|major|extreme","delta":{"trust":0,"affection":0,"desire":0,"tension":0},"evidence":"","reason":"required even when impact is none"}`,
        `"relationshipChange":{"evaluated":true,"impact":"none|ordinary|meaningful|major|extreme","delta":{"trust":0,"affection":0,"desire":0,"tension":0},"priority":["supported nonzero axes strongest/most central first"],"axisEvidence":{"trust":{"excerpts":["1-3 exact current-exchange quotations"],"explanation":"why this changes Trust toward the PLAYER"}},"evidence":"optional compact overall event summary","reason":"overall evaluation; required when impact is none"}`,
        'foreground output schema',
    );
    fs.writeFileSync(path, source);
}

// Diagnostics expose requested/capped/applied movement and the exact per-axis evidence trail.
{
    const path = 'v03/dossier-view.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceSection(
        source,
        'function relationshipDiagnosticsHtml(npc = {}) {',
        'function block(title, body, className = \'\') {',
        `function relationshipDiagnosticsHtml(npc = {}) {
    const signed = value => (Number(value) > 0 ? '+' : '') + Number(value || 0);
    const axes = RELATIONSHIP_AXES.map(axis => {
        const score = Number(npc.relationship?.[axis] || 0);
        const direction = Math.sign(score) || 1;
        const gates = RELATIONSHIP_MILESTONE_THRESHOLDS.map(threshold =>
            signed(direction * threshold) + ' ' + (relationshipMilestoneUnlocked(npc.relationshipMilestones, axis, direction, threshold) ? 'unlocked' : 'locked')).join(', ');
        return '<li><b>' + escapeHtml(axis) + '</b>: ' + score + '; fractional progress ' + signed(npc.relationshipProgress?.[axis]) + '<br><small>' + escapeHtml(gates) + '</small></li>';
    }).join('');
    const attempts = (npc.relationshipDiagnostics || []).slice(-12).reverse().map(event => {
        const rows = RELATIONSHIP_AXES.filter(axis => event.proposed?.[axis] || event.capped?.[axis] || event.applied?.[axis] || event.axisEvidence?.[axis] || event.axisReasons?.[axis]?.length).map(axis => {
            const evidence = event.axisEvidence?.[axis] || {};
            const excerpts = (evidence.excerpts || []).map(excerpt => '“' + excerpt + '”').join(' | ');
            const sources = (event.verifiedSources?.[axis] || []).join(', ');
            const axisReasons = (event.axisReasons?.[axis] || []).join(', ');
            const detail = axis + ': requested ' + signed(event.proposed?.[axis]) + ', capped ' + signed(event.capped?.[axis]) + ', applied ' + signed(event.applied?.[axis])
                + '; fraction ' + signed(event.progressBefore?.[axis]) + ' → ' + signed(event.progressAfter?.[axis]);
            return '<div><b>' + escapeHtml(detail) + '</b>'
                + (evidence.explanation ? '<p>' + escapeHtml(evidence.explanation) + '</p>' : '')
                + (excerpts ? '<small>Evidence: ' + escapeHtml(excerpts) + '</small>' : '')
                + (sources ? '<small><br>Verified source: ' + escapeHtml(sources) + '</small>' : '')
                + (axisReasons ? '<small><br>Axis result: ' + escapeHtml(axisReasons) + '</small>' : '') + '</div>';
        }).join('');
        const unlocks = (event.unlocks || []).map(entry => entry.axis + ' ' + signed(entry.polarity * entry.threshold) + ' unlocked').join(', ');
        const noChange = (event.reasons || []).includes('evaluated-no-change') ? 'Evaluated; no relationship movement warranted.' : '';
        const priority = (event.priority || []).length ? 'Priority: ' + event.priority.join(' → ') : '';
        return '<li><b>' + escapeHtml(event.impact + ' — ' + (event.reasons || []).join(', ')) + '</b>'
            + (priority ? '<p>' + escapeHtml(priority) + '</p>' : '')
            + (rows || noChange ? (rows || '<p>' + escapeHtml(noChange) + '</p>') : '<p>No score change.</p>')
            + (unlocks ? '<small>' + escapeHtml(unlocks) + '</small>' : '')
            + (event.reason ? '<small><br>Overall: ' + escapeHtml(event.reason) + '</small>' : '') + '</li>';
    }).join('');
    return '<details><summary>Gate status and recent relationship evaluations</summary><ul>' + axes + '</ul>'
        + (attempts ? '<ol class="npc-state-v3-history-list">' + attempts + '</ol>' : '<p>No scoring diagnostics recorded yet.</p>') + '</details>';
}`,
        'relationship diagnostic UI',
        'Verified source:',
    );
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.20 relationship evidence contract');
