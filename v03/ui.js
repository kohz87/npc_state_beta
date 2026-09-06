import { castRailHtml, dossierHtml, filterDossierNpcs } from './dossier-view.js';
import { normalizeDossierLimits, normalizeScannerResponseTokens } from './schema.js';

const SETTINGS_ID = 'npc_state_settings';
const LIBRARY_ID = 'npc_state_v3_library_overlay';
const EDITOR_ID = 'npc_state_v3_editor_overlay';
const INLINE_ID = 'npc_state_v3_inline';

export function chooseLibrarySelection(rows = [], selectedId = '') {
    const id = String(selectedId || '');
    return rows.some(npc => npc?.id === id) ? id : (rows[0]?.id || '');
}

export function editorIdentityMatches(activeId, shellId) {
    const active = String(activeId || '');
    const shell = String(shellId || '');
    return Boolean(active && shell && active === shell);
}

export function presentNpcAgeLabel(npc = {}) {
    const apparentAge = String(npc?.apparentAge ?? '').trim();
    if (apparentAge) return `Looks ${apparentAge}`;
    const age = String(npc?.age ?? '').trim();
    return age ? `Age ${age}` : 'Age unknown';
}

export function inlineRosterSignature(rows = [], messageId = -1) {
    return JSON.stringify([Number(messageId), ...(Array.isArray(rows) ? rows : []).map(npc => [
        String(npc?.id || ''),
        String(npc?.name || ''),
        String(npc?.age ?? ''),
        String(npc?.apparentAge ?? ''),
        npc?.present === true,
        npc?.archived === true,
        npc?.minor === true,
        npc?.portraitAvailable === true,
        Number(npc?.updatedAt) || 0,
    ])]);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function splitLines(value, max = 12) {
    return [...new Set(String(value || '').split(/\r?\n|\s*;\s*/).map(item => item.trim()).filter(Boolean))].slice(0, max);
}

function parseAppearanceForms(value, max = 12) {
    const out = [];
    const seen = new Set();
    for (const raw of String(value || '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const split = line.indexOf('|');
        if (split <= 0) continue;
        const name = line.slice(0, split).trim().slice(0, 80);
        const appearance = line.slice(split + 1).trim().slice(0, 1800);
        const key = name.toLocaleLowerCase();
        if (!name || !appearance || seen.has(key)) continue;
        seen.add(key);
        out.push({ name, appearance });
        if (out.length >= max) break;
    }
    return out;
}

function appearanceFormsEditorText(npc = {}) {
    return (Array.isArray(npc.appearanceForms) ? npc.appearanceForms : [])
        .map(form => String(form?.name || '').trim() + ' | ' + String(form?.appearance || '').trim())
        .filter(line => !/^\s*\|/.test(line))
        .join('\n');
}

function latestAssistantMessageId(chat = []) {
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        const message = chat[i];
        if (message && !message.is_system && !message.is_user) return i;
    }
    return -1;
}

function messageElement(messageId) {
    if (!Number.isInteger(messageId) || messageId < 0) return null;
    const selectors = [
        `#chat .mes[mesid="${messageId}"]`, `.mes[mesid="${messageId}"]`,
        `#chat .mes[data-mesid="${messageId}"]`, `.mes[data-mesid="${messageId}"]`,
        `#chat .mes[data-message-id="${messageId}"]`, `.mes[data-message-id="${messageId}"]`,
    ];
    for (const selector of selectors) {
        const found = document.querySelector?.(selector);
        if (found) return found;
    }
    return null;
}

export function createNpcStateUi(adapters = {}) {
    const engine = adapters.engine;
    const getContext = adapters.getContext;
    const getChatKey = adapters.getChatKey;
    const getSettings = adapters.getSettings;
    const persistSettings = adapters.persistSettings || (() => {});
    const onSettingsChanged = adapters.onSettingsChanged || (() => {});
    const getScanConnectionProfiles = adapters.getScanConnectionProfiles || (() => ({ available: false, profiles: [], error: '' }));
    const getCompletenessStatus = adapters.getCompletenessStatus || (() => ({ status: 'idle', messageId: null, detail: '' }));
    let selectedNpcId = '';
    let activeEditorNpcId = '';
    let mountTimer = null;
    let castPortraitObserver = null;
    let librarySearchFrame = null;

    function notify(kind, message) {
        const fn = globalThis.toastr?.[kind];
        if (typeof fn === 'function') fn(message);
    }

    async function safely(label, task) {
        try { return await task(); }
        catch (error) {
            console.error(`[NPC State v0.4.42] ${label} failed safely`, error);
            notify('error', `NPC State: ${label} failed. No partial dossier write was committed. ${error?.message || error}`);
            return { ok: false, reason: 'error', error };
        }
    }

    function dossierIndex() { return engine.getDossierIndex(getChatKey()); }
    function dossierNpc(reference) { return engine.getDossierNpc(reference, getChatKey()); }

    function settingsHtml() {
        return `<div id="${SETTINGS_ID}" class="extension_container npc-state-extension npc-state-v3-settings">
          <div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>NPC State <span class="npc-state-version">0.4.42</span></b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
          <div class="inline-drawer-content npc-state-drawer">
            <div class="npc-state-intro">v0.4.42 uses foreground embedded capture for normal turns. Exchange participation, in-chat relevance, and explicit off-screen activity are independent signals. Stable v0.3 dossiers can be cloned once into an independent beta sidecar.</div>
            <div class="npc-state-settings-grid">
              <label class="npc-state-setting-row"><span><b>Enable NPC State</b><small>Disabling stops automatic scanning and injection. Manual dossier tools remain available.</small></span><input id="npc_state_v3_enabled" type="checkbox"></label>
              <label class="npc-state-setting-row"><span><b>Auto Scan</b><small>Uses the same foreground RP generation. If the embedded block is missing, NPC State automatically runs one full separate current-cast scan.</small></span><input id="npc_state_v3_auto" type="checkbox"></label>
              <label class="npc-state-setting-row"><span><b>Malformed capture recovery</b><small>Missing embedded capture always triggers one full scan. Enable this to also run a separate recovery scan when an embedded block is present but malformed. Off by default.</small></span><input id="npc_state_v04_fallback" type="checkbox"></label>
              <label class="npc-state-setting-row"><span><b>Context depth</b><small>Older messages are profile/memory context only; relationship deltas remain current-exchange-only.</small></span><input id="npc_state_v3_scan_depth" class="text_pole npc-state-number" type="number" min="2" max="30"></label>
              <label class="npc-state-setting-row"><span><b>Enrich new NPCs from recent history</b><small>Adds a small visible-history capsule to the same foreground generation. Current exchange still decides admission, live state, and relationship changes. No extra model call.</small></span><input id="npc_state_v04_new_npc_history" type="checkbox"></label>
              <label class="npc-state-setting-row"><span><b>New NPC admission</b><small>Balanced keeps current behavior. Named preferred ignores first-seen unnamed role labels. Manual prevents scanner-created dossiers while existing NPCs still update.</small></span><select id="npc_state_v04_admission" class="text_pole"><option value="balanced">Balanced</option><option value="named_preferred">Named preferred</option><option value="manual">Manual</option></select></label>
              <label class="npc-state-setting-row"><span><b>Scanner Response Limit</b><small>Output ceiling for separate scans, dossier Refresh, structured imports, and retries. Range: 512-15,000 tokens. Increase for large casts. Does not change RP output or history depth.</small></span><input id="npc_state_v047_response_tokens" class="text_pole npc-state-number" type="number" min="512" max="15000" step="1"></label>
              <label class="npc-state-setting-row"><span><b>NPC scan connection profile</b><small>Current connection preserves existing behavior. A saved supported SillyTavern Connection Profile applies only to separate NPC scans and JSON retries; normal roleplay and embedded NPC output stay on your main connection.</small></span><select id="npc_state_v3_scan_profile" class="text_pole"><option value="">Current connection</option></select></label>
              <label class="npc-state-setting-row"><span><b>Scan after each response</b><small>After a successful embedded update, run one additional dossier-completeness scan through the configured NPC scan connection. Off by default. Usually adds one request per completed response, plus a JSON retry if needed.</small><small id="npc_state_v3_completeness_status" class="npc-state-muted"></small></span><input id="npc_state_v3_scan_after_response" type="checkbox"></label>
              <label class="npc-state-setting-row"><span><b>Birthday fill</b><small>Passive metadata only. Off leaves blanks; Unknown stores Unknown; Random assigns one stable configured-calendar date. It never advances age.</small></span><select id="npc_state_v04_birthday_fill" class="text_pole"><option value="off">Off</option><option value="unknown">Unknown</option><option value="random">Random</option></select></label>
              <label class="npc-state-setting-row"><span><b>Birthday random calendar</b><small>One month/season per line as Name or Name:days. Fantasy names are preserved exactly.</small></span><textarea id="npc_state_v04_birthday_calendar" class="text_pole" rows="5"></textarea></label>
              <label class="npc-state-setting-row"><span><b>Fallback days per month</b><small>Used only for random-calendar lines without :days.</small></span><input id="npc_state_v04_birthday_days" class="text_pole npc-state-number" type="number" min="1" max="999"></label>
              <div class="npc-state-setting-row"><span><b>Fill existing blanks</b><small>Populate currently blank dossiers locally with the selected policy. No model call.</small></span><button id="npc_state_v04_birthday_fill_now" class="menu_button" type="button">Fill missing birthdays</button></div>
              <label class="npc-state-setting-row"><span><b>Inject in-chat NPCs</b><small>Injects individually relevant in-chat NPCs, not incidental background bodies.</small></span><input id="npc_state_v3_inject" type="checkbox"></label>
              <label class="npc-state-setting-row"><span><b>Injection budget</b><small>Approximate token budget.</small></span><input id="npc_state_v3_inject_budget" class="text_pole npc-state-number" type="number" min="256" max="8000" step="100"></label>
              <label class="npc-state-setting-row"><span><b>Show dossier diagnostics</b><small>Shows life-state rejection and relationship-scoring diagnostics in the Dossier Library. Off by default; hidden diagnostics stay recorded but are not rendered.</small></span><input id="npc_state_v3_show_diagnostics" type="checkbox"></label>
              <label class="npc-state-setting-row"><span><b>Rescan changed branches</b><small>Restores tracked swipes locally from checkpoints/payloads. Edited or untracked branches use the separate recovery scanner when needed.</small></span><input id="npc_state_v3_branch_rescan" type="checkbox"></label>
            </div>
            <details class="npc-state-v3-dossier-evolution"><summary><b>Dossier evolution</b></summary>
              <div class="npc-state-intro">Working caps for living dossier collections. The scanner may merge, rewrite, retire, reorder, or replace entries to keep the strongest current set. Lowering a cap does not immediately delete existing entries; it applies when that collection is next curated or manually saved.</div>
              <div class="npc-state-settings-grid">
                <label class="npc-state-setting-row"><span><b>Important memories</b><small>Durable events and facts retained for future scenes.</small></span><input id="npc_state_v3_limit_memories" class="text_pole npc-state-number" type="number" min="1" max="20"></label>
                <label class="npc-state-setting-row"><span><b>Key relationships</b><small>Important non-player relationships retained in the dossier.</small></span><input id="npc_state_v3_limit_key_relationships" class="text_pole npc-state-number" type="number" min="1" max="30"></label>
                <label class="npc-state-setting-row"><span><b>Mannerisms</b><small>Current recurring gestures, habits, and tells.</small></span><input id="npc_state_v3_limit_mannerisms" class="text_pole npc-state-number" type="number" min="1" max="16"></label>
                <label class="npc-state-setting-row"><span><b>Behavioral profile</b><small>Current durable behavioral tendencies and patterns.</small></span><input id="npc_state_v3_limit_behavior" class="text_pole npc-state-number" type="number" min="1" max="16"></label>
              </div>
            </details>
            <details><summary><b>Relationship criteria · additive</b></summary><div class="npc-state-intro">Shared relationship judgment, current-exchange evidence, and numeric mechanics always apply. Custom text here adds campaign-specific calibration without replacing those rules.</div><textarea id="npc_state_v3_relationship_criteria" class="text_pole npc-state-rubric-textarea" rows="8"></textarea></details>
            <details><summary><b>Important memory rubric</b></summary><textarea id="npc_state_v3_memory_criteria" class="text_pole npc-state-rubric-textarea" rows="7"></textarea></details>
            <div id="npc_state_v3_main_actions" class="npc-state-actions"><button id="npc_state_v3_scan_now" class="menu_button"><i class="fa-solid fa-wand-magic-sparkles"></i> Scan current cast</button><button id="npc_state_v3_library" class="menu_button"><i class="fa-solid fa-address-book"></i> Dossier Library</button><button id="npc_state_v3_add" class="menu_button"><i class="fa-solid fa-user-plus"></i> Add NPC</button></div>
            <div id="npc_state_v3_roster_summary" class="npc-state-roster-summary"></div>
          </div></div></div>`;
    }

    function syncScanConnectionProfile(panel, settings) {
        const select = panel.querySelector('#npc_state_v3_scan_profile');
        if (!select) return;
        const info = getScanConnectionProfiles();
        const selected = String(settings.scanConnectionProfileId || '');
        const rows = [{ id: '', name: 'Current connection' }, ...(info.profiles || [])];
        if (selected && !rows.some(row => row.id === selected)) rows.push({ id: selected, name: 'Unavailable profile · ' + selected });
        const signature = JSON.stringify(rows);
        if (select.dataset.profileSignature !== signature) {
            select.innerHTML = rows.map(row => '<option value="' + escapeHtml(row.id) + '">' + escapeHtml(row.name) + '</option>').join('');
            select.dataset.profileSignature = signature;
        }
        select.value = rows.some(row => row.id === selected) ? selected : '';
        select.title = info.available === false && info.error ? info.error : '';
    }

    function syncCompletenessStatus(panel) {
        const holder = panel.querySelector('#npc_state_v3_completeness_status');
        if (!holder) return;
        const status = getCompletenessStatus();
        if (status.status === 'pending') holder.textContent = ' Pending…';
        else if (status.status === 'running') holder.textContent = ' Running…';
        else if (status.status === 'failed') holder.textContent = ' Failed: ' + String(status.detail || 'request did not commit');
        else holder.textContent = '';
    }

    function syncSettings() {
        const settings = getSettings();
        const limits = normalizeDossierLimits(settings.dossierLimits);
        const panel = document.getElementById(SETTINGS_ID);
        if (!panel) return;
        panel.querySelector('#npc_state_v3_enabled').checked = settings.enabled !== false;
        panel.querySelector('#npc_state_v3_auto').checked = settings.autoScan !== false;
        panel.querySelector('#npc_state_v04_fallback').checked = settings.fallbackScan === true;
        panel.querySelector('#npc_state_v3_scan_depth').value = settings.scanDepth;
        panel.querySelector('#npc_state_v047_response_tokens').value = normalizeScannerResponseTokens(settings.scannerResponseTokens);
        panel.querySelector('#npc_state_v3_scan_after_response').checked = settings.scanAfterEachResponse === true;
        syncScanConnectionProfile(panel, settings);
        syncCompletenessStatus(panel);
        panel.querySelector('#npc_state_v04_new_npc_history').checked = settings.newNpcHistoryEnrichment !== false;
        panel.querySelector('#npc_state_v04_admission').value = settings.newNpcAdmissionMode || 'balanced';
        panel.querySelector('#npc_state_v04_birthday_fill').value = settings.birthdayFillMode || 'off';
        panel.querySelector('#npc_state_v04_birthday_calendar').value = settings.birthdayRandomCalendar || '';
        panel.querySelector('#npc_state_v04_birthday_days').value = settings.birthdayRandomDaysPerMonth || 30;
        panel.querySelector('#npc_state_v3_inject').checked = settings.inject !== false;
        panel.querySelector('#npc_state_v3_inject_budget').value = settings.injectBudgetTokens;
        panel.querySelector('#npc_state_v3_show_diagnostics').checked = settings.showDossierDiagnostics === true;
        panel.querySelector('#npc_state_v3_branch_rescan').checked = settings.branchRescan !== false;
        panel.querySelector('#npc_state_v3_limit_memories').value = limits.memories;
        panel.querySelector('#npc_state_v3_limit_key_relationships').value = limits.keyRelationships;
        panel.querySelector('#npc_state_v3_limit_mannerisms').value = limits.mannerisms;
        panel.querySelector('#npc_state_v3_limit_behavior').value = limits.behaviorProfile;
        panel.querySelector('#npc_state_v3_relationship_criteria').value = settings.relationshipCriteria || '';
        panel.querySelector('#npc_state_v3_memory_criteria').value = settings.memoryCriteria || '';
    }

    function bindSettings(panel) {
        const bindCheck = (selector, key) => panel.querySelector(selector)?.addEventListener('change', event => {
            getSettings()[key] = Boolean(event.target.checked); persistSettings(); onSettingsChanged();
        });
        const bindLimit = (selector, key) => panel.querySelector(selector)?.addEventListener('change', event => {
            const settings = getSettings();
            settings.dossierLimits = normalizeDossierLimits({ ...(settings.dossierLimits || {}), [key]: Number(event.target.value) });
            event.target.value = settings.dossierLimits[key];
            persistSettings();
        });
        bindCheck('#npc_state_v3_enabled', 'enabled');
        bindCheck('#npc_state_v3_auto', 'autoScan');
        bindCheck('#npc_state_v04_fallback', 'fallbackScan');
        bindCheck('#npc_state_v04_new_npc_history', 'newNpcHistoryEnrichment');
        panel.querySelector('#npc_state_v04_admission')?.addEventListener('change', event => {
            const value = String(event.target.value || 'balanced');
            getSettings().newNpcAdmissionMode = ['balanced', 'named_preferred', 'manual'].includes(value) ? value : 'balanced';
            event.target.value = getSettings().newNpcAdmissionMode;
            persistSettings(); onSettingsChanged();
        });
        panel.querySelector('#npc_state_v3_scan_profile')?.addEventListener('focus', () => syncScanConnectionProfile(panel, getSettings()));
        panel.querySelector('#npc_state_v3_scan_profile')?.addEventListener('change', event => {
            getSettings().scanConnectionProfileId = String(event.target.value || '').trim().slice(0, 240);
            persistSettings();
            syncScanConnectionProfile(panel, getSettings());
        });
        bindCheck('#npc_state_v3_scan_after_response', 'scanAfterEachResponse');
        panel.querySelector('#npc_state_v047_response_tokens')?.addEventListener('change', event => {
            getSettings().scannerResponseTokens = normalizeScannerResponseTokens(event.target.value);
            event.target.value = getSettings().scannerResponseTokens;
            persistSettings();
        });
        panel.querySelector('#npc_state_v04_birthday_fill')?.addEventListener('change', event => {
            const value = String(event.target.value || 'off');
            getSettings().birthdayFillMode = ['off', 'unknown', 'random'].includes(value) ? value : 'off';
            event.target.value = getSettings().birthdayFillMode;
            persistSettings(); onSettingsChanged();
        });
        panel.querySelector('#npc_state_v04_birthday_calendar')?.addEventListener('change', event => {
            getSettings().birthdayRandomCalendar = String(event.target.value || '').slice(0, 6000);
            event.target.value = getSettings().birthdayRandomCalendar;
            persistSettings();
        });
        panel.querySelector('#npc_state_v04_birthday_days')?.addEventListener('change', event => {
            getSettings().birthdayRandomDaysPerMonth = Math.max(1, Math.min(999, Math.round(Number(event.target.value) || 30)));
            event.target.value = getSettings().birthdayRandomDaysPerMonth;
            persistSettings();
        });
        panel.querySelector('#npc_state_v04_birthday_fill_now')?.addEventListener('click', async event => {
            event.currentTarget.disabled = true;
            const result = await safely('birthday fill', () => engine.fillMissingBirthdays());
            event.currentTarget.disabled = false;
            if (result.ok) {
                const filled = Number(result.result?.filled) || 0;
                notify('success', 'NPC State: filled ' + filled + ' missing birthday' + (filled === 1 ? '' : 's') + ' locally.');
            } else if (result.reason === 'fill-disabled') notify('info', 'NPC State: choose Unknown or Random birthday fill first.');
            refresh();
        });
        bindCheck('#npc_state_v3_inject', 'inject');
        panel.querySelector('#npc_state_v3_show_diagnostics')?.addEventListener('change', event => {
            getSettings().showDossierDiagnostics = Boolean(event.target.checked);
            persistSettings();
            renderLibrary({ detailOnly: true });
        });
        bindCheck('#npc_state_v3_branch_rescan', 'branchRescan');
        bindLimit('#npc_state_v3_limit_memories', 'memories');
        bindLimit('#npc_state_v3_limit_key_relationships', 'keyRelationships');
        bindLimit('#npc_state_v3_limit_mannerisms', 'mannerisms');
        bindLimit('#npc_state_v3_limit_behavior', 'behaviorProfile');
        panel.querySelector('#npc_state_v3_scan_depth')?.addEventListener('change', event => {
            getSettings().scanDepth = Math.max(2, Math.min(30, Math.round(Number(event.target.value) || 8))); event.target.value = getSettings().scanDepth; persistSettings();
        });
        panel.querySelector('#npc_state_v3_inject_budget')?.addEventListener('change', event => {
            getSettings().injectBudgetTokens = Math.max(256, Math.min(8000, Math.round(Number(event.target.value) || 1800))); event.target.value = getSettings().injectBudgetTokens; persistSettings(); onSettingsChanged();
        });
        for (const [selector, key] of [['#npc_state_v3_relationship_criteria', 'relationshipCriteria'], ['#npc_state_v3_memory_criteria', 'memoryCriteria']]) {
            panel.querySelector(selector)?.addEventListener('change', event => { getSettings()[key] = String(event.target.value || '').slice(0, 12000); persistSettings(); });
        }
        panel.querySelector('#npc_state_v3_scan_now')?.addEventListener('click', async () => {
            const id = latestAssistantMessageId(getContext().chat || []);
            if (id < 0) return notify('info', 'NPC State: there is no assistant message to scan yet.');
            const result = await safely('current-cast scan', () => engine.scan(id, { manual: true, force: true }));
            if (result.ok) notify('success', `NPC State: reconciled ${result.targetNpcIds?.length || 0} current-cast dossier${result.targetNpcIds?.length === 1 ? '' : 's'}.`);
            else if (!result.discarded && result.reason === 'branch-unsafe') notify('warning', 'NPC State: timeline rebase required. Open NPC State settings and choose Rebase to current chat.');
            else if (!result.discarded) notify('warning', `NPC State scan did not commit: ${result.reason || 'unknown reason'}.`);
            refresh();
        });
        panel.querySelector('#npc_state_v3_library')?.addEventListener('click', () => openLibrary());
        panel.querySelector('#npc_state_v3_add')?.addEventListener('click', async () => {
            const name = globalThis.prompt?.('NPC name or unique role label:')?.trim();
            if (!name) return;
            const result = await safely('add NPC', () => engine.addNpc(name));
            if (result.ok) { selectedNpcId = result.result?.npcId || ''; notify('success', `NPC State: ${result.result?.existing ? 'opened existing' : 'added'} ${name}.`); openLibrary(selectedNpcId); }
            refresh();
        });
    }

    function attachSettings() {
        if (document.getElementById(SETTINGS_ID)) return true;
        const host = document.querySelector('#extensions_settings2, #extensions_settings, #extensionsMenu');
        if (!host) return false;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = settingsHtml();
        const panel = wrapper.firstElementChild;
        host.appendChild(panel);
        bindSettings(panel);
        syncSettings();
        renderRoster();
        return true;
    }

    function scheduleMount() {
        if (attachSettings()) return;
        if (mountTimer) clearInterval(mountTimer);
        let attempts = 0;
        mountTimer = setInterval(() => {
            attempts += 1;
            if (attachSettings() || attempts >= 30) { clearInterval(mountTimer); mountTimer = null; }
        }, 500);
    }

    function renderRoster() {
        const holder = document.getElementById('npc_state_v3_roster_summary');
        if (!holder) return;
        const hydration = engine.hydrationStatus(getChatKey());
        if (hydration.status === 'error') {
            holder.innerHTML = `<div class="npc-state-hydration-warning"><b>Dossier load failed</b><span>${escapeHtml(hydration.error?.message || 'Unknown sidecar error. Existing data was not overwritten.')}</span></div>`;
            return;
        }
        const current = dossierIndex();
        if (!current) { holder.innerHTML = '<span class="npc-state-muted">Open a chat to load its NPC State dossier.</span>'; return; }
        const active = current.filter(npc => !npc.archived);
        const archived = current.filter(npc => npc.archived);
        const rows = list => list.map(npc => `<button class="menu_button npc-state-v3-roster-open" data-npc-id="${escapeHtml(npc.id)}">${npc.present ? '● ' : (npc.worldActive ? '◌ ' : '')}${escapeHtml(npc.name)}</button>`).join('');
        holder.innerHTML = `<small class="npc-state-muted">Persistent NPC State 0.4.42 database · ${active.length} active · ${archived.length} archived</small><div class="npc-state-roster-chips">${rows(active)}${rows(archived)}</div>`;
        holder.querySelectorAll('.npc-state-v3-roster-open').forEach(button => button.addEventListener('click', () => openLibrary(button.dataset.npcId)));
    }

    function filteredNpcs(rows = [], query = '') {
        return filterDossierNpcs(rows, query);
    }

    function libraryOverlay() { return document.getElementById(LIBRARY_ID); }

    function portraitSourceForUi(npc = {}) {
        const portrait = npc?.portrait && typeof npc.portrait === 'object' ? npc.portrait : {};
        return String(portrait.dataUrl || portrait.url || portrait.src || '').trim();
    }

    function disconnectCastPortraitObserver() {
        castPortraitObserver?.disconnect?.();
        castPortraitObserver = null;
    }

    function hydrateVisibleCastPortraits(overlay, rows = []) {
        disconnectCastPortraitObserver();
        const rail = overlay?.querySelector('.npc-state-v3-cast-rail');
        if (!rail) return;
        const cards = [...rail.querySelectorAll('.npc-state-v3-cast-card')];
        const load = card => {
            const image = card?.querySelector('.npc-state-v3-deferred-portrait');
            if (!image || image.getAttribute('src')) return;
            const src = engine.getNpcPortraitSource(String(card.dataset.npcId || ''), getChatKey());
            if (!src) return;
            image.src = src;
        };
        const selected = cards.find(card => card.dataset.npcId === selectedNpcId);
        if (selected) load(selected);
        if (typeof globalThis.IntersectionObserver !== 'function') {
            cards.forEach(load);
            return;
        }
        castPortraitObserver = new globalThis.IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                load(entry.target);
                castPortraitObserver?.unobserve?.(entry.target);
            }
        }, { root: rail, rootMargin: '0px 360px' });
        for (const card of cards) {
            if (card === selected || !card.querySelector('.npc-state-v3-deferred-portrait')) continue;
            castPortraitObserver.observe(card);
        }
    }

    function setSelectedCastCard(overlay, id) {
        const selected = String(id || '');
        const cards = overlay?.querySelectorAll('.npc-state-v3-cast-card') || [];
        for (const card of cards) {
            const active = String(card.dataset.npcId || '') === selected;
            card.classList.toggle('active', active);
            card.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    }

    function scheduleLibraryRailRender() {
        if (librarySearchFrame) return;
        const schedule = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0));
        librarySearchFrame = schedule(() => {
            librarySearchFrame = null;
            renderLibrary({ railOnly: true });
        });
    }

    function centerSelectedCastCard(overlay, behavior = 'smooth') {
        const rail = overlay?.querySelector('.npc-state-v3-cast-rail');
        if (!rail || !selectedNpcId) return false;
        const card = [...rail.querySelectorAll('.npc-state-v3-cast-card')].find(item => item.dataset.npcId === selectedNpcId);
        if (!card) return false;
        try { card.scrollIntoView({ behavior, block: 'nearest', inline: 'center' }); }
        catch { card.scrollIntoView(); }
        return true;
    }

    function renderLibrary({ centerSelected = false, railOnly = false, detailOnly = false } = {}) {
        const overlay = libraryOverlay();
        if (!overlay) return;
        const indexRows = dossierIndex() || [];
        const allRows = filteredNpcs(indexRows, '');
        selectedNpcId = chooseLibrarySelection(allRows, selectedNpcId);
        const search = overlay.querySelector('#npc_state_v3_library_search');
        const query = search?.value || '';
        const railRows = query.trim() ? filteredNpcs(allRows, query) : allRows;
        const oldNpcId = overlay.querySelector('.npc-state-v3-dossier')?.dataset.npcId || '';
        const oldScroll = overlay.querySelector('.npc-state-v3-dossier-document')?.scrollTop || 0;
        const npc = railOnly ? null : dossierNpc(selectedNpcId);

        const rail = overlay.querySelector('.npc-state-v3-cast-rail');
        if (!detailOnly) {
            if (rail) rail.innerHTML = castRailHtml(railRows, selectedNpcId);
            hydrateVisibleCastPortraits(overlay, railRows);
        }

        const detail = overlay.querySelector('.npc-state-v3-library-detail');
        if (!railOnly) {
            const showDiagnostics = getSettings().showDossierDiagnostics === true;
            if (detail) detail.innerHTML = dossierHtml(npc, { showDiagnostics });
            wireDossierActions(detail);
            const title = overlay.querySelector('.npc-state-v3-library-head-name');
            if (title) title.textContent = npc?.name || 'No dossier selected';
        }
        const count = overlay.querySelector('.npc-state-v3-cast-count');
        if (count) count.textContent = query.trim() ? `${railRows.length} of ${allRows.length} NPCs` : `${allRows.length} NPC${allRows.length === 1 ? '' : 's'}`;

        const documentPane = !railOnly ? detail?.querySelector('.npc-state-v3-dossier-document') : null;
        if (documentPane && npc?.id === oldNpcId && !centerSelected) documentPane.scrollTop = oldScroll;

        if (centerSelected) {
            const schedule = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0));
            schedule(() => centerSelectedCastCard(overlay));
        }
    }

    function scrollCastRail(direction) {
        const rail = libraryOverlay()?.querySelector('.npc-state-v3-cast-rail');
        if (!rail) return;
        const distance = Math.max(220, Math.round((rail.clientWidth || 320) * 0.72)) * direction;
        if (typeof rail.scrollBy === 'function') rail.scrollBy({ left: distance, behavior: 'smooth' });
        else rail.scrollLeft += distance;
    }

    function openLibrary(npcId = '') {
        let overlay = libraryOverlay();
        if (npcId) {
            selectedNpcId = String(npcId);
            const search = overlay?.querySelector('#npc_state_v3_library_search');
            if (search) search.value = '';
        }
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = LIBRARY_ID;
            overlay.className = 'npc-state-v3-library-overlay';
            overlay.innerHTML = `<div class="npc-state-v3-library-shell" role="dialog" aria-modal="true" aria-label="NPC dossier" tabindex="-1">
              <header class="npc-state-v3-library-header"><div><span class="npc-state-kicker">NPC DOSSIER</span><small class="npc-state-v3-library-head-name"></small></div><button class="npc-state-v3-library-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></header>
              <main class="npc-state-v3-library-detail"></main>
              <footer class="npc-state-v3-cast-dock">
                <div class="npc-state-v3-cast-dock-head"><div><span class="npc-state-kicker">DOSSIER LIBRARY</span><small class="npc-state-v3-cast-count"></small></div><label class="npc-state-v3-cast-search"><i class="fa-solid fa-magnifying-glass"></i><input id="npc_state_v3_library_search" class="text_pole" type="search" placeholder="Search name, alias, role, species, state" aria-label="Search dossier library"></label></div>
                <div class="npc-state-v3-cast-rail-shell"><button type="button" class="npc-state-v3-cast-arrow npc-state-v3-cast-prev" aria-label="Previous dossiers"><i class="fa-solid fa-chevron-left"></i></button><div class="npc-state-v3-cast-rail" role="list"></div><button type="button" class="npc-state-v3-cast-arrow npc-state-v3-cast-next" aria-label="Next dossiers"><i class="fa-solid fa-chevron-right"></i></button></div>
              </footer>
            </div>`;
            overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest?.('.npc-state-v3-library-close')) closeLibrary(); });
            document.body.appendChild(overlay);
            document.documentElement?.classList.add('npc-state-v3-library-open');
            document.body?.classList.add('npc-state-v3-library-open');
            overlay.querySelector('#npc_state_v3_library_search')?.addEventListener('input', scheduleLibraryRailRender);
            overlay.querySelector('.npc-state-v3-cast-rail')?.addEventListener('click', event => {
                const button = event.target.closest?.('.npc-state-v3-cast-card');
                if (!button) return;
                selectedNpcId = String(button.dataset.npcId || '');
                setSelectedCastCard(overlay, selectedNpcId);
                renderLibrary({ centerSelected: true, detailOnly: true });
            });
            overlay.querySelector('.npc-state-v3-cast-prev')?.addEventListener('click', () => scrollCastRail(-1));
            overlay.querySelector('.npc-state-v3-cast-next')?.addEventListener('click', () => scrollCastRail(1));
            const shell = overlay.querySelector('.npc-state-v3-library-shell');
            shell?.addEventListener('keydown', event => { if (event.key === 'Escape') closeLibrary(); });
            try { shell?.focus({ preventScroll: true }); } catch { shell?.focus?.(); }
        }
        renderLibrary({ centerSelected: true });
        return true;
    }

    function closeLibrary() {
        disconnectCastPortraitObserver();
        libraryOverlay()?.remove();
        document.documentElement?.classList.remove('npc-state-v3-library-open');
        document.body?.classList.remove('npc-state-v3-library-open');
        closeEditor();
    }

    function wireDossierActions(root) {
        if (!root) return;
        root.querySelector('.npc-state-v3-edit')?.addEventListener('click', event => openEditor(event.currentTarget.dataset.npcId));
        root.querySelector('.npc-state-v3-toggle-diagnostics')?.addEventListener('click', () => {
            const settings = getSettings();
            settings.showDossierDiagnostics = settings.showDossierDiagnostics !== true;
            persistSettings();
            syncSettings();
            renderLibrary({ detailOnly: true });
        });
        root.querySelector('.npc-state-v3-refresh')?.addEventListener('click', async event => {
            const id = event.currentTarget.dataset.npcId;
            event.currentTarget.disabled = true;
            const result = await safely('dossier scan', () => engine.refreshDossier(id));
            event.currentTarget.disabled = false;
            notify(result.ok ? 'success' : 'warning', result.ok ? 'NPC State: dossier reconciled from recent chat without replaying relationship deltas.' : (result.reason === 'branch-unsafe' ? 'NPC State: timeline rebase required. Open NPC State settings and choose Rebase to current chat.' : `NPC State: dossier scan did not commit (${result.reason || 'unknown'}).`));
            refresh();
        });
        root.querySelector('.npc-state-v3-import-structured')?.addEventListener('click', async event => {
            const id = event.currentTarget.dataset.npcId;
            event.currentTarget.disabled = true;
            const result = await safely('structured dossier import', () => engine.importStructuredDossier(id));
            event.currentTarget.disabled = false;
            if (result.ok) notify('success', `NPC State: imported ${result.sourceCount || 0} matching New_NPC / NPC_Update source block${result.sourceCount === 1 ? '' : 's'} into durable dossier fields.`);
            else if (result.reason === 'no-structured-source') notify('info', 'NPC State: no matching Megumin New_NPC / NPC_Update source was found for this dossier. Nothing was changed.');
            else notify('warning', `NPC State: structured dossier import did not commit (${result.reason || 'unknown'}).`);
            refresh();
        });
        root.querySelector('.npc-state-v3-archive')?.addEventListener('click', async event => {
            const id = event.currentTarget.dataset.npcId;
            const npc = dossierNpc(id);
            if (!npc) return;
            await safely(npc.archived ? 'restore dossier' : 'archive dossier', () => engine.archiveNpc(id, !npc.archived));
            refresh();
        });
        root.querySelector('.npc-state-v3-delete')?.addEventListener('click', async event => {
            const id = event.currentTarget.dataset.npcId;
            const npc = dossierNpc(id);
            if (!npc || !globalThis.confirm?.(`Delete ${npc.name}? Older v0.3 branch checkpoints will not be allowed to restore this identity.`)) return;
            const deleted = await safely('delete dossier', () => engine.deleteNpc(id));
            if (!deleted.ok) return;
            if (selectedNpcId === id) selectedNpcId = '';
            refresh();
        });
    }

    function editorHtml(npc) {
        const rel = npc.relationship || {};
        const field = (label, id, value, wide = false) => `<label class="${wide ? 'npc-state-v3-editor-wide' : ''}">${label}<input id="${id}" class="text_pole" value="${escapeHtml(value || '')}"></label>`;
        const lifeStateSelect = value => {
            const selected = String(value || 'unknown').trim().toLocaleLowerCase();
            return `<label>Life state<select id="npc_state_v3_edit_life_state" class="text_pole"><option value="alive" ${selected === 'alive' ? 'selected' : ''}>Alive</option><option value="dead" ${selected === 'dead' ? 'selected' : ''}>Dead</option><option value="unknown" ${selected === 'unknown' ? 'selected' : ''}>Unknown</option></select></label>`;
        };
        return `<div class="npc-state-v3-editor-shell" data-npc-id="${escapeHtml(npc.id)}" data-updated-at="${Number(npc.updatedAt) || 0}"><header><div><span class="npc-state-kicker">EDIT DOSSIER</span><h2>${escapeHtml(npc.name)}</h2></div><button class="npc-state-v3-editor-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></header><div class="npc-state-v3-editor-grid">
          ${field('Name', 'npc_state_v3_edit_name', npc.name)}${field('Role', 'npc_state_v3_edit_role', npc.role)}${field('Species / race', 'npc_state_v3_edit_species', npc.species)}${field('Age', 'npc_state_v3_edit_age', npc.age)}${field('Apparent age', 'npc_state_v3_edit_apparent_age', npc.apparentAge)}${field('Birthday', 'npc_state_v3_edit_birthday', npc.birthday)}
          <label class="npc-state-v3-editor-wide">Personality<textarea id="npc_state_v3_edit_personality" class="text_pole" rows="3">${escapeHtml(npc.personality)}</textarea></label><label class="npc-state-v3-editor-wide">Behavioral profile · one per line<textarea id="npc_state_v3_edit_behavior" class="text_pole" rows="5">${escapeHtml((npc.behaviorProfile || []).join('\n'))}</textarea></label><label class="npc-state-v3-editor-wide">Speech<textarea id="npc_state_v3_edit_speech" class="text_pole" rows="3">${escapeHtml(npc.speech)}</textarea></label><label class="npc-state-v3-editor-wide">Appearance · shared/common or ordinary single form<textarea id="npc_state_v3_edit_appearance" class="text_pole" rows="5">${escapeHtml(npc.appearance)}</textarea></label>${field('Current physical form', 'npc_state_v3_edit_current_form', npc.currentForm)}<label class="npc-state-v3-editor-wide">Appearance forms · one per line as Form | description<textarea id="npc_state_v3_edit_appearance_forms" class="text_pole" rows="6">${escapeHtml(appearanceFormsEditorText(npc))}</textarea></label><label class="npc-state-v3-editor-wide">Background<textarea id="npc_state_v3_edit_background" class="text_pole" rows="4">${escapeHtml(npc.background)}</textarea></label><label class="npc-state-v3-editor-wide">Mannerisms · one per line<textarea id="npc_state_v3_edit_mannerisms" class="text_pole" rows="4">${escapeHtml((npc.mannerisms || []).join('\n'))}</textarea></label><label class="npc-state-v3-editor-wide">Key relationships · one per line<textarea id="npc_state_v3_edit_key_relationships" class="text_pole" rows="4">${escapeHtml((npc.keyRelationships || []).join('\n'))}</textarea></label>
          ${field('Mood', 'npc_state_v3_edit_mood', npc.mood)}${field('Location', 'npc_state_v3_edit_location', npc.location)}${field('Goal', 'npc_state_v3_edit_goal', npc.goal)}${field('Activity / condition', 'npc_state_v3_edit_status', npc.status)}${lifeStateSelect(npc.lifeState)}<label class="npc-state-v3-editor-wide">Life-state note<textarea id="npc_state_v3_edit_life_state_reason" class="text_pole" rows="2">${escapeHtml(npc.lifeStateReason || '')}</textarea><small>Manual Life state changes are authoritative. Dead archives as deceased; changing a deceased dossier to Alive or Unknown recovers it.</small></label><label class="npc-state-v3-editor-wide">Relationship summary<textarea id="npc_state_v3_edit_relationship_summary" class="text_pole" rows="3">${escapeHtml(npc.relationshipSummary)}</textarea></label><label class="npc-state-v3-editor-wide">Important memories · one per line<textarea id="npc_state_v3_edit_memories" class="text_pole" rows="5">${escapeHtml((npc.memories || []).join('\n'))}</textarea></label>
          ${field('Trust', 'npc_state_v3_edit_trust', rel.trust)}${field('Affection', 'npc_state_v3_edit_affection', rel.affection)}${field('Desire', 'npc_state_v3_edit_desire', rel.desire)}${field('Tension', 'npc_state_v3_edit_tension', rel.tension)}
          <label class="npc-state-v3-editor-wide"><input id="npc_state_v3_edit_lock" type="checkbox" ${npc.manualProfileFields?.length ? 'checked' : ''}> Protect stable profile fields from scanner rewrites</label><label class="npc-state-v3-editor-wide"><input id="npc_state_v3_edit_retention" type="checkbox" ${npc.retentionProtected ? 'checked' : ''}> Retention protected</label><label class="npc-state-v3-editor-wide"><input id="npc_state_v3_edit_minor" type="checkbox" ${npc.minor ? 'checked' : ''}> Minor NPC</label>
        </div><footer><button class="menu_button npc-state-v3-editor-cancel">Cancel</button><button class="menu_button npc-state-v3-editor-save"><i class="fa-solid fa-floppy-disk"></i> Save dossier</button></footer></div>`;
    }

    function openEditor(id) {
        const npc = dossierNpc(id);
        if (!npc) return false;
        closeEditor();
        activeEditorNpcId = npc.id;
        const overlay = document.createElement('div');
        overlay.id = EDITOR_ID;
        overlay.className = 'npc-state-v3-editor-overlay';
        overlay.innerHTML = editorHtml(npc);
        overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest?.('.npc-state-v3-editor-close, .npc-state-v3-editor-cancel')) closeEditor(); });
        overlay.querySelector('.npc-state-v3-editor-save')?.addEventListener('click', saveEditor);
        document.body.appendChild(overlay);
        return true;
    }

    function closeEditor() { document.getElementById(EDITOR_ID)?.remove(); activeEditorNpcId = ''; }

    async function saveEditor() {
        const overlay = document.getElementById(EDITOR_ID);
        const shell = overlay?.querySelector('.npc-state-v3-editor-shell');
        const id = String(shell?.dataset.npcId || '');
        if (!overlay || !editorIdentityMatches(activeEditorNpcId, id)) {
            notify('error', 'NPC State: editor identity mismatch. No dossier was saved.');
            return false;
        }
        const value = fieldId => overlay.querySelector(`#${fieldId}`)?.value ?? '';
        const clamp = fieldId => Math.max(-100, Math.min(100, Math.round(Number(value(fieldId)) || 0)));
        const limits = normalizeDossierLimits(getSettings().dossierLimits);
        const stableFields = ['name', 'role', 'species', 'age', 'apparentAge', 'birthday', 'personality', 'behaviorProfile', 'speech', 'appearance', 'appearanceForms', 'background', 'mannerisms', 'keyRelationships'];
        const patch = {
            name: value('npc_state_v3_edit_name').trim(), role: value('npc_state_v3_edit_role'), species: value('npc_state_v3_edit_species'), age: value('npc_state_v3_edit_age'), apparentAge: value('npc_state_v3_edit_apparent_age'), birthday: value('npc_state_v3_edit_birthday').trim(), birthdayProvenance: 'manual',
            personality: value('npc_state_v3_edit_personality'), behaviorProfile: splitLines(value('npc_state_v3_edit_behavior'), limits.behaviorProfile), speech: value('npc_state_v3_edit_speech'), appearance: value('npc_state_v3_edit_appearance'), currentForm: value('npc_state_v3_edit_current_form').trim(), appearanceForms: parseAppearanceForms(value('npc_state_v3_edit_appearance_forms')), background: value('npc_state_v3_edit_background'), mannerisms: splitLines(value('npc_state_v3_edit_mannerisms'), limits.mannerisms), keyRelationships: splitLines(value('npc_state_v3_edit_key_relationships'), limits.keyRelationships),
            mood: value('npc_state_v3_edit_mood'), location: value('npc_state_v3_edit_location'), goal: value('npc_state_v3_edit_goal'), status: value('npc_state_v3_edit_status'), lifeState: value('npc_state_v3_edit_life_state'), lifeStateReason: value('npc_state_v3_edit_life_state_reason').trim(), relationshipSummary: value('npc_state_v3_edit_relationship_summary'), memories: splitLines(value('npc_state_v3_edit_memories'), limits.memories),
            relationship: { trust: clamp('npc_state_v3_edit_trust'), affection: clamp('npc_state_v3_edit_affection'), desire: clamp('npc_state_v3_edit_desire'), tension: clamp('npc_state_v3_edit_tension') },
            manualProfileFields: overlay.querySelector('#npc_state_v3_edit_lock')?.checked ? stableFields : [], retentionProtected: Boolean(overlay.querySelector('#npc_state_v3_edit_retention')?.checked), minor: Boolean(overlay.querySelector('#npc_state_v3_edit_minor')?.checked),
        };
        const result = await safely('save dossier', () => engine.updateNpc(id, patch, { expectedUpdatedAt: Number(shell.dataset.updatedAt) || 0 }));
        if (!result.ok) {
            notify('warning', result.reason === 'stale-editor'
                ? 'NPC State: this dossier changed while the editor was open. Reopen it before saving so newer scan data is not overwritten.'
                : 'NPC State: dossier edit was rejected, usually because the name collides with another dossier.');
            return false;
        }
        selectedNpcId = id;
        closeEditor();
        notify('success', 'NPC State: dossier saved.');
        refresh();
        return true;
    }

    function renderInline() {
        const existing = document.getElementById(INLINE_ID);
        const current = dossierIndex();
        if (!current) { existing?.remove(); return; }
        const present = current.filter(npc => npc.present && !npc.archived && !npc.minor);
        if (!present.length) { existing?.remove(); return; }
        const messageId = latestAssistantMessageId(getContext().chat || []);
        const message = messageElement(messageId);
        if (!message) { existing?.remove(); return; }
        const target = message.querySelector?.('.mes_text') || message;
        const signature = inlineRosterSignature(present, messageId);
        // MESSAGE_UPDATED fires frequently for unrelated rendering work. Reuse the strip and decoded images when its observable content did not change.
        if (existing?.dataset.signature === signature && existing.parentElement === target) return;
        existing?.remove();
        const holder = document.createElement('section');
        holder.id = INLINE_ID;
        holder.className = 'npc-state-present-roster npc-state-v3-inline';
        holder.dataset.signature = signature;
        holder.innerHTML = `<div class="npc-state-present-roster-head"><span class="npc-state-kicker">IN-CHAT NPCS</span><small>${present.length} shown</small></div><div class="npc-state-present-grid">${present.map(npc => { const portrait = engine.getNpcPortraitSource(npc.id, getChatKey()); return `<button type="button" class="npc-state-present-card npc-state-v3-inline-card" data-npc-id="${escapeHtml(npc.id)}"><span class="npc-state-present-card-portrait">${portrait ? `<img src="${escapeHtml(portrait)}" alt="" loading="lazy" decoding="async">` : `<div class="npc-state-present-card-placeholder">${escapeHtml(String(npc.name || '?').charAt(0))}</div>`}</span><span class="npc-state-present-card-overlay"><b>${escapeHtml(npc.name)}</b><small>${escapeHtml(presentNpcAgeLabel(npc))}</small></span></button>`; }).join('')}</div>`;
        holder.querySelectorAll('.npc-state-v3-inline-card').forEach(button => button.addEventListener('click', () => openLibrary(button.dataset.npcId)));
        target.appendChild(holder);
    }

    function refresh() {
        scheduleMount();
        syncSettings();
        renderRoster();
        renderInline();
        if (libraryOverlay()) renderLibrary();
    }

    return Object.freeze({ scheduleMount, refresh, renderInline, openLibrary, closeLibrary, openEditor, closeEditor, get activeEditorNpcId() { return activeEditorNpcId; } });
}
