import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function patch(path, edits) {
    let source = read(path);
    for (const [from, to, label] of edits) {
        if (!source.includes(from)) throw new Error(`Missing phase 8I marker in ${path}: ${label}`);
        source = source.replace(from, to);
    }
    write(path, source);
}

patch('v03/index.js', [[
`import { DEFAULT_RELATIONSHIP_CAPS, DOSSIER_LIMIT_DEFAULTS, NPC_STATE_VERSION, normalizeDossierLimits, normalizeNpcAdmissionMode } from './schema.js';`,
`import { DEFAULT_BIRTHDAY_RANDOM_CALENDAR, DEFAULT_RELATIONSHIP_CAPS, DOSSIER_LIMIT_DEFAULTS, NPC_STATE_VERSION, normalizeBirthdayFillMode, normalizeDossierLimits, normalizeNpcAdmissionMode } from './schema.js';`,
'index schema imports'],[
`    newNpcHistoryEnrichment: true,
    newNpcAdmissionMode: 'balanced',
    staleManagementEnabled: true,`,
`    newNpcHistoryEnrichment: true,
    newNpcAdmissionMode: 'balanced',
    birthdayFillMode: 'off',
    birthdayRandomCalendar: DEFAULT_BIRTHDAY_RANDOM_CALENDAR,
    birthdayRandomDaysPerMonth: 30,
    staleManagementEnabled: true,`,
'birthday defaults'],[
`    settings.newNpcAdmissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);
    settings.injectDepth =`,
`    settings.newNpcAdmissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);
    settings.birthdayFillMode = normalizeBirthdayFillMode(settings.birthdayFillMode);
    settings.birthdayRandomCalendar = String(settings.birthdayRandomCalendar ?? DEFAULT_BIRTHDAY_RANDOM_CALENDAR).slice(0, 6000);
    settings.birthdayRandomDaysPerMonth = Math.max(1, Math.min(999, Math.round(Number(settings.birthdayRandomDaysPerMonth) || 30)));
    settings.injectDepth =`,
'birthday setting normalization']]);

patch('v03/injection.js', [[
`        field('Species', npc.species), field('Actual age', npc.age), field('Apparent age', npc.apparentAge),
        field('Current form', npc.currentForm),`,
`        field('Species', npc.species), field('Actual age', npc.age), field('Apparent age', npc.apparentAge),
        field('Birthday', npc.birthday ? npc.birthday + (npc.birthdayProvenance === 'generated' ? ' [generated placeholder]' : '') : ''),
        field('Current form', npc.currentForm),`,
'birthday continuity line'],[
`        'ageChange is the only channel allowed to revise an established chronological age. Use {age, kind: birthday|elapsed|correction, evidence}. birthday requires explicit birthday/turned-N evidence; elapsed requires explicit passage of time AND narration stating the resulting age; correction requires an explicit correction/mistake statement. Evidence must state the new numeric age. Casual contradictory age prose, appearance guesses, and unstated arithmetic must leave ageChange empty.',`,
`        'ageChange is the only channel allowed to revise an established chronological age. Use {age, kind: birthday|elapsed|correction, evidence}. birthday requires explicit birthday/turned-N evidence; elapsed requires explicit passage of time AND narration stating the resulting age; correction requires an explicit correction/mistake statement. Evidence must state the new numeric age. Casual contradictory age prose, appearance guesses, and unstated arithmetic must leave ageChange empty.',
        'birthday is separate passive continuity metadata. Preserve compact freeform calendar text exactly, including fantasy calendars such as 14 Frostwane. Never infer birthday from age, calculate age from birthday, or treat a stored/generated birthday as proof that a birthday happened now. For an established explicit/manual birthday, use canonChanges field birthday mode correction only when the current exchange explicitly corrects it. A [generated placeholder] may be replaced when the current exchange explicitly establishes the real birthday.',`,
'foreground birthday rules']]);

patch('v03/dossier-view.js', [[
`        npc.age ? \`Actual age \${npc.age}\` : '',
        npc.apparentAge ? \`Looks \${npc.apparentAge}\` : '',`,
`        npc.age ? \`Actual age \${npc.age}\` : '',
        npc.apparentAge ? \`Looks \${npc.apparentAge}\` : '',
        npc.birthday ? \`Birthday \${npc.birthday}\${npc.birthdayProvenance === 'generated' ? ' · generated placeholder' : ''}\` : '',`,
'dossier birthday identity']]);

