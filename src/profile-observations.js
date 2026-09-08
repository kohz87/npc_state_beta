import { normalizeNpc, normalizeProfileEvolutionEvidence } from './schema.js';
import { profileEvolutionEvidenceDuplicate, semanticSourceEventKey, validateSemanticSourceReference } from './model/semantic-updates.js';

const PROFILE_FIELDS = new Set(['personality', 'behaviorProfile', 'speech', 'mannerisms']);

function text(value, max = 600) {
    return typeof value === 'string' ? value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function validSources(value) {
    if (!Array.isArray(value) || !value.length) return false;
    return value.slice(0, 6).every(raw => raw && typeof raw === 'object' && !Array.isArray(raw)
        && (raw.messageId == null || Number.isInteger(raw.messageId))
        && typeof raw.excerpt === 'string' && Boolean(raw.excerpt.trim()));
}

function diagnostic(patchIndex, observationIndex, field, status, reason = '') {
    return {
        patchIndex,
        observationIndex,
        field: field || 'profileObservations',
        group: 'profile',
        channel: 'profile-observation',
        status,
        ...(reason ? { reason } : {}),
    };
}

export function applyProfileObservations(stateInput, result = {}, options = {}) {
    const state = structuredClone(stateInput || {});
    const diagnostics = [];
    const patches = Array.isArray(result?.npcs) ? result.npcs : [];
    const resolutions = Array.isArray(options.patchResolutions) ? options.patchResolutions : [];

    for (let patchIndex = 0; patchIndex < patches.length; patchIndex += 1) {
        const patch = patches[patchIndex];
        if (!Object.prototype.hasOwnProperty.call(patch || {}, 'profileObservations')) continue;
        const proposals = patch?.profileObservations;
        if (!Array.isArray(proposals)) {
            diagnostics.push(diagnostic(patchIndex, null, '', 'rejected-proposal', 'invalid-value-type:expected-array'));
            continue;
        }
        const resolution = resolutions[patchIndex];
        if (resolution?.status !== 'accepted' || !resolution.npcId) {
            diagnostics.push(diagnostic(patchIndex, null, '', 'rejected-proposal', 'observation-target-not-accepted'));
            continue;
        }
        const existingNpcIds = options.existingNpcIds instanceof Set ? options.existingNpcIds : null;
        if (existingNpcIds && !existingNpcIds.has(resolution.npcId)) {
            diagnostics.push(diagnostic(patchIndex, null, '', 'rejected-proposal', 'observation-target-not-existing'));
            continue;
        }
        const npcIndex = (state.npcs || []).findIndex(npc => npc.id === resolution.npcId);
        if (npcIndex < 0) {
            diagnostics.push(diagnostic(patchIndex, null, '', 'rejected-proposal', 'observation-target-missing'));
            continue;
        }
        let npc = state.npcs[npcIndex];
        for (let observationIndex = 0; observationIndex < proposals.length && observationIndex < 12; observationIndex += 1) {
            const raw = proposals[observationIndex];
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
                diagnostics.push(diagnostic(patchIndex, observationIndex, '', 'rejected-proposal', 'invalid-value-type:expected-object'));
                continue;
            }
            const field = typeof raw.field === 'string' ? raw.field.trim() : '';
            const observation = text(raw.observation, 500);
            const concept = raw.concept == null ? observation : text(raw.concept, 180);
            if (!PROFILE_FIELDS.has(field)) {
                diagnostics.push(diagnostic(patchIndex, observationIndex, field, 'rejected-proposal', 'unsupported-observation-field'));
                continue;
            }
            if (!observation || !concept || (raw.explanation != null && typeof raw.explanation !== 'string') || !validSources(raw.sources)) {
                diagnostics.push(diagnostic(patchIndex, observationIndex, field, 'rejected-proposal', 'invalid-observation-shape'));
                continue;
            }
            const validation = validateSemanticSourceReference({ field, sources: raw.sources }, options);
            if (!validation.ok) {
                diagnostics.push(diagnostic(patchIndex, observationIndex, field, 'rejected-proposal', validation.reason));
                continue;
            }
            const rows = validation.rows || [];
            const sourceMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
            const sourceEventKey = semanticSourceEventKey(rows, options);
            const evidence = rows.map(row => text(row.excerpt, 1000)).filter(Boolean).join(' | ').slice(0, 600);
            const candidate = {
                field,
                kind: 'observation',
                mode: 'gradual',
                concept,
                evidence,
                sourceEventKey,
                sourceMessageId,
                turn: Number.isInteger(options.turn) ? options.turn : null,
                at: Date.now(),
            };
            if (profileEvolutionEvidenceDuplicate(npc.profileEvolutionEvidence, candidate)) {
                diagnostics.push(diagnostic(patchIndex, observationIndex, field, 'no-change-proposed', 'duplicate-owned-observation'));
                continue;
            }
            const nextEvidence = normalizeProfileEvolutionEvidence([...(npc.profileEvolutionEvidence || []), candidate]);
            if (nextEvidence.length === normalizeProfileEvolutionEvidence(npc.profileEvolutionEvidence).length
                && JSON.stringify(nextEvidence) === JSON.stringify(normalizeProfileEvolutionEvidence(npc.profileEvolutionEvidence))) {
                diagnostics.push(diagnostic(patchIndex, observationIndex, field, 'no-change-proposed', 'observation-not-retained'));
                continue;
            }
            npc = normalizeNpc({
                ...npc,
                profileEvolutionEvidence: nextEvidence,
                updatedAt: Math.max(Date.now(), Number(npc.updatedAt || 0) + 1),
            });
            state.npcs[npcIndex] = npc;
            diagnostics.push(diagnostic(patchIndex, observationIndex, field, 'observation-recorded'));
        }
    }
    return { state, diagnostics };
}
