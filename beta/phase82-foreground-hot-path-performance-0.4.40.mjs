import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.40 hot-path marker: ' + label);
    return source.replace(from, to);
}

function replaceCountRequired(source, from, to, expected, label) {
    if (source.includes(to) && !source.includes(from)) return source;
    const count = source.split(from).length - 1;
    if (count !== expected) throw new Error(`Expected ${expected} v0.4.40 ${label} marker(s), found ${count}`);
    return source.split(from).join(to);
}

{
    const path = 'v03/engine.js';
    let source = fs.readFileSync(path, 'utf8');

    source = replaceRequired(
        source,
        `        portraitAvailable: Boolean(String(portrait.dataUrl || portrait.url || portrait.src || '').trim()),\n    };`,
        `        portraitAvailable: Boolean(String(portrait.dataUrl || portrait.url || portrait.src || '').trim()),\n        updatedAt: Number(npc?.updatedAt) || 0,\n    };`,
        'dossier projection update timestamp',
    );

    source = replaceRequired(
        source,
        `function npcPortraitSource(npc = {}) {\n    const portrait = npc?.portrait && typeof npc.portrait === 'object' ? npc.portrait : {};\n    return String(portrait.dataUrl || portrait.url || portrait.src || '').trim();\n}\n\nexport function createNpcStateEngine`,
        `function npcPortraitSource(npc = {}) {\n    const portrait = npc?.portrait && typeof npc.portrait === 'object' ? npc.portrait : {};\n    return String(portrait.dataUrl || portrait.url || portrait.src || '').trim();\n}\n\nfunction projectedStringArray(value) {\n    return Array.isArray(value) ? value.map(item => String(item ?? '')).filter(Boolean) : [];\n}\n\nfunction projectedAppearanceForms(value) {\n    return Array.isArray(value) ? value.map(form => ({\n        name: String(form?.name || ''),\n        appearance: String(form?.appearance || ''),\n    })).filter(form => form.name || form.appearance) : [];\n}\n\nfunction injectionNpcProjection(npc = {}) {\n    const rel = npc?.relationship && typeof npc.relationship === 'object' ? npc.relationship : {};\n    return {\n        id: String(npc?.id || ''),\n        name: String(npc?.name || ''),\n        aliases: projectedStringArray(npc?.aliases),\n        role: String(npc?.role || ''),\n        species: String(npc?.species || ''),\n        age: String(npc?.age ?? ''),\n        apparentAge: String(npc?.apparentAge ?? ''),\n        birthday: String(npc?.birthday ?? ''),\n        appearance: String(npc?.appearance || ''),\n        currentForm: String(npc?.currentForm || ''),\n        appearanceForms: projectedAppearanceForms(npc?.appearanceForms),\n        personality: String(npc?.personality || ''),\n        behaviorProfile: projectedStringArray(npc?.behaviorProfile),\n        speech: String(npc?.speech || ''),\n        goal: String(npc?.goal || ''),\n        status: String(npc?.status || ''),\n        lifeState: String(npc?.lifeState || 'unknown'),\n        lifeStateCertainty: String(npc?.lifeStateCertainty || ''),\n        keyRelationships: projectedStringArray(npc?.keyRelationships),\n        relationship: {\n            trust: Number(rel.trust) || 0,\n            affection: Number(rel.affection) || 0,\n            desire: Number(rel.desire) || 0,\n            tension: Number(rel.tension) || 0,\n        },\n        relationshipSummary: String(npc?.relationshipSummary || ''),\n        mannerisms: projectedStringArray(npc?.mannerisms),\n        memories: projectedStringArray(npc?.memories),\n        mood: String(npc?.mood || ''),\n        location: String(npc?.location || ''),\n        background: String(npc?.background || ''),\n        present: npc?.present === true,\n        worldActive: npc?.worldActive === true,\n        archived: npc?.archived === true,\n        archiveReason: String(npc?.archiveReason || ''),\n        minor: npc?.minor === true,\n        importance: Number(npc?.importance) || 0,\n        lastInteractionMessageId: Number.isInteger(npc?.lastInteractionMessageId) ? npc.lastInteractionMessageId : null,\n        updatedAt: Number(npc?.updatedAt) || 0,\n    };\n}\n\n// PHASE82_FOREGROUND_HOT_PATH_PROJECTION: prompt construction gets only the fields it consumes.\nexport function injectionStateProjection(state = {}) {\n    const observation = state?.lastObservation && typeof state.lastObservation === 'object' ? state.lastObservation : {};\n    return {\n        branchSafety: {\n            status: String(state?.branchSafety?.status || 'safe'),\n            kind: String(state?.branchSafety?.kind || ''),\n            reason: String(state?.branchSafety?.reason || ''),\n        },\n        recovery: state?.recovery ? { status: String(state.recovery.status || '') } : null,\n        lastObservation: {\n            exchangeActiveNpcIds: projectedStringArray(observation.exchangeActiveNpcIds),\n            finalPresentNpcIds: projectedStringArray(observation.finalPresentNpcIds),\n            worldActiveNpcIds: projectedStringArray(observation.worldActiveNpcIds),\n        },\n        npcs: Array.isArray(state?.npcs) ? state.npcs.map(injectionNpcProjection) : [],\n    };\n}\n\nexport function createNpcStateEngine`,
        'injection projection helper',
    );

    source = replaceRequired(
        source,
        `    const onStateChanged = adapters.onStateChanged || (() => {});\n    const notify = adapters.notify || (() => {});\n    const recoverySessionId`,
        `    const onStateChanged = adapters.onStateChanged || (() => {});\n    // Compatibility default remains immutable snapshots. The installed runtime opts out because its callback ignores the payload.\n    const stateChangeSnapshot = adapters.stateChangeSnapshot !== false;\n    const notify = adapters.notify || (() => {});\n    const recoverySessionId`,
        'state-change snapshot policy',
    );

    source = replaceRequired(
        source,
        `    const recoveryLeaseMs = Math.max(30000, Math.min(3600000, Number(adapters.recoveryLeaseMs) || 900000));\n    const recoveryNow = typeof adapters.recoveryNow === 'function' ? adapters.recoveryNow : () => Date.now();\n\n    function recoveryOwnedByThisSession`,
        `    const recoveryLeaseMs = Math.max(30000, Math.min(3600000, Number(adapters.recoveryLeaseMs) || 900000));\n    const recoveryNow = typeof adapters.recoveryNow === 'function' ? adapters.recoveryNow : () => Date.now();\n\n    function emitStateChanged(chatKey, state) {\n        onStateChanged(chatKey, stateChangeSnapshot ? structuredClone(state) : null);\n    }\n\n    function recoveryOwnedByThisSession`,
        'state-change emitter',
    );

    source = replaceCountRequired(
        source,
        `        onStateChanged(chatKey, structuredClone(result.state));`,
        `        emitStateChanged(chatKey, result.state);`,
        2,
        'persist/install state-change clone',
    );
    source = replaceRequired(
        source,
        `            onStateChanged(chatKey, structuredClone(state));`,
        `            emitStateChanged(chatKey, state);`,
        'load state-change clone',
    );
    source = replaceRequired(
        source,
        `                onStateChanged(chatKey, structuredClone(blocked));`,
        `                emitStateChanged(chatKey, blocked);`,
        'blocked branch state-change clone',
    );

    source = replaceRequired(
        source,
        `    function getDossierIndex(chatKey = getChatKey()) {`,
        `    function getInjectionState(chatKey = getChatKey()) {\n        const key = chatKey || getChatKey();\n        const current = cache.get(key);\n        return current ? injectionStateProjection(current) : null;\n    }\n\n    function getDossierIndex(chatKey = getChatKey()) {`,
        'engine injection read method',
    );
    source = replaceRequired(
        source,
        `        invalidate,\n        getDossierIndex,`,
        `        invalidate,\n        getInjectionState,\n        getDossierIndex,`,
        'engine public injection read',
    );

    fs.writeFileSync(path, source);
}