patch('v03/ui.js', [[
`              <label class="npc-state-setting-row"><span><b>New NPC admission</b><small>Balanced keeps current behavior. Named preferred ignores first-seen unnamed role labels. Manual prevents scanner-created dossiers while existing NPCs still update.</small></span><select id="npc_state_v04_admission" class="text_pole"><option value="balanced">Balanced</option><option value="named_preferred">Named preferred</option><option value="manual">Manual</option></select></label>
              <label class="npc-state-setting-row"><span><b>Inject in-chat NPCs</b>`,
`              <label class="npc-state-setting-row"><span><b>New NPC admission</b><small>Balanced keeps current behavior. Named preferred ignores first-seen unnamed role labels. Manual prevents scanner-created dossiers while existing NPCs still update.</small></span><select id="npc_state_v04_admission" class="text_pole"><option value="balanced">Balanced</option><option value="named_preferred">Named preferred</option><option value="manual">Manual</option></select></label>
              <label class="npc-state-setting-row"><span><b>Birthday fill</b><small>Optional passive metadata only. Off leaves unknown birthdays blank; Unknown stores Unknown; Random assigns one stable date from the configured calendar. It never advances age.</small></span><select id="npc_state_v04_birthday_fill" class="text_pole"><option value="off">Off</option><option value="unknown">Unknown</option><option value="random">Random</option></select></label>
              <label class="npc-state-setting-row npc-state-v3-editor-wide"><span><b>Birthday random calendar</b><small>One month/season per line as Name or Name:days. Fantasy names are preserved exactly.</small></span><textarea id="npc_state_v04_birthday_calendar" class="text_pole" rows="5"></textarea></label>
              <label class="npc-state-setting-row"><span><b>Fallback days per month</b><small>Used only for random-calendar lines without an explicit :days value.</small></span><input id="npc_state_v04_birthday_days" class="text_pole npc-state-number" type="number" min="1" max="999"></label>
              <div class="npc-state-setting-row"><span><b>Fill existing blanks</b><small>Locally fills currently blank dossiers using the selected Birthday fill policy. No model call.</small></span><button id="npc_state_v04_birthday_fill_now" class="menu_button" type="button">Fill missing birthdays</button></div>
              <label class="npc-state-setting-row"><span><b>Inject in-chat NPCs</b>`,
'birthday settings controls'],[
`        panel.querySelector('#npc_state_v04_admission').value = settings.newNpcAdmissionMode || 'balanced';
        panel.querySelector('#npc_state_v3_inject').checked = settings.inject !== false;`,
`        panel.querySelector('#npc_state_v04_admission').value = settings.newNpcAdmissionMode || 'balanced';
        panel.querySelector('#npc_state_v04_birthday_fill').value = settings.birthdayFillMode || 'off';
        panel.querySelector('#npc_state_v04_birthday_calendar').value = settings.birthdayRandomCalendar || '';
        panel.querySelector('#npc_state_v04_birthday_days').value = settings.birthdayRandomDaysPerMonth || 30;
        panel.querySelector('#npc_state_v3_inject').checked = settings.inject !== false;`,
'birthday settings sync'],[
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
            if (result.ok) notify('success', `NPC State: filled ${result.result?.filled || 0} missing birthday${result.result?.filled === 1 ? '' : 's'} locally.`);
            else if (result.reason === 'fill-disabled') notify('info', 'NPC State: choose Unknown or Random birthday fill first.');
            refresh();
        });
        bindCheck('#npc_state_v3_inject', 'inject');`,
'birthday settings bindings'],[
`          ${field('Name', 'npc_state_v3_edit_name', npc.name)}${field('Role', 'npc_state_v3_edit_role', npc.role)}${field('Species / race', 'npc_state_v3_edit_species', npc.species)}${field('Age', 'npc_state_v3_edit_age', npc.age)}${field('Apparent age', 'npc_state_v3_edit_apparent_age', npc.apparentAge)}`,
`          ${field('Name', 'npc_state_v3_edit_name', npc.name)}${field('Role', 'npc_state_v3_edit_role', npc.role)}${field('Species / race', 'npc_state_v3_edit_species', npc.species)}${field('Age', 'npc_state_v3_edit_age', npc.age)}${field('Apparent age', 'npc_state_v3_edit_apparent_age', npc.apparentAge)}${field('Birthday', 'npc_state_v3_edit_birthday', npc.birthday)}`,
'editor birthday field'],[
`        const stableFields = ['name', 'role', 'species', 'age', 'apparentAge', 'personality',`,
`        const stableFields = ['name', 'role', 'species', 'age', 'apparentAge', 'birthday', 'personality',`,
'editor birthday lock'],[
`            name: value('npc_state_v3_edit_name').trim(), role: value('npc_state_v3_edit_role'), species: value('npc_state_v3_edit_species'), age: value('npc_state_v3_edit_age'), apparentAge: value('npc_state_v3_edit_apparent_age'),
            personality:`,
`            name: value('npc_state_v3_edit_name').trim(), role: value('npc_state_v3_edit_role'), species: value('npc_state_v3_edit_species'), age: value('npc_state_v3_edit_age'), apparentAge: value('npc_state_v3_edit_apparent_age'), birthday: value('npc_state_v3_edit_birthday').trim(), birthdayProvenance: 'manual',
            personality:`,
'editor birthday save']]);

console.log('Applied NPC State 0.4.3 birthday settings, editor, dossier, and injection surfaces');
