import fs from 'node:fs';

function update(path, transform) {
    const source = fs.readFileSync(path, 'utf8');
    const next = transform(source);
    if (next === source) throw new Error('No v0.4.36 lifecycle transform applied to ' + path);
    fs.writeFileSync(path, next);
}

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.36 lifecycle anchor: ' + label);
    return source.replace(from, to);
}

update('v03/schema.js', source => replaceRequired(
    source,
    `    next.worldActive = false;\n    return next;\n}\n\nexport function normalizeNpc(input = {}, options = {}) {`,
    `    next.worldActive = false;\n    return next;\n}\n\nexport function applyManualLifeStateTransition(input = {}, requestedState = '', options = {}) {\n    const next = structuredClone(input && typeof input === 'object' ? input : {});\n    const requested = String(requestedState || '').trim().toLocaleLowerCase();\n    if (!['alive', 'dead', 'unknown'].includes(requested)) return next;\n    if (requested === 'dead') {\n        return applyConfirmedDeathTransition(next, {\n            certainty: text(options.certainty, 80) || 'explicit',\n            reason: text(options.reason, 500) || 'Manual dossier adjustment by player.',\n            at: Number(options.at) || Date.now(),\n        });\n    }\n    const wasConfirmedDead = String(next.lifeState || '').trim().toLocaleLowerCase() === 'dead'\n        || (next.archived === true && String(next.archiveReason || '').trim().toLocaleLowerCase() === 'deceased');\n    next.lifeState = requested;\n    next.lifeStateCertainty = text(options.certainty, 80) || (requested === 'alive' ? 'explicit' : 'uncertain');\n    next.lifeStateReason = text(options.reason, 500) || 'Manual dossier adjustment by player.';\n    if (wasConfirmedDead) {\n        next.archived = false;\n        next.archiveReason = '';\n        next.archivedAt = null;\n        next.present = false;\n        next.worldActive = false;\n    }\n    return next;\n}\n\nexport function normalizeNpc(input = {}, options = {}) {`,
    'schema manual life-state transition helper',
));

