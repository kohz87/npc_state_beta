import { relationshipImpactRank, relationshipMilestoneEventQualifies, relationshipInertiaFactor, relationshipAxisLimit } from './relationship-rules.js';
import { relationshipEvidenceExcerptMatch, relationshipEvidenceGrounding } from './relationship-evidence.js';
import { containsNormalizedPhrase, relationshipSummaryRepairContext } from './scan-helpers.js';
import { DEFAULT_RELATIONSHIP_CAPS, RELATIONSHIP_AXES, RELATIONSHIP_MILESTONE_THRESHOLDS, applyRelationshipMilestoneCrossings, normalizeRelationship, normalizeRelationshipAxisEvidence, normalizeRelationshipCaps, normalizeRelationshipDiagnostics, normalizeRelationshipEvidenceHistory, normalizeRelationshipPriority, normalizeRelationshipProgress, normalizeRelationshipSummary, relationshipMilestoneUnlocked } from './schema.js';

const IMPACTS = new Set(['none', 'ordinary', 'meaningful', 'major', 'extreme']);

function selectRelationshipAxes(delta, axisLimit, priority = []) {
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

function relationshipDuplicateEvidenceKey(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/\r\n?/g, '\n')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase()
        .slice(0, 2400);
}

function relationshipEventFingerprint(value) {
    const source = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function relationshipSourceEventKey(options = {}) {
    const sourceMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
    const sources = relationshipEvidenceSourcesForOptions(options);
    const canonicalSources = JSON.stringify(sources.map(source => [
        String(source?.id || ''),
        String(source?.kind || ''),
        relationshipDuplicateEvidenceKey(source?.text || ''),
    ]));
    if (canonicalSources) return 'msg:' + String(sourceMessageId ?? 'na') + ':' + relationshipEventFingerprint(canonicalSources);
    if (sourceMessageId !== null) return 'msg:' + String(sourceMessageId);
    if (Number.isInteger(options.turn)) return 'turn:' + String(options.turn);
    return '';
}

function relationshipAxisLooksDuplicate(npc, change, axis, options = {}) {
    const currentEventKey = relationshipSourceEventKey(options);
    const sourceMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
    const turn = Number.isInteger(options.turn) ? options.turn : null;
    const history = normalizeRelationshipEvidenceHistory(npc?.relationshipEvidenceHistory);
    return history.some(previous => {
        if (currentEventKey && previous.sourceEventKey) return previous.sourceEventKey === currentEventKey;
        // Legacy evidence events predate sourceEventKey. Keep conservative same-event replay
        // protection for those rows, but never use identical quotation text as event identity.
        if (!previous.sourceEventKey) {
            if (sourceMessageId !== null && Number.isInteger(previous.sourceMessageId) && previous.sourceMessageId === sourceMessageId) return true;
            if (turn !== null && Number.isInteger(previous.turn) && previous.turn === turn) return true;
        }
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
}

function relationshipSummarySupported(value, relationship, milestones) {
    const summary = normalizeRelationshipSummary(value);
    if (!summary) return false;
    const rel = normalizeRelationship(relationship || {});
    const positiveStrength = Math.max(0, rel.trust, rel.affection, rel.desire);
    const unlocked = (axis, polarity, threshold) => relationshipMilestoneUnlocked(milestones, axis, polarity, threshold);
    const desireClaims = /\b(madly in love|in love|romantic|romance|sexually|sexual attraction|lust|desire[sd]?|intimate attraction|physically attracted|yearns? for)\b/i;
    const tropeClaims = /\b(possessive|jealous|obsessive|obsessed|would kill|kill anyone|belongs to (?:him|her|them|the player)|unconditionally devoted|utterly devoted)\b/i;
    const absoluteClaims = /\b(indispensable|everything to (?:her|him|them)|cannot live without|can't live without|completely dependent|utterly dependent)\b/i;
    const deepTrustClaims = /\b(deep(?:est)? trust|deeply trusts?|profound trust|unwavering trust|unquestion(?:ing|ed) trust|complete trust|implicit trust)\b/i;
    const exceptionalTrustClaims = /\b(absolute trust|unbreakable trust|trusts? (?:him|her|them|the player) with (?:her|his|their) life|without reservation)\b/i;
    const deepAffectionClaims = /\b(deep affection|deeply attached|profound attachment|one of (?:her|his|their) most important people)\b/i;
    const exceptionalAffectionClaims = /\b(inseparable|irreplaceable|life-defining bond|devoted to (?:him|her|them|the player))\b/i;
    const deepDistrustClaims = /\b(deep distrust|profound distrust|deeply distrusts?|cannot trust (?:him|her|them|the player) at all)\b/i;
    const deepDislikeClaims = /\b(deep hatred|profound hatred|deep resentment|utterly hates?)\b/i;
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

function relationshipSummaryEvidenceGrounded(npc, patch, options = {}) {
    const raw = patch?.relationshipSummaryEvidence;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'missing-summary-evidence' };
    if (!Array.isArray(raw.excerpts) || raw.excerpts.some(value => typeof value !== 'string')) return { ok: false, reason: 'malformed-summary-evidence' };
    const excerpts = raw.excerpts.map(value => value.trim()).filter(Boolean).slice(0, 4);
    const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim().slice(0, 800) : '';
    if (excerpts.length < 1 || excerpts.length > 3 || !explanation) return { ok: false, reason: 'malformed-summary-evidence' };
    const sources = relationshipEvidenceSourcesForOptions(options);
    if (!sources.length) return { ok: false, reason: 'no-summary-evidence-source' };
    if (!excerpts.every(excerpt => relationshipEvidenceExcerptMatch(excerpt, sources))) return { ok: false, reason: 'out-of-scope-summary-evidence' };

    const subjectNames = [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])].map(value => String(value || '').trim()).filter(Boolean);
    const playerName = String(options.playerName || '').trim();
    if (!subjectNames.length || !playerName) return { ok: false, reason: 'summary-target-identity-unavailable' };
    const targetBound = excerpts.some(excerpt => subjectNames.some(name => containsNormalizedPhrase(excerpt, name)) && containsNormalizedPhrase(excerpt, playerName));
    if (!targetBound) return { ok: false, reason: 'wrong-summary-target' };

    const grounding = relationshipEvidenceGrounding(explanation, excerpts.join(' '), {
        subjectNames,
        objectNames: [playerName],
        otherSubjectNames: options.otherNpcNames || [],
        delta: {},
    });
    if (grounding) return { ok: false, reason: 'summary-evidence-' + grounding };
    return { ok: true, reason: '' };
}

function relationshipSummaryProposalGrounded(npc, patch, options = {}) {
    const evidence = relationshipSummaryEvidenceGrounded(npc, patch, options);
    if (evidence.ok) return evidence;

    // Compatibility: a validated nonzero numeric proposal already proves a current
    // relationship event. Preserve that established path while allowing descriptive
    // Current Dynamic evidence to stand on its own at zero delta.
    const caps = options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS;
    const change = relationshipDeltaForPatch(patch, caps);
    if (!change.evaluated || !change.impactValid || change.impact === 'none' || !change.hasRawMovement) return evidence;
    if (!RELATIONSHIP_AXES.some(axis => Number(change.delta?.[axis]) !== 0)) return evidence;
    const reasons = [...change.reasons];
    const provenance = relationshipAxisProvenance(change, options, { ...change.delta }, reasons);
    return RELATIONSHIP_AXES.some(axis => Number(provenance.delta?.[axis]) !== 0)
        ? { ok: true, reason: 'validated-numeric-relationship-evidence' }
        : evidence;
}

function relationshipSummaryDiagnostic(options, row) {
    if (Array.isArray(options.relationshipSummaryDiagnostics)) options.relationshipSummaryDiagnostics.push(row);
}

export function applyRelationshipSummaryProjection(npc, patch, options = {}) {
    const current = normalizeRelationshipSummary(npc?.relationshipSummary);
    if (patch?.relationshipSummary != null && typeof patch.relationshipSummary !== 'string') {
        relationshipSummaryDiagnostic(options, { npcId: npc.id, field: 'relationshipSummary', group: 'playerRelationship', channel: 'relationship-summary', status: 'rejected-proposal', reason: 'invalid-value-type:expected-string-value' });
        return npc;
    }
    const summary = normalizeRelationshipSummary(patch?.relationshipSummary);
    if (!summary) return npc;
    if (summary === current) {
        relationshipSummaryDiagnostic(options, { npcId: npc.id, field: 'relationshipSummary', group: 'playerRelationship', channel: 'relationship-summary', status: 'no-change-proposed' });
        return npc;
    }
    if (!relationshipSummarySupported(summary, npc.relationship, npc.relationshipMilestones)) {
        relationshipSummaryDiagnostic(options, { npcId: npc.id, field: 'relationshipSummary', group: 'playerRelationship', channel: 'relationship-summary', status: 'rejected-proposal', reason: 'unsupported-summary-intensity' });
        return npc;
    }

    const repairAllowed = options.repairRelationshipSummary === true
        && !current
        && Boolean(relationshipSummaryRepairContext(npc));
    const explicitReconcile = options.reconcileRelationshipSummary === true;
    const groundedCurrentProposal = relationshipSummaryProposalGrounded(npc, patch, options);
    if (!repairAllowed && !explicitReconcile && !groundedCurrentProposal.ok) {
        relationshipSummaryDiagnostic(options, { npcId: npc.id, field: 'relationshipSummary', group: 'playerRelationship', channel: 'relationship-summary', status: 'rejected-proposal', reason: groundedCurrentProposal.reason || 'summary-evidence-rejected' });
        return npc;
    }

    const next = structuredClone(npc);
    next.relationshipSummary = summary;
    relationshipSummaryDiagnostic(options, {
        npcId: npc.id, field: 'relationshipSummary', group: 'playerRelationship', channel: 'relationship-summary', status: 'applied',
        reason: repairAllowed ? 'repair-context' : (explicitReconcile ? 'explicit-reconcile' : groundedCurrentProposal.reason),
    });
    return next;
}

export function relationshipDeltaForPatch(patch, caps = DEFAULT_RELATIONSHIP_CAPS) {
    const raw = patch?.relationshipChange && typeof patch.relationshipChange === 'object' && !Array.isArray(patch.relationshipChange)
        ? patch.relationshipChange : null;
    const reasons = [];
    const zero = { trust: 0, affection: 0, desire: 0, tension: 0 };
    if (!raw) return { evaluated: false, impactValid: false, impact: 'none', proposed: zero, delta: zero, axisEvidence: {}, priority: [], evidence: '', reason: '', reasons, hasRawMovement: false };
    const impactText = typeof raw.impact === 'string' ? raw.impact.trim() : '';
    const impactValid = IMPACTS.has(impactText);
    const impact = impactValid ? impactText : 'none';
    const proposedRaw = raw.delta && typeof raw.delta === 'object' && !Array.isArray(raw.delta) ? raw.delta : {};
    const proposed = { ...zero };
    const delta = { ...zero };
    const effectiveCaps = normalizeRelationshipCaps(caps);
    const cap = impact === 'none' ? 0 : Number(effectiveCaps[impact] ?? 0);
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
        const explanation = typeof item.explanation === 'string' ? item.explanation.trim().slice(0, 800) : '';
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
                if (typeof entry !== 'string') { reasons.push('priority:invalid-axis-type'); continue; }
                const axis = entry.trim().toLocaleLowerCase();
                if (!RELATIONSHIP_AXES.includes(axis)) { reasons.push('priority:unknown-axis:' + axis.slice(0, 40)); continue; }
                if (!delta[axis]) { reasons.push('priority:nonmoving-axis:' + axis); continue; }
                if (!priority.includes(axis)) priority.push(axis);
            }
        }
    }
    priority = normalizeRelationshipPriority(priority);
    if (raw.evidence != null && typeof raw.evidence !== 'string') reasons.push('evidence:invalid-type');
    if (raw.reason != null && typeof raw.reason !== 'string') reasons.push('reason:invalid-type');
    return {
        evaluated: raw.evaluated === true,
        impactValid,
        impact,
        proposed,
        delta,
        axisEvidence: normalizeRelationshipAxisEvidence(axisEvidence),
        axisEvidenceStatus,
        priority,
        evidence: typeof raw.evidence === 'string' ? raw.evidence.trim().slice(0, 800) : '',
        reason: typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 800) : '',
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
        sourceEventKey: relationshipSourceEventKey(options),
        axisReasons: relationshipAxisReasons(reasons),
        reasons, unlocks, sourceMessageId: options.sourceMessageId, turn: options.turn, at: Date.now(),
    };
    return { ...next, relationshipDiagnostics: normalizeRelationshipDiagnostics([...(npc.relationshipDiagnostics || []), event]) };
}

