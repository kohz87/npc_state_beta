import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.34 transform anchor: ' + label);
    return source.replace(from, to);
}

let scanner = fs.readFileSync('v03/scanner.js', 'utf8');

scanner = replaceRequired(
    scanner,
    `        archived: npc.archived,\n        archiveReason: npc.archiveReason,\n        present: npc.present,\n        worldActive: npc.worldActive,\n        relationship: npc.relationship,`,
    `        archived: npc.archived,\n        archiveReason: npc.archiveReason,\n        present: npc.present,\n        worldActive: npc.worldActive,\n        mood: npc.mood,\n        location: npc.location,\n        goal: npc.goal,\n        status: npc.status,\n        lifeState: npc.lifeState,\n        lifeStateCertainty: npc.lifeStateCertainty,\n        lifeStateReason: npc.lifeStateReason,\n        relationship: npc.relationship,`,
    'recovery roster live-state continuity',
);

scanner = replaceRequired(
    scanner,
    `        '- Confirmed death: set lifeState dead only with grounded current-timeline evidence and lifeStateCertainty explicit or strong. lifeStateReason must quote or closely preserve a concrete permitted source span AND include enough of that span to bind the target NPC by canonical name, established alias, or safe unique short identity. For pronouns, include the nearby antecedent sentence in lifeStateReason. A confirmed death is archived immediately as deceased.',\n        '- livingReturn is true only when a previously archived/dead dossier is explicitly established alive again with lifeStateCertainty explicit or strong. Its grounded lifeStateReason must likewise contain enough source span to bind the target NPC; merely outputting lifeState alive never resurrects a confirmed dead dossier.',`,
    `        '- Confirmed death: set lifeState dead only with grounded current-timeline evidence and lifeStateCertainty explicit or strong. lifeStateReason must quote or closely preserve a concrete permitted source span AND include enough of that span to bind the target NPC by canonical name, established alias, or safe unique short identity. For pronouns, include the nearby antecedent sentence in lifeStateReason. A confirmed death is archived immediately as deceased.',\n        '- STORED TERMINAL-STATUS RECONCILIATION: EXISTING DOSSIERS Status is dossier-scoped continuity. If an existing dossier is not marked dead but its stored Status itself unambiguously says that same NPC is deceased/killed/slain, has a corpse, or has irreversibly lost/dissolved/destroyed its body or mortal essence with no continuing living form, repair the mismatch by returning lifeState dead, lifeStateCertainty explicit or strong, and lifeStateReason EXACTLY equal to that stored Status string. This repair may be returned even when the death event is older than the CURRENT exchange because it reconciles contradictory stored state rather than inventing a new event. Do not use this for metaphor, exhaustion, sleep, unconsciousness, disappearance, injury, merely missing bodies, uncertain danger, or a reversible/established transformed form.',\n        '- A dead or terminally dissolved NPC is never worldActive. If you perform stored terminal-status reconciliation, omit that NPC from worldActiveNpcIds even if the incoming dossier incorrectly says worldActive true.',\n        '- livingReturn is true only when a previously archived/dead dossier is explicitly established alive again with lifeStateCertainty explicit or strong. Its grounded lifeStateReason must likewise contain enough source span to bind the target NPC; merely outputting lifeState alive never resurrects a confirmed dead dossier. Stored Status is NEVER sufficient evidence for livingReturn or any dead-to-alive change.',`,
    'recovery stored terminal-status semantic rule',
);

scanner = replaceRequired(
    scanner,
    `        'status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; lifecycle presence is tracked separately.',\n        'The PLAYER/current USER persona is not an NPC. relationshipSummary is this NPC toward the PLAYER; keyRelationships is NON-PLAYER ties only and must never duplicate the PLAYER.',`,
    `        'status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; lifecycle presence is tracked separately.',\n        'LIFE-STATE RECONCILIATION: TARGET DOSSIER Status and Life state are continuity together. If the stored Status itself unambiguously establishes this NPC is dead or terminally/irreversibly dissolved while stored Life state is not dead, return lifeState dead with explicit/strong certainty and lifeStateReason EXACTLY equal to the stored Status. Stored Status can repair death only; it can never prove livingReturn or resurrection.',\n        'The PLAYER/current USER persona is not an NPC. relationshipSummary is this NPC toward the PLAYER; keyRelationships is NON-PLAYER ties only and must never duplicate the PLAYER.',`,
    'targeted refresh life-state reconciliation rule',
);

scanner = replaceRequired(
    scanner,
    `function lifeStateEvidenceGrounded(evidence, context) {\n    const proof = evidenceTextKey(evidence, 1600);\n    const source = evidenceTextKey(context, 30000);\n    // Life-state changes are high-impact continuity transitions. Unlike ordinary profile\n    // refinement, their evidence provenance must be source-span grounded rather than\n    // accepted by the broader fuzzy profile matcher. Semantic meaning remains model-owned.\n    return Boolean(proof && source && source.includes(proof));\n}\n`,
    `function lifeStateEvidenceGrounded(evidence, context) {\n    const proof = evidenceTextKey(evidence, 1600);\n    const source = evidenceTextKey(context, 30000);\n    // Life-state changes are high-impact continuity transitions. Unlike ordinary profile\n    // refinement, their evidence provenance must be source-span grounded rather than\n    // accepted by the broader fuzzy profile matcher. Semantic meaning remains model-owned.\n    return Boolean(proof && source && source.includes(proof));\n}\n\nfunction lifeStateEvidenceMatchesStoredStatus(evidence, storedStatus) {\n    const proof = evidenceTextKey(evidence, 1600);\n    const stored = evidenceTextKey(storedStatus, 1600);\n    // Stored Status is already scoped to one dossier. Exact normalized equality supplies\n    // provenance + identity binding only; the scanner model still decides whether that\n    // condition semantically means confirmed death. This path is death-repair only.\n    return Boolean(proof && stored && proof === stored);\n}\n`,
    'stored status evidence helper',
);