update('v03/scanner.js', source => {
    let next = source;
    next = replaceRequired(
        next,
        `        familyFacts: [{ owner: 'existing NPC id/name', relation: 'family/kinship role, e.g. daughter|parent|sister|brother|aunt|uncle|niece|nephew|cousin|grandparent|grandchild|spouse|guardian|ward|in-law', count: 2, members: ['explicitly named members from visible evidence; [] when unnamed'], descriptor: 'optional family detail e.g. twin daughters', twinGroup: 'optional shared twin label', evidence: 'explicit family/kinship fact' }],\n    };`,
        `        familyFacts: [{ owner: 'existing NPC id/name', relation: 'family/kinship role, e.g. daughter|parent|sister|brother|aunt|uncle|niece|nephew|cousin|grandparent|grandchild|spouse|guardian|ward|in-law', count: 2, members: ['explicitly named members from visible evidence; [] when unnamed'], descriptor: 'optional family detail e.g. twin daughters', twinGroup: 'optional shared twin label', evidence: 'explicit family/kinship fact' }],\n        lifeStateUpdates: [{ id: 'existing NPC id when known, otherwise empty', name: 'canonical NPC name', lifeState: 'alive|dead|unknown', lifeStateCertainty: 'explicit|strong|uncertain', lifeStateReason: 'grounded current source span OR exact stored Status for terminal-status repair', livingReturn: false }],\n    };`,
        'scan output contract lifeStateUpdates',
    );
    next = replaceRequired(
        next,
        `        '- LIFE-STATE SEMANTICS: you are responsible for interpreting attribution, pronouns, indirect reports, negation, hypothetical language, and certainty. The backend validates lifeStateReason against permitted current narrative/World_State source text but does not reinterpret its English wording. Never propose dead from negated, hypothetical, merely dangerous, or uncertain evidence.',\n        '- Confirmed death: set lifeState dead only with grounded current-timeline evidence and lifeStateCertainty explicit or strong. lifeStateReason must quote or closely preserve a concrete permitted source span AND include enough of that span to bind the target NPC by canonical name, established alias, or safe unique short identity. For pronouns, include the nearby antecedent sentence in lifeStateReason. A confirmed death is archived immediately as deceased.',\n        '- STORED TERMINAL-STATUS RECONCILIATION: EXISTING DOSSIERS Status is dossier-scoped continuity. If an existing dossier is not marked dead but its stored Status itself unambiguously says that same NPC is deceased/killed/slain, has a corpse, or has irreversibly lost/dissolved/destroyed its body or mortal essence with no continuing living form, repair the mismatch by returning lifeState dead, lifeStateCertainty explicit or strong, and lifeStateReason EXACTLY equal to that stored Status string. This repair may be returned even when the death event is older than the CURRENT exchange because it reconciles contradictory stored state rather than inventing a new event. Do not use this for metaphor, exhaustion, sleep, unconsciousness, disappearance, injury, merely missing bodies, uncertain danger, or a reversible/established transformed form.',`,
        `        '- LIFE-STATE SEMANTICS: you are responsible for interpreting attribution, pronouns, indirect reports, negation, hypothetical language, and certainty. The backend validates lifeStateReason against permitted current narrative/World_State source text but does not reinterpret its English wording. Never propose dead from negated, hypothetical, merely dangerous, or uncertain evidence.',\n        '- LIFE-STATE UPDATE CHANNEL: every authoritative lifecycle transition MUST also appear in top-level lifeStateUpdates, even when the NPC has no ordinary npcs profile/activity patch. This channel is independent of exchangeActive/inChat/worldActive admission. A terminal condition written into status never substitutes for the lifecycle update.',\n        '- Confirmed death: emit lifeStateUpdates with lifeState dead only with grounded current-timeline evidence and lifeStateCertainty explicit or strong. lifeStateReason must quote or closely preserve a concrete permitted source span AND include enough of that span to bind the target NPC by canonical name, established alias, or safe unique short identity. For pronouns, include the nearby antecedent sentence in lifeStateReason. Explicitly deceased terminal dissolution/disintegration/dispersion of body or mortal essence with no continuing living form is death, not a transformation. Reversible spectral, elemental, energy, shapeshift, teleport, or other continuing form is not death. A confirmed death is archived immediately as deceased.',\n        '- STORED TERMINAL-STATUS RECONCILIATION: EXISTING DOSSIERS Status is dossier-scoped continuity. Before finishing the scan, inspect every existing dossier whose Life state is not dead. If its stored Status itself unambiguously says that same NPC is deceased/killed/slain, has a corpse, or has irreversibly lost/dissolved/destroyed its body or mortal essence with no continuing living form, you MUST emit a lifeStateUpdates row for that NPC with lifeState dead, lifeStateCertainty explicit or strong, and lifeStateReason EXACTLY equal to that stored Status string, even when the NPC is not otherwise active or returned in npcs. The ordinary npcs patch may repeat matching lifecycle fields, but lifeStateUpdates is authoritative for this reconciliation. This repairs contradictory stored state rather than inventing a new event. Do not use this for metaphor, exhaustion, sleep, unconsciousness, disappearance, injury, merely missing bodies, uncertain danger, or a reversible/established transformed form.',`,
        'full scan lifecycle rules',
    );
    next = replaceRequired(
        next,
        `        'LIFE-STATE RECONCILIATION: TARGET DOSSIER Status and Life state are continuity together. If the stored Status itself unambiguously establishes this NPC is dead or terminally/irreversibly dissolved while stored Life state is not dead, return lifeState dead with explicit/strong certainty and lifeStateReason EXACTLY equal to the stored Status. Stored Status can repair death only; it can never prove livingReturn or resurrection.',`,
        `        'LIFE-STATE RECONCILIATION: TARGET DOSSIER Status and Life state are continuity together. Every authoritative transition MUST be returned in top-level lifeStateUpdates. If the stored Status itself unambiguously establishes this NPC is dead or terminally/irreversibly dissolved while stored Life state is not dead, return a lifeStateUpdates row with lifeState dead, explicit/strong certainty, and lifeStateReason EXACTLY equal to the stored Status even if no ordinary npcs patch is otherwise needed. Explicitly deceased irreversible dissolution with no continuing living form is death; reversible transformations are not. Stored Status can repair death only; it can never prove livingReturn or resurrection.',`,
        'targeted lifecycle rule',
    );
    next = replaceRequired(
        next,
        `            }], socialEdges: [], familyFacts: [],\n        }),`,
        `            }], socialEdges: [], familyFacts: [], lifeStateUpdates: [],\n        }),`,
        'structured import output compatibility anchor',
    );
    next = replaceRequired(
        next,
        `        \`OUTPUT CONTRACT:\\n\${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: npc.id, name: npc.name, aliases: [], role: '', species: '', age: 'initial actual chronological numeric age only or empty', ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence' }, ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: '', evidence: '', affectsShared: false, affectedForms: [] }, apparentAge: '~N only or empty', birthday: 'explicit freeform birthday or empty', appearance: 'shared/common or ordinary single-form appearance', currentForm: 'current physical form or empty', appearanceForms: null, appearanceFormChanges: null, personality: '', behaviorProfile: null, speech: '', mannerisms: null, profileChanges: null, canonChanges: null, background: '', keyRelationships: null, keyRelationshipChanges: null, memories: null, relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0, lifeState: 'alive|dead|unknown', lifeStateCertainty: '', lifeStateReason: '', livingReturn: false, relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: '' } }], socialEdges: [] })}\`,`,
        `        \`OUTPUT CONTRACT:\\n\${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: npc.id, name: npc.name, aliases: [], role: '', species: '', age: 'initial actual chronological numeric age only or empty', ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence' }, ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: '', evidence: '', affectsShared: false, affectedForms: [] }, apparentAge: '~N only or empty', birthday: 'explicit freeform birthday or empty', appearance: 'shared/common or ordinary single-form appearance', currentForm: 'current physical form or empty', appearanceForms: null, appearanceFormChanges: null, personality: '', behaviorProfile: null, speech: '', mannerisms: null, profileChanges: null, canonChanges: null, background: '', keyRelationships: null, keyRelationshipChanges: null, memories: null, relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0, lifeState: 'alive|dead|unknown', lifeStateCertainty: '', lifeStateReason: '', livingReturn: false, relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: '' } }], socialEdges: [], lifeStateUpdates: [{ id: npc.id, name: npc.name, lifeState: 'alive|dead|unknown', lifeStateCertainty: 'explicit|strong|uncertain', lifeStateReason: 'grounded source span or exact stored Status', livingReturn: false }] })}\`,`,
        'targeted output lifeStateUpdates',
    );
    next = replaceRequired(
        next,
        `        if (has('familyFacts') && !scannerObjectArrayValid(parsed.familyFacts)) invalid.push('familyFacts[object]');\n        if (invalid.length) throw new Error`,
        `        if (has('familyFacts') && !scannerObjectArrayValid(parsed.familyFacts)) invalid.push('familyFacts[object]');\n        if (has('lifeStateUpdates') && !scannerObjectArrayValid(parsed.lifeStateUpdates)) invalid.push('lifeStateUpdates[object]');\n        if (invalid.length) throw new Error`,
        'lifeStateUpdates payload validation',
    );
    next = replaceRequired(
        next,
        `        familyFacts: Array.isArray(parsed.familyFacts) ? parsed.familyFacts.slice(0, 100) : [],\n    };`,
        `        familyFacts: Array.isArray(parsed.familyFacts) ? parsed.familyFacts.slice(0, 100) : [],\n        lifeStateUpdates: Array.isArray(parsed.lifeStateUpdates) ? parsed.lifeStateUpdates.slice(0, 100) : [],\n    };`,
        'lifeStateUpdates payload normalization',
    );
    next = replaceRequired(
        next,
        `    const targetSet = new Set(targetIds);\n    const exchangeSet = new Set(exchangeIds);\n    const worldSet = new Set(worldIds);`,
        `    const targetSet = new Set(targetIds);\n    const exchangeSet = new Set(exchangeIds);\n    const worldSet = new Set(worldIds);\n    const lifeStateUpdateByNpcId = new Map();\n    for (const raw of result.lifeStateUpdates || []) {\n        const refs = [raw?.id, raw?.name, raw?.target].map(value => String(value || '').trim()).filter(Boolean);\n        const target = refs.map(ref => findNpcByReference(state, ref)).find(Boolean) || null;\n        if (!target || lifeStateUpdateByNpcId.has(target.id)) continue;\n        lifeStateUpdateByNpcId.set(target.id, { ...structuredClone(raw), id: target.id, name: target.name });\n    }`,
        'lifeState update target map',
    );
    next = replaceRequired(
        next,
        `        const patch = patchByNpcId.get(npc.id);\n        const canPatch = Boolean(patch && (targetSet.has(npc.id) || allowHistoricalProfilePatches || (options.applyReturnedNpcPatches === true && returnedPatchSet.has(npc.id))));\n        if (canPatch) {`,
        `        const patch = patchByNpcId.get(npc.id);\n        const lifecyclePatch = lifeStateUpdateByNpcId.get(npc.id) || null;\n        const canPatch = Boolean(patch && (targetSet.has(npc.id) || allowHistoricalProfilePatches || (options.applyReturnedNpcPatches === true && returnedPatchSet.has(npc.id))));\n        if (canPatch) {`,
        'lifecycle patch selection',
    );
    next = replaceRequired(
        next,
        `            npc = applyDynamicPatch(npc, patch, { dossierLimits });\n            npc = applyLifeState(npc, patch, { ...options, state, storedStatus: storedStatusBeforePatch });\n            if (applyRelationship`,
        `            npc = applyDynamicPatch(npc, patch, { dossierLimits });\n            if (!lifecyclePatch) npc = applyLifeState(npc, patch, { ...options, state, storedStatus: storedStatusBeforePatch });\n            if (applyRelationship`,
        'normal patch lifecycle deferral',
    );
    next = replaceRequired(
        next,
        `            npc = applyLivePatch(npc, patch);\n            npc = applyLifeState(npc, patch, { ...options, state, storedStatus: storedStatusBeforePatch });\n            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);\n        }\n        if (applyRelationship`,
        `            npc = applyLivePatch(npc, patch);\n            if (!lifecyclePatch) npc = applyLifeState(npc, patch, { ...options, state, storedStatus: storedStatusBeforePatch });\n            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);\n        }\n        if (lifecyclePatch) {\n            npc = applyLifeState(npc, lifecyclePatch, { ...options, state, storedStatus: storedStatusBeforePatch });\n            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);\n        }\n        if (applyRelationship`,
        'dedicated lifecycle application',
    );
    return next;
});

