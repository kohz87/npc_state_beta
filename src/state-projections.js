export function dossierIndexProjection(npc = {}) {
    const portrait = npc?.portrait && typeof npc.portrait === 'object' ? npc.portrait : {};
    return {
        id: String(npc?.id || ''),
        name: String(npc?.name || ''),
        aliases: Array.isArray(npc?.aliases) ? npc.aliases.map(value => String(value || '')).filter(Boolean) : [],
        role: String(npc?.role || ''),
        species: String(npc?.species || ''),
        age: String(npc?.age ?? ''),
        apparentAge: String(npc?.apparentAge ?? ''),
        birthday: String(npc?.birthday ?? ''),
        present: npc?.present === true,
        worldActive: npc?.worldActive === true,
        archived: npc?.archived === true,
        archiveReason: String(npc?.archiveReason || ''),
        lifeState: String(npc?.lifeState || 'unknown'),
        minor: npc?.minor === true,
        portraitAvailable: Boolean(String(portrait.dataUrl || portrait.url || portrait.src || '').trim()),
        updatedAt: Number(npc?.updatedAt) || 0,
    };
}

export function npcPortraitSource(npc = {}) {
    const portrait = npc?.portrait && typeof npc.portrait === 'object' ? npc.portrait : {};
    return String(portrait.dataUrl || portrait.url || portrait.src || '').trim();
}

function projectedStringArray(value) {
    return Array.isArray(value) ? value.map(item => String(item ?? '')).filter(Boolean) : [];
}

function projectedAppearanceForms(value) {
    return Array.isArray(value) ? value.map(form => ({
        name: String(form?.name || ''),
        appearance: String(form?.appearance || ''),
    })).filter(form => form.name || form.appearance) : [];
}

function injectionNpcProjection(npc = {}) {
    const rel = npc?.relationship && typeof npc.relationship === 'object' ? npc.relationship : {};
    return {
        id: String(npc?.id || ''),
        name: String(npc?.name || ''),
        aliases: projectedStringArray(npc?.aliases),
        role: String(npc?.role || ''),
        species: String(npc?.species || ''),
        age: String(npc?.age ?? ''),
        apparentAge: String(npc?.apparentAge ?? ''),
        birthday: String(npc?.birthday ?? ''),
        appearance: String(npc?.appearance || ''),
        currentForm: String(npc?.currentForm || ''),
        appearanceForms: projectedAppearanceForms(npc?.appearanceForms),
        personality: String(npc?.personality || ''),
        behaviorProfile: projectedStringArray(npc?.behaviorProfile),
        speech: String(npc?.speech || ''),
        manualProfileFields: projectedStringArray(npc?.manualProfileFields),
        profileEvolutionEvidence: Array.isArray(npc?.profileEvolutionEvidence) ? npc.profileEvolutionEvidence.slice(-6).map(row => ({
            field: String(row?.field || ''),
            kind: row?.kind === 'observation' ? 'observation' : 'applied',
            ...(row?.kind === 'observation' ? {} : { mode: String(row?.mode || '') }),
            concept: String(row?.concept || ''),
            sourceMessageId: Number.isInteger(row?.sourceMessageId) ? row.sourceMessageId : null,
            evidence: String(row?.evidence || ''),
        })) : [],
        goal: String(npc?.goal || ''),
        status: String(npc?.status || ''),
        lifeState: String(npc?.lifeState || 'unknown'),
        lifeStateCertainty: String(npc?.lifeStateCertainty || ''),
        keyRelationships: projectedStringArray(npc?.keyRelationships),
        relationship: {
            trust: Number(rel.trust) || 0,
            affection: Number(rel.affection) || 0,
            desire: Number(rel.desire) || 0,
            tension: Number(rel.tension) || 0,
        },
        relationshipSummary: String(npc?.relationshipSummary || ''),
        mannerisms: projectedStringArray(npc?.mannerisms),
        memories: projectedStringArray(npc?.memories),
        mood: String(npc?.mood || ''),
        location: String(npc?.location || ''),
        background: String(npc?.background || ''),
        present: npc?.present === true,
        worldActive: npc?.worldActive === true,
        archived: npc?.archived === true,
        archiveReason: String(npc?.archiveReason || ''),
        minor: npc?.minor === true,
        importance: Number(npc?.importance) || 0,
        lastInteractionMessageId: Number.isInteger(npc?.lastInteractionMessageId) ? npc.lastInteractionMessageId : null,
        updatedAt: Number(npc?.updatedAt) || 0,
    };
}

// prompt construction gets only the fields it consumes.
export function injectionStateProjection(state = {}) {
    const observation = state?.lastObservation && typeof state.lastObservation === 'object' ? state.lastObservation : {};
    return {
        branchSafety: {
            status: String(state?.branchSafety?.status || 'safe'),
            kind: String(state?.branchSafety?.kind || ''),
            reason: String(state?.branchSafety?.reason || ''),
        },
        recovery: state?.recovery ? { status: String(state.recovery.status || '') } : null,
        lastObservation: {
            exchangeActiveNpcIds: projectedStringArray(observation.exchangeActiveNpcIds),
            finalPresentNpcIds: projectedStringArray(observation.finalPresentNpcIds),
            worldActiveNpcIds: projectedStringArray(observation.worldActiveNpcIds),
        },
        npcs: Array.isArray(state?.npcs) ? state.npcs.map(injectionNpcProjection) : [],
    };
}