scanner = replaceRequired(
    scanner,
    `    const grounded = lifeStateEvidenceGrounded(reason, lifeContext);\n    const targeted = lifeStateEvidenceTargetsNpc(options.state, npc, reason);`,
    `    const storedStatusDeathRepair = lifeState === 'dead'\n        && lifeStateEvidenceMatchesStoredStatus(reason, options.storedStatus);\n    const grounded = storedStatusDeathRepair || lifeStateEvidenceGrounded(reason, lifeContext);\n    const targeted = storedStatusDeathRepair || lifeStateEvidenceTargetsNpc(options.state, npc, reason);`,
    'stored status death repair authorization',
);

scanner = replaceRequired(
    scanner,
    `        let npc = state.npcs[i];\n        const patch = patchByNpcId.get(npc.id);`,
    `        let npc = state.npcs[i];\n        const storedStatusBeforePatch = String(npc?.status || '');\n        const patch = patchByNpcId.get(npc.id);`,
    'capture pre-patch stored status',
);

scanner = scanner.replaceAll(
    `npc = applyLifeState(npc, patch, { ...options, state });`,
    `npc = applyLifeState(npc, patch, { ...options, state, storedStatus: storedStatusBeforePatch });`,
);
if (!scanner.includes('storedStatus: storedStatusBeforePatch')) throw new Error('v0.4.34 applyLifeState stored-status wiring did not apply');

fs.writeFileSync('v03/scanner.js', scanner);

let injection = fs.readFileSync('v03/injection.js', 'utf8');

injection = replaceRequired(
    injection,
    `        field('Goal', npc.goal), field('Status', npc.status), field('Key non-player relationships', (npc.keyRelationships || []).join(' | ')),`,
    `        field('Goal', npc.goal), field('Status', npc.status),\n        field('Life state', npc.lifeState), field('Life-state certainty', npc.lifeStateCertainty),\n        field('Key non-player relationships', (npc.keyRelationships || []).join(' | ')),`,
    'foreground continuity life state',
);

injection = replaceRequired(
    injection,
    `function identityDirectory(state) {\n    return (state?.npcs || []).slice(0, 400).map(npc => [npc.id, npc.name, (npc.aliases || []).join('/'), npc.role, npc.archived ? 'archived' : 'active'].join(' | ')).join('\\n');\n}`,
    `function identityDirectory(state) {\n    return (state?.npcs || []).slice(0, 400).map(npc => {\n        const deceased = String(npc?.lifeState || '').trim().toLocaleLowerCase() === 'dead'\n            || String(npc?.archiveReason || '').trim().toLocaleLowerCase() === 'deceased';\n        const lifecycle = deceased ? 'deceased' : (npc.archived ? 'archived' : 'active');\n        return [npc.id, npc.name, (npc.aliases || []).join('/'), npc.role, lifecycle].join(' | ');\n    }).join('\\n');\n}`,
    'foreground identity lifecycle label',
);

injection = replaceRequired(
    injection,
    `        'LIFE-STATE AUTHORITY: confirmed death needs explicit current-timeline evidence and a concrete lifeStateReason. A previously dead/deceased dossier may become alive only with livingReturn true plus a grounded reason showing survival, resurrection, correction, or physical return. Plain lifeState alive never resurrects a dead dossier.',`,
    `        'LIFE-STATE AUTHORITY: you own semantic interpretation of death/living state. Fresh confirmed death needs permitted current-timeline evidence, lifeStateCertainty explicit or strong, and a concrete lifeStateReason. A previously dead/deceased dossier may become alive only with livingReturn true plus current grounded evidence showing survival, resurrection, correction, or physical return. Plain lifeState alive never resurrects a dead dossier.',\n        'STORED TERMINAL-STATUS RECONCILIATION: FULL CONTINUITY Status and Life state must agree. If an existing dossier is not marked dead but its stored Status itself unambiguously describes that NPC as deceased/killed/slain, a corpse, or irreversibly dissolved/destroyed with no continuing living form, repair it by returning an npcs patch with lifeState dead, lifeStateCertainty explicit or strong, and lifeStateReason EXACTLY equal to the stored Status string. This is reconciliation of stored continuity, so the original death event need not occur in this exchange. Never use metaphor, sleep, unconsciousness, injury, disappearance, uncertain danger, or a reversible/established transformed form as death.',\n        'WORLD-ACTIVE CONSISTENCY: never place a dead or terminally dissolved NPC in worldActiveNpcIds. If a stored terminal-status repair is needed, return the repair patch and omit that NPC from worldActiveNpcIds. Stored Status can NEVER authorize livingReturn or any dead-to-alive transition.',`,
    'foreground stored terminal-status rules',
);

fs.writeFileSync('v03/injection.js', injection);

console.log('Applied NPC State v0.4.34 terminal-status lifecycle reconciliation');