update('v03/injection.js', source => {
    let next = source;
    next = replaceRequired(
        next,
        `        'LIFE-STATE AUTHORITY: you own semantic interpretation of death/living state. Fresh confirmed death needs permitted current-timeline evidence, lifeStateCertainty explicit or strong, and a concrete lifeStateReason. A previously dead/deceased dossier may become alive only with livingReturn true plus current grounded evidence showing survival, resurrection, correction, or physical return. Plain lifeState alive never resurrects a dead dossier.',\n        'STORED TERMINAL-STATUS RECONCILIATION: FULL CONTINUITY Status and Life state must agree. If an existing dossier is not marked dead but its stored Status itself unambiguously describes that NPC as deceased/killed/slain, a corpse, or irreversibly dissolved/destroyed with no continuing living form, repair it by returning an npcs patch with lifeState dead, lifeStateCertainty explicit or strong, and lifeStateReason EXACTLY equal to the stored Status string. This is reconciliation of stored continuity, so the original death event need not occur in this exchange. Never use metaphor, sleep, unconsciousness, injury, disappearance, uncertain danger, or a reversible/established transformed form as death.',`,
        `        'LIFE-STATE AUTHORITY: you own semantic interpretation of death/living state. Every authoritative lifecycle transition MUST be emitted in top-level lifeStateUpdates even when there is no ordinary npcs patch. Fresh confirmed death needs permitted current-timeline evidence, lifeStateCertainty explicit or strong, and a concrete lifeStateReason. Explicitly deceased irreversible dissolution/disintegration/dispersion with no continuing living form is death; reversible spectral, elemental, energy, shapeshift, teleport, or other continuing forms are not. A previously dead/deceased dossier may become alive only with livingReturn true plus current grounded evidence showing survival, resurrection, correction, or physical return. Plain lifeState alive never resurrects a dead dossier.',\n        'STORED TERMINAL-STATUS RECONCILIATION: FULL CONTINUITY Status and Life state must agree. Before finishing, inspect every FULL CONTINUITY dossier whose Life state is not dead. If its stored Status itself unambiguously describes that NPC as deceased/killed/slain, a corpse, or irreversibly dissolved/destroyed with no continuing living form, you MUST emit a lifeStateUpdates row with lifeState dead, lifeStateCertainty explicit or strong, and lifeStateReason EXACTLY equal to the stored Status string even if the NPC is not current/in-chat/world-active and no normal npcs patch is needed. This is reconciliation of stored continuity, so the original death event need not occur in this exchange. Never use metaphor, sleep, unconsciousness, injury, disappearance, uncertain danger, or a reversible/established transformed form as death.',`,
        'foreground lifecycle channel rules',
    );
    next = replaceRequired(
        next,
        `],\"socialEdges\":[],\"familyFacts\":[{\"owner\":\"existing NPC name/id\",\"relation\":\"family/kinship role such as daughter|parent|sister|brother|aunt|uncle|niece|nephew|cousin|grandparent|grandchild|spouse|guardian|ward|in-law\",\"count\":2,\"members\":[\"explicitly named members from current visible evidence\"],\"descriptor\":\"optional family detail e.g. twin daughters\",\"twinGroup\":\"optional twin label\",\"evidence\":\"explicit family/kinship fact\"}]}',`,
        `],\"socialEdges\":[],\"familyFacts\":[{\"owner\":\"existing NPC name/id\",\"relation\":\"family/kinship role such as daughter|parent|sister|brother|aunt|uncle|niece|nephew|cousin|grandparent|grandchild|spouse|guardian|ward|in-law\",\"count\":2,\"members\":[\"explicitly named members from current visible evidence\"],\"descriptor\":\"optional family detail e.g. twin daughters\",\"twinGroup\":\"optional twin label\",\"evidence\":\"explicit family/kinship fact\"}],\"lifeStateUpdates\":[{\"id\":\"existing NPC id when known or empty\",\"name\":\"canonical NPC name\",\"lifeState\":\"alive|dead|unknown\",\"lifeStateCertainty\":\"explicit|strong|uncertain\",\"lifeStateReason\":\"grounded current source span OR exact stored Status\",\"livingReturn\":false}]}',`,
        'foreground output lifeStateUpdates',
    );
    return next;
});

