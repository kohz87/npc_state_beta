function field(label, value) {
    const text = String(value ?? '').trim();
    return text ? label + ': ' + text : '';
}

function appearanceFormsText(npc = {}) {
    const forms = Array.isArray(npc.appearanceForms) ? npc.appearanceForms.filter(Boolean) : [];
    if (!forms.length) return '';
    const currentKey = String(npc.currentForm || '').trim().toLocaleLowerCase();
    const ordered = [...forms].sort((a, b) => Number(String(b?.name || '').trim().toLocaleLowerCase() === currentKey) - Number(String(a?.name || '').trim().toLocaleLowerCase() === currentKey));
    const rows = [];
    let used = 0;
    for (const form of ordered.slice(0, 12)) {
        const name = String(form?.name || '').trim();
        const appearance = String(form?.appearance || '').trim().slice(0, 1200);
        if (!name || !appearance) continue;
        const row = name + (name.toLocaleLowerCase() === currentKey ? ' [CURRENT]' : '') + ': ' + appearance;
        if (used + row.length > 6000) break;
        rows.push(row);
        used += row.length;
    }
    return rows.join(' | ');
}

function fullNpc(npc) {
    const rel = npc.relationship || {};
    return [
        'NPC ' + npc.id + ' | ' + npc.name + (npc.role ? ' | ' + npc.role : ''),
        field('Aliases', (npc.aliases || []).join(' | ')),
        field('Species', npc.species), field('Actual age', npc.age), field('Apparent age', npc.apparentAge),
        field('Appearance', npc.appearance), field('Current form', npc.currentForm), field('Known physical forms', appearanceFormsText(npc)), field('Personality', npc.personality),
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
    const directoryRaw = identityDirectory(state);
    const directory = directoryRaw.slice(0, maxChars);
    const remainingChars = Math.max(0, maxChars - directory.length);
    let dossiers = '';
    if (continuity || capture) for (const npc of activeCandidates(state, limit)) {
        const block = '\n\n' + fullNpc(npc);
        if ((dossiers + block).length > remainingChars) break;
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
        'If Inventory Block emits an Inventory machine snapshot (including INVENTORY_BLOCK_V05 or older INVENTORY_BLOCK_UPDATE transport), keep it standalone and place <npc_state_v1> immediately BEFORE that Inventory control. NPC State never claims the final machine position.',
        'inChatNpcIds: individually relevant NPCs still participating in the active scene/conversation at the END. Mere physical proximity, unnamed crowds, background workers, incidental guards, and characters only mentioned are not in-chat.',
        'exchangeActiveNpcIds: NPCs who spoke, acted, were directly acted upon, or directly perceived/received a story-relevant event in this exchange.',
        'worldActiveNpcIds: explicitly active off-screen NPCs; keep separate from in-chat.',
        'status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now, for example standing watch at the gate, bandaging a wound, travelling toward Bluewatch, or asleep by the hearth. It is NOT lifecycle presence. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; those are tracked separately.',
        'age is ACTUAL chronological age only. Use one grounded numeric age. Years use N or ~N; when canon explicitly gives smaller units, use N days, N weeks, or N months. Never put child, teenager, adult, young adult, middle-aged, elder, elderly, old, or any other life-stage label in age. Never infer actual age from appearance. For an existing NPC, leave age empty unless this response explicitly establishes a more authoritative actual age; do not re-estimate it each turn. apparentAge is the separate visual estimate and uses ~N only.',
        'appearance is shared/common physical description, or ordinary single-form appearance. currentForm is live physical-form state only; leave it empty for ordinary non-transforming NPCs. Clothing, disguises, poses, moods, and injuries are not forms.',
        'appearanceForms is durable form-specific canon. For a NEW multi-form NPC include every grounded distinct physical form. For an EXISTING NPC return only genuinely NEW forms; never rewrite a known form from casual contradictory prose. Existing form dimensions/anatomy/colors/proportions are sticky.',
        'appearanceFormChanges is the only scanner channel allowed to revise an existing form. Use it only for an explicit current-exchange correction or real persistent growth/change/evolution, and include concrete evidence. Otherwise omit/null it.',
        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by this response. Unknown biography stays empty/null; never invent facts to fill the schema.',
        'For NEW NPC identity: if a proper/personal name is known in this response, npcs.name MUST be that canonical name and nothing else. npcs.name is human-facing display text and MUST NEVER be an npc-* identifier, slug, key, or machine label, and MUST NEVER begin with npc-. Put occupation or function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a human-readable unique role label as name only while the NPC is genuinely unnamed. Always use id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',
        'For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return ARRAYS containing all grounded entries established by this response; use [] only when none are supported. Do not use null for those four fields on a new NPC. The current response alone can establish behavior or mannerisms when it explicitly describes or clearly demonstrates a characteristic pattern, gesture, habit, or social tendency; prior sightings are not required.',
        'For significant NPC-to-NPC relationships, especially explicit family, kinship, spouse, guardian, or dependent ties, keyRelationships is mandatory dossier data. When such a tie is established, include the other NPC by name and the directional relationship from THIS NPC perspective in each involved NPC keyRelationships whenever that NPC has a returned dossier. socialEdges is complementary graph data and MUST NOT substitute for keyRelationships. For an EXISTING NPC, revealing or changing a significant tie is a material keyRelationships change: return the COMPLETE replacement array, preserving still-valid prior ties and adding or revising the newly established tie; do not return null.',
        'KeyRelationships entries MUST be strings, never objects. Use the canonical form Other NPC name - relationship from THIS NPC perspective, for example Mira - sister or Tomas - father. A short clarifying note may follow after a colon when useful.',
        'A single scan may introduce MULTIPLE new individually relevant NPCs. Do not stop after the first. Return one separate npcs object for every such NPC. For every NEW NPC use id as an empty string; never invent a stable ID. Reference each new NPC in exchangeActiveNpcIds, inChatNpcIds, or worldActiveNpcIds by the exact canonical name or unique role label that appears in its npcs object. Do not add new npcs entries for named-only mentions, crowds, background workers, incidental guards, or other non-individually-relevant characters.',
        'A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for every individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed in this response. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.',
        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',
        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak.',
        settings.relationshipCriteria ? 'RELATIONSHIP RUBRIC:\n' + String(settings.relationshipCriteria).slice(0, 6000) : '',
        settings.memoryCriteria ? 'IMPORTANT MEMORY RUBRIC:\n' + String(settings.memoryCriteria).slice(0, 6000) : '',
        'The PLAYER/current user persona is never an NPC. keyRelationships and socialEdges are NPC-to-NPC only.',
        'OUTPUT JSON SHAPE: {"exchangeActiveNpcIds":[],"inChatNpcIds":[],"worldActiveNpcIds":[],"npcs":[{"id":"existing id or empty","name":"human-facing canonical proper name when known; readable role label only if genuinely unnamed; never npc-*","aliases":[],"role":"","species":"","age":"actual chronological numeric age only or empty","apparentAge":"~N or empty","appearance":"shared/common or ordinary single-form appearance","currentForm":"current physical form or empty","appearanceForms":[{"name":"new physical form","appearance":"durable canonical form appearance"}],"appearanceFormChanges":[{"name":"existing form explicitly changed","appearance":"replacement canonical form appearance","evidence":"explicit correction/growth/change evidence"}],"personality":"","behaviorProfile":[],"speech":"","mannerisms":[],"background":"","keyRelationships":[],"memories":[],"relationshipSummary":"","mood":"","location":"","goal":"","status":"concrete current activity, situation, or condition; never lifecycle presence","importance":0,"lifeState":"alive|dead|unknown","lifeStateCertainty":"explicit|strong|uncertain","lifeStateReason":"","livingReturn":false,"relationshipChange":{"impact":"none|ordinary|meaningful|major|extreme","delta":{"trust":0,"affection":0,"desire":0,"tension":0},"evidence":"","reason":""}}],"socialEdges":[]}',
        'Emit the machine block even when no NPC changed because an empty inChatNpcIds is meaningful. Do not use markdown fences.'
    );
    return parts.filter(Boolean).join('\n\n');
}
