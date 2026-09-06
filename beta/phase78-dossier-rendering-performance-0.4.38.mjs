import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.38 dossier-performance marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'v03/dossier-view.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `function portraitHtml(npc, className, { decorative = false } = {}) {`,
        `function portraitHtml(npc, className, { decorative = false, deferSource = false } = {}) {`,
        'portrait helper options',
    );
    source = replaceRequired(
        source,
        `function portraitHtml(npc, className, { decorative = false, deferSource = false } = {}) {\n    const src = portraitSource(npc);\n    if (src) {`,
        `function portraitHtml(npc, className, { decorative = false, deferSource = false } = {}) {\n    const src = portraitSource(npc);\n    if (src) {\n        if (deferSource) return '<img class="' + className + ' npc-state-v3-deferred-portrait" alt="' + (decorative ? '' : escapeHtml(npc?.name || 'NPC') + ' portrait') + '" loading="lazy" decoding="async">';`,
        'deferred portrait markup',
    );
    source = replaceRequired(
        source,
        `portraitHtml(npc, 'npc-state-v3-cast-image', { decorative: true })`,
        `portraitHtml(npc, 'npc-state-v3-cast-image', { decorative: true, deferSource: true })`,
        'cast rail deferred portrait',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/ui.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `    let activeEditorNpcId = '';\n    let mountTimer = null;`,
        `    let activeEditorNpcId = '';\n    let mountTimer = null;\n    let castPortraitObserver = null;\n    let librarySearchFrame = null;`,
        'library performance state',
    );
    source = replaceRequired(
        source,
        `    function libraryOverlay() { return document.getElementById(LIBRARY_ID); }\n\n    function centerSelectedCastCard`,
        `    function libraryOverlay() { return document.getElementById(LIBRARY_ID); }\n\n    function portraitSourceForUi(npc = {}) {\n        const portrait = npc?.portrait && typeof npc.portrait === 'object' ? npc.portrait : {};\n        return String(portrait.dataUrl || portrait.url || portrait.src || '').trim();\n    }\n\n    function disconnectCastPortraitObserver() {\n        castPortraitObserver?.disconnect?.();\n        castPortraitObserver = null;\n    }\n\n    function hydrateVisibleCastPortraits(overlay, rows = []) {\n        disconnectCastPortraitObserver();\n        const rail = overlay?.querySelector('.npc-state-v3-cast-rail');\n        if (!rail) return;\n        const byId = new Map((Array.isArray(rows) ? rows : []).map(npc => [String(npc?.id || ''), npc]).filter(([id]) => id));\n        const cards = [...rail.querySelectorAll('.npc-state-v3-cast-card')];\n        const load = card => {\n            const image = card?.querySelector('.npc-state-v3-deferred-portrait');\n            if (!image || image.getAttribute('src')) return;\n            const npc = byId.get(String(card.dataset.npcId || ''));\n            const src = portraitSourceForUi(npc);\n            if (!src) return;\n            image.src = src;\n        };\n        const selected = cards.find(card => card.dataset.npcId === selectedNpcId);\n        if (selected) load(selected);\n        if (typeof globalThis.IntersectionObserver !== 'function') {\n            cards.forEach(load);\n            return;\n        }\n        castPortraitObserver = new globalThis.IntersectionObserver(entries => {\n            for (const entry of entries) {\n                if (!entry.isIntersecting) continue;\n                load(entry.target);\n                castPortraitObserver?.unobserve?.(entry.target);\n            }\n        }, { root: rail, rootMargin: '0px 360px' });\n        for (const card of cards) {\n            if (card === selected || !portraitSourceForUi(byId.get(String(card.dataset.npcId || '')))) continue;\n            castPortraitObserver.observe(card);\n        }\n    }\n\n    function setSelectedCastCard(overlay, id) {\n        const selected = String(id || '');\n        const cards = overlay?.querySelectorAll('.npc-state-v3-cast-card') || [];\n        for (const card of cards) {\n            const active = String(card.dataset.npcId || '') === selected;\n            card.classList.toggle('active', active);\n            card.setAttribute('aria-pressed', active ? 'true' : 'false');\n        }\n    }\n\n    function scheduleLibraryRailRender() {\n        if (librarySearchFrame) return;\n        const schedule = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0));\n        librarySearchFrame = schedule(() => {\n            librarySearchFrame = null;\n            renderLibrary({ railOnly: true });\n        });\n    }\n\n    function centerSelectedCastCard`,
        'lazy cast portrait helpers',
    );
    source = replaceRequired(
        source,
        `    function renderLibrary({ centerSelected = false } = {}) {`,
        `    function renderLibrary({ centerSelected = false, railOnly = false, detailOnly = false } = {}) {`,
        'partial library render options',
    );
    source = replaceRequired(
        source,
        `        const rail = overlay.querySelector('.npc-state-v3-cast-rail');\n        if (rail) rail.innerHTML = castRailHtml(railRows, selectedNpcId);\n        rail?.querySelectorAll('.npc-state-v3-cast-card').forEach(button => button.addEventListener('click', () => {\n            selectedNpcId = button.dataset.npcId;\n            renderLibrary({ centerSelected: true });\n        }));\n\n        const detail = overlay.querySelector('.npc-state-v3-library-detail');\n        const showDiagnostics = getSettings().showDossierDiagnostics === true;\n        if (detail) detail.innerHTML = dossierHtml(npc, { showDiagnostics });\n        wireDossierActions(detail);\n\n        const title = overlay.querySelector('.npc-state-v3-library-head-name');\n        if (title) title.textContent = npc?.name || 'No dossier selected';`,
        `        const rail = overlay.querySelector('.npc-state-v3-cast-rail');\n        if (!detailOnly) {\n            if (rail) rail.innerHTML = castRailHtml(railRows, selectedNpcId);\n            hydrateVisibleCastPortraits(overlay, railRows);\n        }\n\n        const detail = overlay.querySelector('.npc-state-v3-library-detail');\n        if (!railOnly) {\n            const showDiagnostics = getSettings().showDossierDiagnostics === true;\n            if (detail) detail.innerHTML = dossierHtml(npc, { showDiagnostics });\n            wireDossierActions(detail);\n            const title = overlay.querySelector('.npc-state-v3-library-head-name');\n            if (title) title.textContent = npc?.name || 'No dossier selected';\n        }`,
        'split rail and detail rendering',
    );
    source = replaceRequired(
        source,
        `        const documentPane = detail?.querySelector('.npc-state-v3-dossier-document');\n        if (documentPane && npc?.id === oldNpcId && !centerSelected) documentPane.scrollTop = oldScroll;`,
        `        const documentPane = !railOnly ? detail?.querySelector('.npc-state-v3-dossier-document') : null;\n        if (documentPane && npc?.id === oldNpcId && !centerSelected) documentPane.scrollTop = oldScroll;`,
        'detail scroll preservation scope',
    );
    source = replaceRequired(
        source,
        `            overlay.querySelector('#npc_state_v3_library_search')?.addEventListener('input', () => renderLibrary());\n            overlay.querySelector('.npc-state-v3-cast-prev')?.addEventListener('click', () => scrollCastRail(-1));`,
        `            overlay.querySelector('#npc_state_v3_library_search')?.addEventListener('input', scheduleLibraryRailRender);\n            overlay.querySelector('.npc-state-v3-cast-rail')?.addEventListener('click', event => {\n                const button = event.target.closest?.('.npc-state-v3-cast-card');\n                if (!button) return;\n                selectedNpcId = String(button.dataset.npcId || '');\n                setSelectedCastCard(overlay, selectedNpcId);\n                renderLibrary({ centerSelected: true, detailOnly: true });\n            });\n            overlay.querySelector('.npc-state-v3-cast-prev')?.addEventListener('click', () => scrollCastRail(-1));`,
        'delegated cast selection and search coalescing',
    );
    source = replaceRequired(
        source,
        `    function closeLibrary() {\n        libraryOverlay()?.remove();`,
        `    function closeLibrary() {\n        disconnectCastPortraitObserver();\n        libraryOverlay()?.remove();`,
        'observer cleanup',
    );
    source = replaceRequired(
        source,
        `            persistSettings();\n            renderLibrary();\n        });\n        bindCheck('#npc_state_v3_branch_rescan', 'branchRescan');`,
        `            persistSettings();\n            renderLibrary({ detailOnly: true });\n        });\n        bindCheck('#npc_state_v3_branch_rescan', 'branchRescan');`,
        'settings diagnostics detail-only render',
    );
    source = replaceRequired(
        source,
        `            persistSettings();\n            syncSettings();\n            renderLibrary();\n        });\n        root.querySelector('.npc-state-v3-refresh')`,
        `            persistSettings();\n            syncSettings();\n            renderLibrary({ detailOnly: true });\n        });\n        root.querySelector('.npc-state-v3-refresh')`,
        'quick diagnostics detail-only render',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/style.css';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `.npc-state-v3-library-overlay{backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}`,
        `.npc-state-v3-library-overlay{backdrop-filter:none;-webkit-backdrop-filter:none;background:rgba(0,0,0,.88)}`,
        'full-screen backdrop blur removal',
    );
    if (!source.includes('PHASE78_DOSSIER_RENDERING_PERFORMANCE')) {
        source += `\n/* PHASE78_DOSSIER_RENDERING_PERFORMANCE */\n.npc-state-v3-cast-card{contain:layout paint style}\n`;
    }
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State v0.4.38 dossier rendering performance hardening');