update('v03/engine.js', source => {
    let next = source;
    next = replaceRequired(
        next,
        `    applyConfirmedDeathTransition,\n    findNpcByReference,`,
        `    applyConfirmedDeathTransition,\n    applyManualLifeStateTransition,\n    findNpcByReference,`,
        'engine manual lifecycle import',
    );
    next = replaceRequired(
        next,
        `                socialEdges: [],\n                familyFacts: [],\n            };\n            const liveChat = getContext().chat || [];`,
        `                socialEdges: [],\n                familyFacts: [],\n                lifeStateUpdates: (parsedRaw.lifeStateUpdates || []).filter(update => {\n                    const ref = String(update?.id || update?.name || update?.target || '').trim();\n                    return ref === npc.id || normalizeName(ref) === normalizeName(npc.name) || (npc.aliases || []).some(alias => normalizeName(alias) === normalizeName(ref));\n                }).slice(0, 1),\n            };\n            const liveChat = getContext().chat || [];`,
        'targeted refresh lifecycle propagation',
    );
    next = replaceRequired(
        next,
        `            const authoritativeManualDeath = Object.prototype.hasOwnProperty.call(patch || {}, 'lifeState')\n                && String(patch.lifeState || '').trim().toLocaleLowerCase() === 'dead';\n            const transitionedRaw = authoritativeManualDeath\n                ? applyConfirmedDeathTransition(nextRaw, {\n                    certainty: String(patch.lifeStateCertainty || '').trim() || 'explicit',\n                    reason: String(patch.lifeStateReason || '').trim() || 'Manual dossier adjustment by player.',\n                    at: Date.now(),\n                })\n                : nextRaw;`,
        `            const hasManualLifeState = Object.prototype.hasOwnProperty.call(patch || {}, 'lifeState');\n            const requestedLifeState = String(patch?.lifeState || '').trim().toLocaleLowerCase();\n            if (hasManualLifeState && !['alive', 'dead', 'unknown'].includes(requestedLifeState)) return { rejected: 'invalid-life-state' };\n            const manualLifeStateChanged = hasManualLifeState && requestedLifeState !== String(current.lifeState || '').trim().toLocaleLowerCase();\n            const transitionedRaw = manualLifeStateChanged\n                ? applyManualLifeStateTransition(nextRaw, requestedLifeState, {\n                    certainty: String(patch.lifeStateCertainty || '').trim(),\n                    reason: String(patch.lifeStateReason || '').trim(),\n                    at: Date.now(),\n                })\n                : nextRaw;`,
        'manual life-state transition plumbing',
    );
    return next;
});