export function relationshipEvaluationDiagnostic(npc, patch, options = {}) {
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
    const reason = typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 800) : '';
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
}

export function applyRelationshipChange(npc, patch, options = {}) {
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
    for (const axis of RELATIONSHIP_AXES) if (filteredDelta[axis] && !allowedAxes.has(axis)) reasons.push(axis + ':axis-limit');

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
                    reasons.push(axis + ':gate-tier');
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
                if (!reasons.includes(axis + ':gate-tier')) reasons.push(axis + ':gate-tier');
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

    if (!acceptedEvidence) return relationshipDiagnostic(npc, npc, change, options, reasons);

    next.relationship = updated;
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
        sourceEventKey: relationshipSourceEventKey(options),
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

    const progressChanged = RELATIONSHIP_AXES.some(axis => Number(next.relationshipProgress?.[axis] || 0) !== Number(priorProgress?.[axis] || 0));
    const relationshipStateChanged = visibleChanged || progressChanged || crossings.length > 0;
    if (progressChanged && !visibleChanged) reasons.push('fractional-progress');
    const partialAxisRejection = reasons.some(reason => /^(?:trust|affection|desire|tension):(?:non-finite|missing-axis-evidence|malformed-axis-evidence|missing-explanation|no-permitted-evidence-source|unverifiable-excerpt|duplicate|axis-limit)$/.test(reason));
    if (relationshipStateChanged && partialAxisRejection && !reasons.includes('partial-applied')) reasons.push('partial-applied');
    if (!reasons.length) reasons.push(relationshipStateChanged ? 'applied' : 'no-visible-change');
    return relationshipDiagnostic(npc, next, change, options, reasons, crossings);
}
