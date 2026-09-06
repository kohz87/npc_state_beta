import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.37 diagnostics-toggle marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'v03/index.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `    injectBudgetTokens: 1800,\n    branchRescan: true,`,
        `    injectBudgetTokens: 1800,\n    showDossierDiagnostics: false,\n    branchRescan: true,`,
        'settings default',
    );
    source = replaceRequired(
        source,
        `    settings.relationshipCaps = normalizeRelationshipCaps(settings.relationshipCaps);\n    if (!settings.dataFiles || typeof settings.dataFiles !== 'object' || Array.isArray(settings.dataFiles)) settings.dataFiles = {};`,
        `    settings.relationshipCaps = normalizeRelationshipCaps(settings.relationshipCaps);\n    settings.showDossierDiagnostics = settings.showDossierDiagnostics === true;\n    if (!settings.dataFiles || typeof settings.dataFiles !== 'object' || Array.isArray(settings.dataFiles)) settings.dataFiles = {};`,
        'settings normalization',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/dossier-view.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `export function dossierHtml(npc) {`,
        `export function dossierHtml(npc, { showDiagnostics = false } = {}) {`,
        'dossier options',
    );
    source = replaceRequired(
        source,
        `          <details class="npc-state-v3-dossier-more"><summary><i class="fa-solid fa-ellipsis"></i><span>More</span></summary><div>\n            <button class="menu_button npc-state-v3-import-structured"`,
        `          <details class="npc-state-v3-dossier-more"><summary><i class="fa-solid fa-ellipsis"></i><span>More</span></summary><div>\n            <button type="button" class="menu_button npc-state-v3-toggle-diagnostics"><i class="fa-solid fa-stethoscope"></i> \${showDiagnostics ? 'Hide diagnostics' : 'Show diagnostics'}</button>\n            <button class="menu_button npc-state-v3-import-structured"`,
        'dossier quick toggle',
    );
    source = replaceRequired(
        source,
        `            \${block('Life-state diagnostics', lifeStateDiagnosticsHtml(npc), 'npc-state-v3-block-wide')}\n            \${block('Recent relationship changes', relationshipHistoryHtml(npc), 'npc-state-v3-block-wide')}\n            \${block('Relationship evaluation & scoring', relationshipDiagnosticsHtml(npc), 'npc-state-v3-block-wide')}`,
        `            \${showDiagnostics ? block('Life-state diagnostics', lifeStateDiagnosticsHtml(npc), 'npc-state-v3-block-wide') : ''}\n            \${block('Recent relationship changes', relationshipHistoryHtml(npc), 'npc-state-v3-block-wide')}\n            \${showDiagnostics ? block('Relationship evaluation & scoring', relationshipDiagnosticsHtml(npc), 'npc-state-v3-block-wide') : ''}`,
        'conditional diagnostic blocks',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/ui.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `              <label class="npc-state-setting-row"><span><b>Injection budget</b><small>Approximate token budget.</small></span><input id="npc_state_v3_inject_budget" class="text_pole npc-state-number" type="number" min="256" max="8000" step="100"></label>\n              <label class="npc-state-setting-row"><span><b>Rescan changed branches</b>`,
        `              <label class="npc-state-setting-row"><span><b>Injection budget</b><small>Approximate token budget.</small></span><input id="npc_state_v3_inject_budget" class="text_pole npc-state-number" type="number" min="256" max="8000" step="100"></label>\n              <label class="npc-state-setting-row"><span><b>Show dossier diagnostics</b><small>Shows life-state rejection and relationship-scoring diagnostics in the Dossier Library. Off by default; hidden diagnostics stay recorded but are not rendered.</small></span><input id="npc_state_v3_show_diagnostics" type="checkbox"></label>\n              <label class="npc-state-setting-row"><span><b>Rescan changed branches</b>`,
        'settings control',
    );
    source = replaceRequired(
        source,
        `        panel.querySelector('#npc_state_v3_inject_budget').value = settings.injectBudgetTokens;\n        panel.querySelector('#npc_state_v3_branch_rescan').checked = settings.branchRescan !== false;`,
        `        panel.querySelector('#npc_state_v3_inject_budget').value = settings.injectBudgetTokens;\n        panel.querySelector('#npc_state_v3_show_diagnostics').checked = settings.showDossierDiagnostics === true;\n        panel.querySelector('#npc_state_v3_branch_rescan').checked = settings.branchRescan !== false;`,
        'settings sync',
    );
    source = replaceRequired(
        source,
        `        bindCheck('#npc_state_v3_inject', 'inject');\n        bindCheck('#npc_state_v3_branch_rescan', 'branchRescan');`,
        `        bindCheck('#npc_state_v3_inject', 'inject');\n        panel.querySelector('#npc_state_v3_show_diagnostics')?.addEventListener('change', event => {\n            getSettings().showDossierDiagnostics = Boolean(event.target.checked);\n            persistSettings();\n            renderLibrary();\n        });\n        bindCheck('#npc_state_v3_branch_rescan', 'branchRescan');`,
        'settings handler',
    );
    source = replaceRequired(
        source,
        `        const detail = overlay.querySelector('.npc-state-v3-library-detail');\n        if (detail) detail.innerHTML = dossierHtml(npc);`,
        `        const detail = overlay.querySelector('.npc-state-v3-library-detail');\n        const showDiagnostics = getSettings().showDossierDiagnostics === true;\n        if (detail) detail.innerHTML = dossierHtml(npc, { showDiagnostics });`,
        'dossier render option',
    );
    source = replaceRequired(
        source,
        `        root.querySelector('.npc-state-v3-edit')?.addEventListener('click', event => openEditor(event.currentTarget.dataset.npcId));\n        root.querySelector('.npc-state-v3-refresh')?.addEventListener('click', async event => {`,
        `        root.querySelector('.npc-state-v3-edit')?.addEventListener('click', event => openEditor(event.currentTarget.dataset.npcId));\n        root.querySelector('.npc-state-v3-toggle-diagnostics')?.addEventListener('click', () => {\n            const settings = getSettings();\n            settings.showDossierDiagnostics = settings.showDossierDiagnostics !== true;\n            persistSettings();\n            syncSettings();\n            renderLibrary();\n        });\n        root.querySelector('.npc-state-v3-refresh')?.addEventListener('click', async event => {`,
        'dossier quick-toggle handler',
    );
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State v0.4.37 dossier diagnostics visibility toggle');