{
    const path = 'v03/index.js';
    let source = fs.readFileSync(path, 'utf8');

    source = replaceRequired(
        source,
        `    const state = key === 'no-chat' ? null : engine.getState(key);`,
        `    const state = key === 'no-chat' ? null : engine.getInjectionState(key);`,
        'foreground injection narrow read',
    );
    source = replaceRequired(
        source,
        `    notify,\n    onStateChanged: () => {`,
        `    notify,\n    stateChangeSnapshot: false,\n    onStateChanged: () => {`,
        'runtime state-change clone opt-out',
    );
    source = replaceRequired(
        source,
        `        const result = await engine.scan(id, { manual: false, force: true });\n        if (result?.ok || result?.discarded) refreshSurfaces();`,
        `        const result = await engine.scan(id, { manual: false, force: true });\n        // A successful commit already refreshed via engine.onStateChanged. Only a stale discarded run needs a local surface catch-up.\n        if (result?.discarded) refreshSurfaces();`,
        'separate recovery duplicate refresh',
    );
    source = replaceCountRequired(
        source,
        `    if (result?.ok) refreshSurfaces();\n    return result;`,
        `    // Ordinary commits already refreshed via persistence. Skips have no persistence callback.\n    if (result?.ok && result?.skipped) refreshSurfaces();\n    return result;`,
        2,
        'embedded duplicate refresh',
    );

    fs.writeFileSync(path, source);
}

