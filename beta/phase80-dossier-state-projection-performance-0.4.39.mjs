import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.39 dossier projection marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'v03/engine.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `function defaultRecoverySessionId() {\n    try {\n        const generated = globalThis.crypto?.randomUUID?.();\n        if (generated) return String(generated);\n    } catch {}\n    return 'recovery-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);\n}\n\nexport function createNpcStateEngine`,
        `function defaultRecoverySessionId() {\n    try {\n        const generated = globalThis.crypto?.randomUUID?.();\n        if (generated) return String(generated);\n    } catch {}\n    return 'recovery-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);\n}\n\n// PHASE80_DOSSIER_STATE_PROJECTION: UI reads must not clone the whole sidecar.\nexport function dossierIndexProjection(npc = {}) {\n    const portrait = npc?.portrait && typeof npc.portrait === 'object' ? npc.portrait : {};\n    return {\n        id: String(npc?.id || ''),\n        name: String(npc?.name || ''),\n        aliases: Array.isArray(npc?.aliases) ? npc.aliases.map(value => String(value || '')).filter(Boolean) : [],\n        role: String(npc?.role || ''),\n        species: String(npc?.species || ''),\n        age: String(npc?.age ?? ''),\n        apparentAge: String(npc?.apparentAge ?? ''),\n        birthday: String(npc?.birthday ?? ''),\n        present: npc?.present === true,\n        worldActive: npc?.worldActive === true,\n        archived: npc?.archived === true,\n        archiveReason: String(npc?.archiveReason || ''),\n        lifeState: String(npc?.lifeState || 'unknown'),\n        minor: npc?.minor === true,\n        portraitAvailable: Boolean(String(portrait.dataUrl || portrait.url || portrait.src || '').trim()),\n    };\n}\n\nfunction npcPortraitSource(npc = {}) {\n    const portrait = npc?.portrait && typeof npc.portrait === 'object' ? npc.portrait : {};\n    return String(portrait.dataUrl || portrait.url || portrait.src || '').trim();\n}\n\nexport function createNpcStateEngine`,
        'projection helper',
    );
    source = replaceRequired(
        source,
        `    return Object.freeze({\n        loadChat,`,
        `    function getDossierIndex(chatKey = getChatKey()) {\n        const key = chatKey || getChatKey();\n        const current = cache.get(key);\n        return current ? (current.npcs || []).map(dossierIndexProjection) : null;\n    }\n\n    function getDossierNpc(reference, chatKey = getChatKey()) {\n        const key = chatKey || getChatKey();\n        const current = cache.get(key);\n        if (!current) return null;\n        const raw = String(reference || '');\n        const npc = (current.npcs || []).find(item => item?.id === raw) || findNpcByReference(current, raw);\n        return npc ? structuredClone(npc) : null;\n    }\n\n    function getNpcPortraitSource(reference, chatKey = getChatKey()) {\n        const key = chatKey || getChatKey();\n        const current = cache.get(key);\n        if (!current) return '';\n        const raw = String(reference || '');\n        const npc = (current.npcs || []).find(item => item?.id === raw) || findNpcByReference(current, raw);\n        return npcPortraitSource(npc);\n    }\n\n    return Object.freeze({\n        loadChat,`,
        'engine narrow read methods',
    );
    source = replaceRequired(
        source,
        `        invalidate,\n        getState: chatKey => cache.has(chatKey || getChatKey()) ? structuredClone(cache.get(chatKey || getChatKey())) : null,`,
        `        invalidate,\n        getDossierIndex,\n        getDossierNpc,\n        getNpcPortraitSource,\n        // Full immutable state snapshots remain available for compatibility/debugging.\n        getState: chatKey => cache.has(chatKey || getChatKey()) ? structuredClone(cache.get(chatKey || getChatKey())) : null,`,
        'engine public narrow reads',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/dossier-view.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `function portraitHtml(npc, className, { decorative = false, deferSource = false } = {}) {\n    const src = portraitSource(npc);\n    if (src) {\n        if (deferSource) return '<img class="' + className + ' npc-state-v3-deferred-portrait" alt="' + (decorative ? '' : escapeHtml(npc?.name || 'NPC') + ' portrait') + '" loading="lazy" decoding="async">';\n        return \`<img class="\${className}" src="\${escapeHtml(src)}" alt="\${decorative ? '' : \`\${escapeHtml(npc?.name || 'NPC')} portrait\`}">\`;\n    }`,
        `function portraitHtml(npc, className, { decorative = false, deferSource = false } = {}) {\n    const src = portraitSource(npc);\n    const available = Boolean(src || npc?.portraitAvailable);\n    if (available && deferSource) return '<img class="' + className + ' npc-state-v3-deferred-portrait" alt="' + (decorative ? '' : escapeHtml(npc?.name || 'NPC') + ' portrait') + '" loading="lazy" decoding="async">';\n    if (src) {\n        return \`<img class="\${className}" src="\${escapeHtml(src)}" alt="\${decorative ? '' : \`\${escapeHtml(npc?.name || 'NPC')} portrait\`}">\`;\n    }`,
        'projection-aware deferred portrait',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/ui.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `import { findNpcByReference, normalizeDossierLimits, normalizeScannerResponseTokens } from './schema.js';`,
        `import { normalizeDossierLimits, normalizeScannerResponseTokens } from './schema.js';`,
        'remove full-state lookup import',
    );
    source = replaceRequired(
        source,
        `    function state() { return engine.getState(getChatKey()); }`,
        `    function dossierIndex() { return engine.getDossierIndex(getChatKey()); }\n    function dossierNpc(reference) { return engine.getDossierNpc(reference, getChatKey()); }`,
        'narrow UI state helpers',
    );
    source = replaceRequired(
        source,
        `        const current = state();\n        if (!current) { holder.innerHTML = '<span class="npc-state-muted">Open a chat to load its NPC State dossier.</span>'; return; }\n        const active = current.npcs.filter(npc => !npc.archived);\n        const archived = current.npcs.filter(npc => npc.archived);`,
        `        const current = dossierIndex();\n        if (!current) { holder.innerHTML = '<span class="npc-state-muted">Open a chat to load its NPC State dossier.</span>'; return; }\n        const active = current.filter(npc => !npc.archived);\n        const archived = current.filter(npc => npc.archived);`,
        'roster projection read',
    );
    source = replaceRequired(
        source,
        `    function filteredNpcs(query = '') {\n        return filterDossierNpcs(state()?.npcs || [], query);\n    }`,
        `    function filteredNpcs(rows = [], query = '') {\n        return filterDossierNpcs(rows, query);\n    }`,
        'filtered projection rows',
    );
    source = replaceRequired(
        source,
        `    function portraitSourceForUi(npc = {}) {\n        const portrait = npc?.portrait && typeof npc.portrait === 'object' ? npc.portrait : {};\n        return String(portrait.dataUrl || portrait.url || portrait.src || '').trim();\n    }\n\n`,
        ``,
        'remove portrait source from projected row',
    );
    source = replaceRequired(
        source,
        `        const byId = new Map((Array.isArray(rows) ? rows : []).map(npc => [String(npc?.id || ''), npc]).filter(([id]) => id));\n        const cards = [...rail.querySelectorAll('.npc-state-v3-cast-card')];\n        const load = card => {\n            const image = card?.querySelector('.npc-state-v3-deferred-portrait');\n            if (!image || image.getAttribute('src')) return;\n            const npc = byId.get(String(card.dataset.npcId || ''));\n            const src = portraitSourceForUi(npc);\n            if (!src) return;\n            image.src = src;\n        };`,
        `        const cards = [...rail.querySelectorAll('.npc-state-v3-cast-card')];\n        const load = card => {\n            const image = card?.querySelector('.npc-state-v3-deferred-portrait');\n            if (!image || image.getAttribute('src')) return;\n            const src = engine.getNpcPortraitSource(String(card.dataset.npcId || ''), getChatKey());\n            if (!src) return;\n            image.src = src;\n        };`,
        'on-demand portrait source lookup',
    );
    source = replaceRequired(
        source,
        `        for (const card of cards) {\n            if (card === selected || !portraitSourceForUi(byId.get(String(card.dataset.npcId || '')))) continue;\n            castPortraitObserver.observe(card);\n        }`,
        `        for (const card of cards) {\n            if (card === selected || !card.querySelector('.npc-state-v3-deferred-portrait')) continue;\n            castPortraitObserver.observe(card);\n        }`,
        'observer projection availability',
    );
    source = replaceRequired(
        source,
        `        const allRows = filteredNpcs('');\n        selectedNpcId = chooseLibrarySelection(allRows, selectedNpcId);\n        const search = overlay.querySelector('#npc_state_v3_library_search');\n        const query = search?.value || '';\n        const railRows = filteredNpcs(query);\n        const oldNpcId = overlay.querySelector('.npc-state-v3-dossier')?.dataset.npcId || '';\n        const oldScroll = overlay.querySelector('.npc-state-v3-dossier-document')?.scrollTop || 0;\n        const npc = allRows.find(item => item.id === selectedNpcId) || null;`,
        `        const indexRows = dossierIndex() || [];\n        const allRows = filteredNpcs(indexRows, '');\n        selectedNpcId = chooseLibrarySelection(allRows, selectedNpcId);\n        const search = overlay.querySelector('#npc_state_v3_library_search');\n        const query = search?.value || '';\n        const railRows = query.trim() ? filteredNpcs(allRows, query) : allRows;\n        const oldNpcId = overlay.querySelector('.npc-state-v3-dossier')?.dataset.npcId || '';\n        const oldScroll = overlay.querySelector('.npc-state-v3-dossier-document')?.scrollTop || 0;\n        const npc = railOnly ? null : dossierNpc(selectedNpcId);`,
        'single projection library read',
    );
    source = replaceRequired(
        source,
        `            const npc = findNpcByReference(state(), id);`,
        `            const npc = dossierNpc(id);`,
        'archive selected NPC read',
    );
    source = replaceRequired(
        source,
        `            const npc = findNpcByReference(state(), id);`,
        `            const npc = dossierNpc(id);`,
        'delete selected NPC read',
    );
    source = replaceRequired(
        source,
        `    function openEditor(id) {\n        const npc = findNpcByReference(state(), id);`,
        `    function openEditor(id) {\n        const npc = dossierNpc(id);`,
        'editor selected NPC read',
    );
    source = replaceRequired(
        source,
        `        const current = state();\n        if (!current) return;\n        const present = current.npcs.filter(npc => npc.present && !npc.archived && !npc.minor);`,
        `        const current = dossierIndex();\n        if (!current) return;\n        const present = current.filter(npc => npc.present && !npc.archived && !npc.minor);`,
        'inline projection read',
    );
    source = replaceRequired(
        source,
        `        holder.innerHTML = \`<div class="npc-state-present-roster-head"><span class="npc-state-kicker">IN-CHAT NPCS</span><small>\${present.length} shown</small></div><div class="npc-state-present-grid">\${present.map(npc => \`<button type="button" class="npc-state-present-card npc-state-v3-inline-card" data-npc-id="\${escapeHtml(npc.id)}"><span class="npc-state-present-card-portrait">\${npc.portrait?.dataUrl ? \`<img src="\${escapeHtml(npc.portrait.dataUrl)}" alt="">\` : \`<div class="npc-state-present-card-placeholder">\${escapeHtml(String(npc.name || '?').charAt(0))}</div>\`}</span><span class="npc-state-present-card-overlay"><b>\${escapeHtml(npc.name)}</b><small>\${escapeHtml(presentNpcAgeLabel(npc))}</small></span></button>\`).join('')}</div>\`;`,
        `        holder.innerHTML = \`<div class="npc-state-present-roster-head"><span class="npc-state-kicker">IN-CHAT NPCS</span><small>\${present.length} shown</small></div><div class="npc-state-present-grid">\${present.map(npc => { const portrait = engine.getNpcPortraitSource(npc.id, getChatKey()); return \`<button type="button" class="npc-state-present-card npc-state-v3-inline-card" data-npc-id="\${escapeHtml(npc.id)}"><span class="npc-state-present-card-portrait">\${portrait ? \`<img src="\${escapeHtml(portrait)}" alt="">\` : \`<div class="npc-state-present-card-placeholder">\${escapeHtml(String(npc.name || '?').charAt(0))}</div>\`}</span><span class="npc-state-present-card-overlay"><b>\${escapeHtml(npc.name)}</b><small>\${escapeHtml(presentNpcAgeLabel(npc))}</small></span></button>\`; }).join('')}</div>\`;`,
        'inline on-demand portrait read',
    );
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State v0.4.39 dossier state projection performance hardening');