update('v03/ui.js', source => {
    let next = source;
    next = replaceRequired(
        next,
        `        const field = (label, id, value, wide = false) => \`<label class="\${wide ? 'npc-state-v3-editor-wide' : ''}">\${label}<input id="\${id}" class="text_pole" value="\${escapeHtml(value || '')}"></label>\`;\n        return \`<div class="npc-state-v3-editor-shell"`,
        `        const field = (label, id, value, wide = false) => \`<label class="\${wide ? 'npc-state-v3-editor-wide' : ''}">\${label}<input id="\${id}" class="text_pole" value="\${escapeHtml(value || '')}"></label>\`;\n        const lifeStateSelect = value => {\n            const selected = String(value || 'unknown').trim().toLocaleLowerCase();\n            return \`<label>Life state<select id="npc_state_v3_edit_life_state" class="text_pole"><option value="alive" \${selected === 'alive' ? 'selected' : ''}>Alive</option><option value="dead" \${selected === 'dead' ? 'selected' : ''}>Dead</option><option value="unknown" \${selected === 'unknown' ? 'selected' : ''}>Unknown</option></select></label>\`;\n        };\n        return \`<div class="npc-state-v3-editor-shell"`,
        'editor life-state select helper',
    );
    next = replaceRequired(
        next,
        `          \${field('Mood', 'npc_state_v3_edit_mood', npc.mood)}\${field('Location', 'npc_state_v3_edit_location', npc.location)}\${field('Goal', 'npc_state_v3_edit_goal', npc.goal)}\${field('Activity / condition', 'npc_state_v3_edit_status', npc.status)}<label class="npc-state-v3-editor-wide">Relationship summary`,
        `          \${field('Mood', 'npc_state_v3_edit_mood', npc.mood)}\${field('Location', 'npc_state_v3_edit_location', npc.location)}\${field('Goal', 'npc_state_v3_edit_goal', npc.goal)}\${field('Activity / condition', 'npc_state_v3_edit_status', npc.status)}\${lifeStateSelect(npc.lifeState)}<label class="npc-state-v3-editor-wide">Life-state note<textarea id="npc_state_v3_edit_life_state_reason" class="text_pole" rows="2">\${escapeHtml(npc.lifeStateReason || '')}</textarea><small>Manual Life state changes are authoritative. Dead archives as deceased; changing a deceased dossier to Alive or Unknown recovers it.</small></label><label class="npc-state-v3-editor-wide">Relationship summary`,
        'editor life-state fields',
    );
    next = replaceRequired(
        next,
        `            mood: value('npc_state_v3_edit_mood'), location: value('npc_state_v3_edit_location'), goal: value('npc_state_v3_edit_goal'), status: value('npc_state_v3_edit_status'), relationshipSummary: value('npc_state_v3_edit_relationship_summary'), memories: splitLines(value('npc_state_v3_edit_memories'), limits.memories),`,
        `            mood: value('npc_state_v3_edit_mood'), location: value('npc_state_v3_edit_location'), goal: value('npc_state_v3_edit_goal'), status: value('npc_state_v3_edit_status'), lifeState: value('npc_state_v3_edit_life_state'), lifeStateReason: value('npc_state_v3_edit_life_state_reason').trim(), relationshipSummary: value('npc_state_v3_edit_relationship_summary'), memories: splitLines(value('npc_state_v3_edit_memories'), limits.memories),`,
        'editor save lifecycle patch',
    );
    return next;
});

console.log('Applied NPC State v0.4.36 lifecycle reconciliation and manual recovery');
