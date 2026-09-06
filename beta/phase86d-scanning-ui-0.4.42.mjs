import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.42 UI marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'v03/ui.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(source,
        `    const onSettingsChanged = adapters.onSettingsChanged || (() => {});`,
        `    const onSettingsChanged = adapters.onSettingsChanged || (() => {});\n    const getScanConnectionProfiles = adapters.getScanConnectionProfiles || (() => ({ available: false, profiles: [], error: '' }));\n    const getCompletenessStatus = adapters.getCompletenessStatus || (() => ({ status: 'idle', messageId: null, detail: '' }));`,
        'UI adapters');
    source = replaceRequired(source,
        `              <label class="npc-state-setting-row"><span><b>Scanner Response Limit</b><small>Output ceiling for separate scans, dossier Refresh, structured imports, and retries. Range: 512-15,000 tokens. Increase for large casts. Does not change RP output or history depth.</small></span><input id="npc_state_v047_response_tokens" class="text_pole npc-state-number" type="number" min="512" max="15000" step="1"></label>`,
        `              <label class="npc-state-setting-row"><span><b>Scanner Response Limit</b><small>Output ceiling for separate scans, dossier Refresh, structured imports, and retries. Range: 512-15,000 tokens. Increase for large casts. Does not change RP output or history depth.</small></span><input id="npc_state_v047_response_tokens" class="text_pole npc-state-number" type="number" min="512" max="15000" step="1"></label>\n              <label class="npc-state-setting-row"><span><b>NPC scan connection profile</b><small>Current connection preserves existing behavior. A saved supported SillyTavern Connection Profile applies only to separate NPC scans and JSON retries; normal roleplay and embedded NPC output stay on your main connection.</small></span><select id="npc_state_v3_scan_profile" class="text_pole"><option value="">Current connection</option></select></label>\n              <label class="npc-state-setting-row"><span><b>Scan after each response</b><small>After a successful embedded update, run one additional dossier-completeness scan through the configured NPC scan connection. Off by default. Usually adds one request per completed response, plus a JSON retry if needed.</small><small id="npc_state_v3_completeness_status" class="npc-state-muted"></small></span><input id="npc_state_v3_scan_after_response" type="checkbox"></label>`,
        'scanning controls');
    source = replaceRequired(source,
        `    function syncSettings() {`,
        `    function syncScanConnectionProfile(panel, settings) {\n        const select = panel.querySelector('#npc_state_v3_scan_profile');\n        if (!select) return;\n        const info = getScanConnectionProfiles();\n        const selected = String(settings.scanConnectionProfileId || '');\n        const rows = [{ id: '', name: 'Current connection' }, ...(info.profiles || [])];\n        if (selected && !rows.some(row => row.id === selected)) rows.push({ id: selected, name: 'Unavailable profile · ' + selected });\n        const signature = JSON.stringify(rows);\n        if (select.dataset.profileSignature !== signature) {\n            select.innerHTML = rows.map(row => '<option value="' + escapeHtml(row.id) + '">' + escapeHtml(row.name) + '</option>').join('');\n            select.dataset.profileSignature = signature;\n        }\n        select.value = rows.some(row => row.id === selected) ? selected : '';\n        select.title = info.available === false && info.error ? info.error : '';\n    }\n\n    function syncCompletenessStatus(panel) {\n        const holder = panel.querySelector('#npc_state_v3_completeness_status');\n        if (!holder) return;\n        const status = getCompletenessStatus();\n        if (status.status === 'pending') holder.textContent = ' Pending…';\n        else if (status.status === 'running') holder.textContent = ' Running…';\n        else if (status.status === 'failed') holder.textContent = ' Failed: ' + String(status.detail || 'request did not commit');\n        else holder.textContent = '';\n    }\n\n    function syncSettings() {`,
        'profile/status sync helpers');
    source = replaceRequired(source,
        `        panel.querySelector('#npc_state_v047_response_tokens').value = normalizeScannerResponseTokens(settings.scannerResponseTokens);`,
        `        panel.querySelector('#npc_state_v047_response_tokens').value = normalizeScannerResponseTokens(settings.scannerResponseTokens);\n        panel.querySelector('#npc_state_v3_scan_after_response').checked = settings.scanAfterEachResponse === true;\n        syncScanConnectionProfile(panel, settings);\n        syncCompletenessStatus(panel);`,
        'sync new settings');
    source = replaceRequired(source,
        `        panel.querySelector('#npc_state_v047_response_tokens')?.addEventListener('change', event => {`,
        `        panel.querySelector('#npc_state_v3_scan_profile')?.addEventListener('focus', () => syncScanConnectionProfile(panel, getSettings()));\n        panel.querySelector('#npc_state_v3_scan_profile')?.addEventListener('change', event => {\n            getSettings().scanConnectionProfileId = String(event.target.value || '').trim().slice(0, 240);\n            persistSettings();\n            syncScanConnectionProfile(panel, getSettings());\n        });\n        bindCheck('#npc_state_v3_scan_after_response', 'scanAfterEachResponse');\n        panel.querySelector('#npc_state_v047_response_tokens')?.addEventListener('change', event => {`,
        'bind new settings');
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/settings-layout.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(source,
        `        '#npc_state_v047_response_tokens',`,
        `        '#npc_state_v047_response_tokens',\n        '#npc_state_v3_scan_profile',\n        '#npc_state_v3_scan_after_response',`,
        'Scanning category');
    fs.writeFileSync(path, source);
}

console.log('Applied v0.4.42 scanning settings UI');
