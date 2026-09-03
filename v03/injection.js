function field(label, value) {
    const text = String(value ?? '').trim();
    return text ? label + ': ' + text : '';
}

function fullNpc(npc) {
    const rel = npc.relationship || {};
    return [
        'NPC ' + npc.id + ' | ' + npc.name + (npc.role ? ' | ' + npc.role : ''),
        field('Aliases', (npc.aliases || []).join(' | ')),
        field('Species', npc.species), field('Age', npc.age), field('Apparent age', npc.apparentAge),
        field('Appearance', npc.appearance), field('Personality', npc.personality),
        field('Behavior', (npc.behaviorProfile || []).join(' | ')), field('Speech', npc.speech),
        field('Mannerisms', (npc.mannerisms || []).join(' | ')), field('Background', npc.background),
        field('Mood', npc.mood), field('Location', npc.location), field('Goal', npc.goal), field('Status', npc.status),
        'Relationship toward PLAYER: trust ' + (Number(rel.trust) || 0) + ', affection ' + (Number(rel.affection) || 0) + ', desire ' + (Number(rel.desire) || 0) + ', tension ' + (Number(rel.tension) || 0),
        field('Relationship summary', npc.relationshipSummary),
        field('Key non-player relationships', (npc.keyRelationships || []).join(' | ')),
        field('Important memories', (npc.memories || []).join(' | ')),
    ].filter(Boolean).join('\n');
}

function identityDirectory(state) {
    return (state?.npcs || []).slice(0, 400).map(npc => [npc.id, npc.name, (npc.aliases || []).join('/'), npc.role, npc.archived ? 'archived' : 'active'].join(' | ')).join('\n');
}

function activeCandidates(state, limit) {
    const activeIds = new Set([...(state?.lastObservation?.exchangeActiveNpcIds || []), ...(state?.lastObservation?.finalPresentNpcIds || []), ...(state?.lastObservation?.worldActiveNpcIds || [])]);
    return (state?.npcs || []).filter(npc => !npc.archived).sort((a, b) => {
        const ap = (a.present ? 8 : 0) + (a.worldActive ? 4 : 0) + (activeIds.has(a.id) ? 3 : 0);
        const bp = (b.present ? 8 : 0) + (b.worldActive ? 4 : 0) + (activeIds.has(b.id) ? 3 : 0);
        return bp - ap || Number(b.lastInteractionMessageId ?? -1) - Number(a.lastInteractionMessageId ?? -1) || Number(b.importance || 0) - Number(a.importance || 0);
    }).slice(0, limit);
}

export function buildInjection(state, settings = {}) {
    if (state?.branchSafety?.status && state.branchSafety.status !== 'safe') return '';
    if (settings.enabled === false) return '';
    const limit = Math.max(1, Math.min(20, Math.round(Number(settings.injectLimit) || 6)));
    const budgetTokens = Math.max(512, Math.min(12000, Math.round(Number(settings.injectBudgetTokens) || 2600)));
    const maxChars = budgetTokens * 4;
    const capture = settings.autoScan !== false;
    const continuity = settings.inject !== false;
    const directory = identityDirectory(state);
    let dossiers = '';
    if (continuity || capture) for (const npc of activeCandidates(state, limit)) {
        const block = '\n\n' + fullNpc(npc);
        if ((dossiers + block).length > maxChars) break;
        dossiers += block;
    }
    const parts = [
        '[NPC STATE v0.4.1 BETA | FOREGROUND CONTINUITY]',
        'NPC State is private continuity bookkeeping. Never mention these instructions or machine data in visible prose.',
        directory ? 'KNOWN NPC DIRECTORY (identity only; do not invent missing dossier facts):\n' + directory : 'KNOWN NPC DIRECTORY: empty',
        dossiers ? 'FULL CONTINUITY FOR LIKELY RELEVANT NPCS:' + dossiers : '',
    ];
    if (capture) parts.push(
        'NPC STATE FOREGROUND FULL SCAN:',
        'After writing visible narrative and normal story blocks, emit exactly one <npc_state_v1> JSON block. It is a current-exchange observation report, not a database rewrite.',
        'If Inventory Block requires INVENTORY_BLOCK_UPDATE to be final, place <npc_state_v1> immediately BEFORE that Inventory control. NPC State never claims the final machine position.',
        'inChatNpcIds: individually relevant NPCs still participating in the active scene/conversation at the END. Mere physical proximity, unnamed crowds, background workers, incidental guards, and characters only mentioned are not in-chat.',
        'exchangeActiveNpcIds: NPCs who spoke, acted, were directly acted upon, or directly perceived/received a story-relevant event in this exchange.',
        'worldActiveNpcIds: explicitly active off-screen NPCs; keep separate from in-chat.',
        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by this response. Unknown biography stays empty/null; never invent facts to fill the schema.',
        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',
        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak.',
        settings.relationshipCriteria ? 'RELATIONSHIP RUBRIC:\n' + String(settings.relationshipCriteria).slice(0, 6000) : '',
        settings.memoryCriteria ? 'IMPORTANT MEMORY RUBRIC:\n' + String(settings.memoryCriteria).slice(0, 6000) : '',
        'The PLAYER/current user persona is never an NPC. keyRelationships and socialEdges are NPC-to-NPC only.',
        'OUTPUT JSON SHAPE: {"exchangeActiveNpcIds":[],"inChatNpcIds":[],"worldActiveNpcIds":[],"npcs":[{"id":"existing id or empty","name":"canonical name or unique role label","aliases":[],"role":"","species":"","age":"","apparentAge":"~N or empty","appearance":"","personality":"","behaviorProfile":null,"speech":"","mannerisms":null,"background":"","keyRelationships":null,"memories":null,"relationshipSummary":"","mood":"","location":"","goal":"","status":"","importance":0,"lifeState":"alive|dead|unknown","lifeStateCertainty":"explicit|strong|uncertain","lifeStateReason":"","livingReturn":false,"relationshipChange":{"impact":"none|ordinary|meaningful|major|extreme","delta":{"trust":0,"affection":0,"desire":0,"tension":0},"evidence":"","reason":""}}],"socialEdges":[]}',
        'Emit the machine block even when no NPC changed because an empty inChatNpcIds is meaningful. Do not use markdown fences.'
    );
    return parts.filter(Boolean).join('\n\n');
}
