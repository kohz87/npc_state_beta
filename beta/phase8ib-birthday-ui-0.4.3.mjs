import fs from 'node:fs';

const path = 'v03/ui.js';
let source = fs.readFileSync(path, 'utf8');
function rep(from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase 8IB UI marker: ' + label);
    source = source.replace(from, to);
}

rep(
`              <label class="npc-state-setting-row"><span><b>New NPC admission</b><small>Balanced keeps current behavior. Named preferred ignores first-seen unnamed role labels. Manual prevents scanner-created dossiers while existing NPCs still update.</small></span><select id="npc_state_v04_admission" class="text_pole"><option value="balanced">Balanced</option><option value="named_preferred">Named preferred</option><option value="manual">Manual</option></select></label>
              <label class="npc-state-setting-row"><span><b>Inject in-chat NPCs</b>`,
`              <label class="npc-state-setting-row"><span><b>New NPC admission</b><small>Balanced keeps current behavior. Named preferred ignores first-seen unnamed role labels. Manual prevents scanner-created dossiers while existing NPCs still update.</small></span><select id="npc_state_v04_admission" class="text_pole"><option value="balanced">Balanced</option><option value="named_preferred">Named preferred</option><option value="manual">Manual</option></select></label>
              <label class="npc-state-setting-row"><span><b>Birthday fill</b><small>Passive metadata only. Off leaves blanks; Unknown stores Unknown; Random assigns one stable configured-calendar date. It never advances age.</small></span><select id="npc_state_v04_birthday_fill" class="text_pole"><option value="off">Off</option><option value="unknown">Unknown</option><option value="random">Random</option></select></label>
              <label class="npc-state-setting-row"><span><b>Birthday random calendar</b><small>One month/season per line as Name or Name:days. Fantasy names are preserved exactly.</small></span><textarea id="npc_state_v04_birthday_calendar" class="text_pole" rows="5"></textarea></label>
              <label class="npc-state-setting-row"><span><b>Fallback days per month</b><small>Used only for random-calendar lines without :days.</small></span><input id="npc_state_v04_birthday_days" class="text_pole npc-state-number" type="number" min="1" max="999"></label>
              <div class="npc-state-setting-row"><span><b>Fill existing blanks</b><small>Populate currently blank dossiers locally with the selected policy. No model call.</small></span><button id="npc_state_v04_birthday_fill_now" class="menu_button" type="button">Fill missing birthdays</button></div>
              <label class="npc-state-setting-row"><span><b>Inject in-chat NPCs</b>`,
'settings controls');
rep(
`        panel.querySelector('#npc_state_v04_admission').value = settings.newNpcAdmissionMode || 'balanced';
        panel.querySelector('#npc_state_v3_inject').checked = settings.inject !== false;`,
`        panel.querySelector('#npc_state_v04_admission').value = settings.newNpcAdmissionMode || 'balanced';
        panel.querySelector('#npc_state_v04_birthday_fill').value = settings.birthdayFillMode || 'off';
        panel.querySelector('#npc_state_v04_birthday_calendar').value = settings.birthdayRandomCalendar || '';
        panel.querySelector('#npc_state_v04_birthday_days').value = settings.birthdayRandomDaysPerMonth || 30;
        panel.querySelector('#npc_state_v3_inject').checked = settings.inject !== false;`,
'settings sync');
rep(
`        panel.querySelector('#npc_state_v04_admission')?.addEventListener('change', event => {
            const value = String(event.target.value || 'balanced');
            getSettings().newNpcAdmissionMode = ['balanced', 'named_preferred', 'manual'].includes(value) ? value : 'balanced';
            event.target.value = getSettings().newNpcAdmissionMode;
            persistSettings(); onSettingsChanged();
        });
        bindCheck('#npc_state_v3_inject', 'inject');`,
`        panel.querySelector('#npc_state_v04_admission')?.addEventListener('change', event => {
            const value = String(event.target.value || 'balanced');
            getSettings().newNpcAdmissionMode = ['balanced', 'named_preferred', 'manual'].includes(value) ? value : 'balanced';
            event.target.value = getSettings().newNpcAdmissionMode;
            persistSettings(); onSettingsChanged();
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
        bindCheck('#npc_state_v3_inject', 'inject');`,
'settings bindings');
rep(
"${field('Apparent age', 'npc_state_v3_edit_apparent_age', npc.apparentAge)}\n          <label class=\"npc-state-v3-editor-wide\">Personality",
"${field('Apparent age', 'npc_state_v3_edit_apparent_age', npc.apparentAge)}${field('Birthday', 'npc_state_v3_edit_birthday', npc.birthday)}\n          <label class=\"npc-state-v3-editor-wide\">Personality",
'editor birthday field');
rep(
`        const stableFields = ['name', 'role', 'species', 'age', 'apparentAge', 'personality',`,
`        const stableFields = ['name', 'role', 'species', 'age', 'apparentAge', 'birthday', 'personality',`,
'editor lock list');
rep(
`            name: value('npc_state_v3_edit_name').trim(), role: value('npc_state_v3_edit_role'), species: value('npc_state_v3_edit_species'), age: value('npc_state_v3_edit_age'), apparentAge: value('npc_state_v3_edit_apparent_age'),
            personality:`,
`            name: value('npc_state_v3_edit_name').trim(), role: value('npc_state_v3_edit_role'), species: value('npc_state_v3_edit_species'), age: value('npc_state_v3_edit_age'), apparentAge: value('npc_state_v3_edit_apparent_age'), birthday: value('npc_state_v3_edit_birthday').trim(), birthdayProvenance: 'manual',
            personality:`,
'editor save');

fs.writeFileSync(path, source);
console.log('Added NPC State 0.4.3 birthday settings and dossier editor UI');