{
    const path = 'v03/ui.js';
    let source = fs.readFileSync(path, 'utf8');

    source = replaceRequired(
        source,
        `export function presentNpcAgeLabel(npc = {}) {\n    const apparentAge = String(npc?.apparentAge ?? '').trim();\n    if (apparentAge) return \`Looks \${apparentAge}\`;\n    const age = String(npc?.age ?? '').trim();\n    return age ? \`Age \${age}\` : 'Age unknown';\n}\n\nfunction escapeHtml`,
        `export function presentNpcAgeLabel(npc = {}) {\n    const apparentAge = String(npc?.apparentAge ?? '').trim();\n    if (apparentAge) return \`Looks \${apparentAge}\`;\n    const age = String(npc?.age ?? '').trim();\n    return age ? \`Age \${age}\` : 'Age unknown';\n}\n\nexport function inlineRosterSignature(rows = [], messageId = -1) {\n    return JSON.stringify([Number(messageId), ...(Array.isArray(rows) ? rows : []).map(npc => [\n        String(npc?.id || ''),\n        String(npc?.name || ''),\n        String(npc?.age ?? ''),\n        String(npc?.apparentAge ?? ''),\n        npc?.present === true,\n        npc?.archived === true,\n        npc?.minor === true,\n        npc?.portraitAvailable === true,\n        Number(npc?.updatedAt) || 0,\n    ])]);\n}\n\nfunction escapeHtml`,
        'inline roster signature helper',
    );

    source = replaceRequired(
        source,
        `    function renderInline() {\n        document.getElementById(INLINE_ID)?.remove();\n        const current = dossierIndex();\n        if (!current) return;\n        const present = current.filter(npc => npc.present && !npc.archived && !npc.minor);\n        if (!present.length) return;\n        const messageId = latestAssistantMessageId(getContext().chat || []);\n        const message = messageElement(messageId);\n        if (!message) return;\n        const holder = document.createElement('section');\n        holder.id = INLINE_ID;\n        holder.className = 'npc-state-present-roster npc-state-v3-inline';\n        holder.innerHTML = \`<div class="npc-state-present-roster-head"><span class="npc-state-kicker">IN-CHAT NPCS</span><small>\${present.length} shown</small></div><div class="npc-state-present-grid">\${present.map(npc => { const portrait = engine.getNpcPortraitSource(npc.id, getChatKey()); return \`<button type="button" class="npc-state-present-card npc-state-v3-inline-card" data-npc-id="\${escapeHtml(npc.id)}"><span class="npc-state-present-card-portrait">\${portrait ? \`<img src="\${escapeHtml(portrait)}" alt="">\` : \`<div class="npc-state-present-card-placeholder">\${escapeHtml(String(npc.name || '?').charAt(0))}</div>\`}</span><span class="npc-state-present-card-overlay"><b>\${escapeHtml(npc.name)}</b><small>\${escapeHtml(presentNpcAgeLabel(npc))}</small></span></button>\`; }).join('')}</div>\`;\n        holder.querySelectorAll('.npc-state-v3-inline-card').forEach(button => button.addEventListener('click', () => openLibrary(button.dataset.npcId)));\n        const target = message.querySelector?.('.mes_text') || message;\n        target.appendChild(holder);\n    }`,
        `    function renderInline() {\n        const existing = document.getElementById(INLINE_ID);\n        const current = dossierIndex();\n        if (!current) { existing?.remove(); return; }\n        const present = current.filter(npc => npc.present && !npc.archived && !npc.minor);\n        if (!present.length) { existing?.remove(); return; }\n        const messageId = latestAssistantMessageId(getContext().chat || []);\n        const message = messageElement(messageId);\n        if (!message) { existing?.remove(); return; }\n        const target = message.querySelector?.('.mes_text') || message;\n        const signature = inlineRosterSignature(present, messageId);\n        // MESSAGE_UPDATED fires frequently for unrelated rendering work. Reuse the strip and decoded images when its observable content did not change.\n        if (existing?.dataset.signature === signature && existing.parentElement === target) return;\n        existing?.remove();\n        const holder = document.createElement('section');\n        holder.id = INLINE_ID;\n        holder.className = 'npc-state-present-roster npc-state-v3-inline';\n        holder.dataset.signature = signature;\n        holder.innerHTML = \`<div class="npc-state-present-roster-head"><span class="npc-state-kicker">IN-CHAT NPCS</span><small>\${present.length} shown</small></div><div class="npc-state-present-grid">\${present.map(npc => { const portrait = engine.getNpcPortraitSource(npc.id, getChatKey()); return \`<button type="button" class="npc-state-present-card npc-state-v3-inline-card" data-npc-id="\${escapeHtml(npc.id)}"><span class="npc-state-present-card-portrait">\${portrait ? \`<img src="\${escapeHtml(portrait)}" alt="" loading="lazy" decoding="async">\` : \`<div class="npc-state-present-card-placeholder">\${escapeHtml(String(npc.name || '?').charAt(0))}</div>\`}</span><span class="npc-state-present-card-overlay"><b>\${escapeHtml(npc.name)}</b><small>\${escapeHtml(presentNpcAgeLabel(npc))}</small></span></button>\`; }).join('')}</div>\`;\n        holder.querySelectorAll('.npc-state-v3-inline-card').forEach(button => button.addEventListener('click', () => openLibrary(button.dataset.npcId)));\n        target.appendChild(holder);\n    }`,
        'idempotent inline roster render',
    );

    fs.writeFileSync(path, source);
}

console.log('Applied NPC State v0.4.40 foreground hot-path performance hardening');
