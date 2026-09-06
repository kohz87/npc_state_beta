import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.40 hidden-settings hot-path marker: ' + label);
    return source.replace(from, to);
}

// MESSAGE_EDITED is visible in the user's performance trace. Branch reconciliation only
// needs the recovery record at this point, not an immutable clone of the complete sidecar.
{
    const path = 'v03/index.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `        const recovery = engine.getState(key)?.recovery;`,
        `        const recovery = engine.recoveryStatus(key);`,
        'branch recovery status narrow read',
    );
    fs.writeFileSync(path, source);
}

// Bundle settings only need stable id, display name, and archive state to populate the
// selector. Do not clone portraits, histories, diagnostics, checkpoints, or rebase state
// just because the collapsed settings drawer refreshed after a normal NPC commit.
{
    const path = 'v03/bundle-ui.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `    function state() { return engine.getState?.() || null; }`,
        `    function dossierIndex() { return engine.getDossierIndex?.() || []; }\n    let rosterSignature = '';`,
        'bundle dossier index helper',
    );
    source = replaceRequired(
        source,
        `        const current = state();\n        const previous = select?.value || '';\n        const rows = [...(current?.npcs || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));\n        if (select) {\n            select.innerHTML = rows.length\n                ? rows.map(npc => \`<option value="\${escapeHtml(npc.id)}">\${escapeHtml(npc.name)}\${npc.archived ? ' · archived' : ''}</option>\`).join('')\n                : '<option value="">No dossiers</option>';\n            if (rows.some(npc => npc.id === previous)) select.value = previous;\n        }`,
        `        const previous = select?.value || '';\n        const rows = [...dossierIndex()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));\n        const nextSignature = JSON.stringify(rows.map(npc => [String(npc.id || ''), String(npc.name || ''), npc.archived === true]));\n        if (select && nextSignature !== rosterSignature) {\n            select.innerHTML = rows.length\n                ? rows.map(npc => \`<option value="\${escapeHtml(npc.id)}">\${escapeHtml(npc.name)}\${npc.archived ? ' · archived' : ''}</option>\`).join('')\n                : '<option value="">No dossiers</option>';\n            if (rows.some(npc => npc.id === previous)) select.value = previous;\n            rosterSignature = nextSignature;\n        }`,
        'bundle projected roster sync',
    );
    source = replaceRequired(
        source,
        `        section.querySelector('#npc_state_v3_bundle_import')?.addEventListener('click', () => section.querySelector(\`#\${FILE_ID}\`)?.click?.());`,
        `        section.querySelector('#npc_state_v3_bundle_import')?.addEventListener('click', () => section.querySelector(\`#\${FILE_ID}\`)?.click?.());\n        section.addEventListener('toggle', () => { if (section.open) sync(); });`,
        'bundle open-time refresh',
    );
    source = replaceRequired(
        source,
        `    function refresh() {\n        if (!attach()) return false;\n        return sync();\n    }`,
        `    function refresh() {\n        if (!attach()) return false;\n        const section = globalThis.document?.getElementById?.(SECTION_ID);\n        if (section && !section.open) return true;\n        return sync();\n    }`,
        'bundle collapsed refresh skip',
    );
    fs.writeFileSync(path, source);
}

// Portrait settings were another hidden full-sidecar clone source: a normal state commit
// refreshed the collapsed section, which cloned the whole database for its NPC selector and
// again for preview resolution. Roster choices use the index projection; prompt/preview work
// clones only the single selected dossier and is deferred while the section is collapsed.
{
    const path = 'v03/portrait-ui.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `import { findNpcByReference } from './schema.js';\n`,
        ``,
        'portrait full-state identity import removal',
    );
    source = replaceRequired(
        source,
        `    function panel() { return globalThis.document?.getElementById?.(SECTION_ID) || null; }\n    function promptOverlay() { return globalThis.document?.getElementById?.(PROMPT_OVERLAY_ID) || null; }\n    function state() { return engine.getState?.() || null; }`,
        `    function panel() { return globalThis.document?.getElementById?.(SECTION_ID) || null; }\n    function promptOverlay() { return globalThis.document?.getElementById?.(PROMPT_OVERLAY_ID) || null; }\n    function dossierIndex() { return engine.getDossierIndex?.() || []; }\n    function dossierNpc(reference) { return engine.getDossierNpc?.(reference) || null; }\n    let npcChoiceSignature = '';`,
        'portrait projected state helpers',
    );
    source = replaceRequired(
        source,
        `        return id ? findNpcByReference(state(), id) : null;`,
        `        return id ? dossierNpc(id) : null;`,
        'portrait chosen npc narrow read',
    );
    source = replaceRequired(
        source,
        `        const previous = select.value || '';\n        const rows = [...(state()?.npcs || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));\n        select.innerHTML = rows.length\n            ? rows.map(npc => \`<option value="\${escapeHtml(npc.id)}">\${escapeHtml(npc.name)}\${npc.archived ? ' · archived' : ''}</option>\`).join('')\n            : '<option value="">No dossiers</option>';\n        if (rows.some(npc => npc.id === previous)) select.value = previous;`,
        `        const previous = select.value || '';\n        const rows = [...dossierIndex()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));\n        const nextSignature = JSON.stringify(rows.map(npc => [String(npc.id || ''), String(npc.name || ''), npc.archived === true]));\n        if (nextSignature !== npcChoiceSignature) {\n            select.innerHTML = rows.length\n                ? rows.map(npc => \`<option value="\${escapeHtml(npc.id)}">\${escapeHtml(npc.name)}\${npc.archived ? ' · archived' : ''}</option>\`).join('')\n                : '<option value="">No dossiers</option>';\n            if (rows.some(npc => npc.id === previous)) select.value = previous;\n            npcChoiceSignature = nextSignature;\n        }`,
        'portrait projected choice sync',
    );
    source = replaceRequired(
        source,
        `        const npc = shell ? findNpcByReference(state(), shell.dataset.npcId || '') : null;`,
        `        const npc = shell ? dossierNpc(shell.dataset.npcId || '') : null;`,
        'portrait overlay narrow read',
    );
    source = replaceRequired(
        source,
        `        const npc = findNpcByReference(state(), reference);`,
        `        const npc = dossierNpc(reference);`,
        'portrait open narrow read',
    );
    // The same old lookup occurs in buildPairFor and buildFor after openFor was replaced.
    source = source.replaceAll(
        `        const npc = findNpcByReference(state(), reference);`,
        `        const npc = dossierNpc(reference);`,
    );
    source = replaceRequired(
        source,
        `        bind(section);\n        draft = savedDraft();`,
        `        bind(section);\n        section.addEventListener('toggle', () => { if (section.open) refresh(); });\n        draft = savedDraft();`,
        'portrait open-time refresh',
    );
    source = replaceRequired(
        source,
        `        const root = panel();\n        if (!dirty) {`,
        `        const root = panel();\n        if (root && !root.open && !promptOverlay()) return true;\n        if (!dirty) {`,
        'portrait collapsed refresh skip',
    );
    if (source.includes('findNpcByReference(state()')) throw new Error('Portrait UI still contains a full-state dossier lookup');
    if (source.includes('engine.getState?.()')) throw new Error('Portrait UI still contains a full-sidecar state helper');
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State v0.4.40 hidden settings and MESSAGE_EDITED hot-path hardening');
