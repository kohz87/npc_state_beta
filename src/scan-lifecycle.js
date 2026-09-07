import { containsNormalizedPhrase, evidenceTextKey, identityTokenMention, shortActivityIdentityCandidates, shortActivityIdentityUnique } from './scan-helpers.js';
import { applyConfirmedDeathTransition, normalizeLifeStateDiagnostics } from './schema.js';

function lifeStateEvidenceGrounded(evidence, context) {
    const proof = evidenceTextKey(evidence, 1600);
    const source = evidenceTextKey(context, 30000);
    // Life-state changes are high-impact continuity transitions. Unlike ordinary profile
    // refinement, their evidence provenance must be source-span grounded rather than
    // accepted by the broader fuzzy profile matcher. Semantic meaning remains model-owned.
    return Boolean(proof && source && source.includes(proof));
}

function lifeStateEvidenceMatchesStoredStatus(evidence, storedStatus) {
    const proof = evidenceTextKey(evidence, 1600);
    const stored = evidenceTextKey(storedStatus, 1600);
    // Stored Status is already scoped to one dossier. Exact normalized equality supplies
    // provenance + identity binding only; the scanner model still decides whether that
    // condition semantically means confirmed death. This path is death-repair only.
    return Boolean(proof && stored && proof === stored);
}

function lifeStateEvidenceTargetsNpc(state, npc, evidence) {
    const proof = String(evidence || '').trim();
    if (!proof) return false;
    const variants = [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]
        .map(value => String(value || '').trim()).filter(Boolean);
    if (variants.some(value => containsNormalizedPhrase(proof, value))) return true;
    // Multi-token canonical names may be referred to by a unique short identity already
    // accepted by the general presence system. This is identity binding only; it does not
    // infer death, survival, negation, attribution, or grammatical role.
    return shortActivityIdentityCandidates(npc).some(candidate =>
        shortActivityIdentityUnique(state, npc, candidate) && identityTokenMention(proof, candidate));
}

function lifeStateCertaintyConfirmed(value) {
    return ['explicit', 'strong', 'confirmed'].includes(String(value || '').trim().toLocaleLowerCase());
}

function lifeStateDiagnostic(npc, patch, options, code, detail) {
    const next = structuredClone(npc);
    next.lifeStateDiagnostics = normalizeLifeStateDiagnostics([...(next.lifeStateDiagnostics || []), {
        proposedState: String(patch?.lifeState || '').trim().toLocaleLowerCase(),
        certainty: String(patch?.lifeStateCertainty || '').trim(),
        evidence: String(patch?.lifeStateReason || '').trim(),
        code,
        detail,
        livingReturn: patch?.livingReturn === true,
        sourceMessageId: Number.isInteger(options?.sourceMessageId) ? options.sourceMessageId : null,
        turn: Number.isInteger(options?.turn) ? options.turn : null,
        at: Date.now(),
    }]);
    return next;
}

export function applyLifeState(npc, patch, options = {}) {
    const next = structuredClone(npc);
    const lifeState = String(patch?.lifeState || '').trim().toLocaleLowerCase();
    const certainty = String(patch?.lifeStateCertainty || '').trim();
    const reason = String(patch?.lifeStateReason || '').trim();
    const policy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;
    const lifeContext = policy?.detected
        ? [policy.visibleText, policy.worldStateText].filter(Boolean).join('\n')
        : String(options.profileContext || '');
    const storedStatusDeathRepair = lifeState === 'dead'
        && lifeStateEvidenceMatchesStoredStatus(reason, options.storedStatus);
    const grounded = storedStatusDeathRepair || lifeStateEvidenceGrounded(reason, lifeContext);
    const targeted = storedStatusDeathRepair || lifeStateEvidenceTargetsNpc(options.state, npc, reason);
    const wasDead = String(npc?.lifeState || '').toLocaleLowerCase() === 'dead'
        || (npc?.archived === true && String(npc?.archiveReason || '').toLocaleLowerCase() === 'deceased');
    const reject = (code, detail) => lifeStateDiagnostic(next, patch, options, code, detail);

    // The scanner model owns semantic interpretation. The backend verifies only that its
    // evidence came from permitted source text and that a death judgment is sufficiently certain.
    if (patch?.livingReturn === true) {
        if (!reason) return reject('missing-evidence', 'livingReturn requires grounded lifeStateReason evidence.');
        if (!grounded) return reject('unverifiable-evidence', 'livingReturn evidence was not found as a permitted current narrative or World_State source span.');
        if (!targeted) return reject('target-mismatch', 'livingReturn evidence does not bind this dossier to the cited source span.');
        if (!lifeStateCertaintyConfirmed(certainty)) return reject('insufficient-certainty', 'livingReturn requires lifeStateCertainty explicit or strong.');
        next.archived = false;
        next.archiveReason = '';
        next.archivedAt = null;
        next.lifeState = 'alive';
        next.lifeStateCertainty = certainty || 'explicit';
        next.lifeStateReason = reason;
        return next;
    }

    if (lifeState === 'dead') {
        if (!reason) return reject('missing-evidence', 'Confirmed death requires grounded lifeStateReason evidence.');
        if (!grounded) return reject('unverifiable-evidence', 'Death evidence was not found as a permitted current narrative or World_State source span.');
        if (!targeted) return reject('target-mismatch', 'Death evidence does not bind this dossier to the cited source span.');
        if (!lifeStateCertaintyConfirmed(certainty)) return reject('insufficient-certainty', 'Confirmed death requires lifeStateCertainty explicit or strong.');
        return applyConfirmedDeathTransition(next, { certainty, reason, at: Date.now() });
    }

    // Merely outputting alive must never resurrect a confirmed dead dossier.
    if (lifeState === 'alive' && wasDead) return reject('living-return-required', 'A confirmed-dead dossier can return to alive only through livingReturn with grounded evidence.');
    if (['alive', 'unknown'].includes(lifeState)) {
        if (!reason) return reject('missing-evidence', 'Life-state updates require grounded lifeStateReason evidence.');
        if (!grounded) return reject('unverifiable-evidence', 'Life-state evidence was not found as a permitted current narrative or World_State source span.');
        if (!targeted) return reject('target-mismatch', 'Life-state evidence does not bind this dossier to the cited source span.');
        next.lifeState = lifeState;
        next.lifeStateCertainty = certainty;
        next.lifeStateReason = reason;
        return next;
    }
    if (lifeState) return reject('unsupported-state', 'Scanner proposed an unsupported lifeState value.');
    return next;
}
