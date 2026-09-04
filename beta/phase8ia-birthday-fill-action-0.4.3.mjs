import fs from 'node:fs';

const path = 'v03/engine.js';
let source = fs.readFileSync(path, 'utf8');
function rep(from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase 8IA engine marker: ' + label);
    source = source.replace(from, to);
}

rep(
`    DEFAULT_RELATIONSHIP_CAPS,
    createEmptyState,`,
`    DEFAULT_RELATIONSHIP_CAPS,
    applyBirthdayFill,
    createEmptyState,`,
'birthday fill import');
rep(
`    normalizeName,
    normalizeNpc,`,
`    normalizeName,
    normalizeNpc,
    normalizeBirthdayFillMode,`,
'birthday fill mode import');

rep(
`    async function archiveNpc(reference, archived = true, reason = 'manual') {`,
`    async function fillMissingBirthdays() {
        const settings = getSettings();
        const mode = normalizeBirthdayFillMode(settings.birthdayFillMode);
        if (mode === 'off') return { ok: false, reason: 'fill-disabled' };
        return mutate('birthday-fill', state => {
            let filled = 0;
            state.npcs = state.npcs.map(raw => {
                if (String(raw?.birthday || '').trim()
                    || (raw?.manualProfileFields || []).includes('birthday')
                    || String(raw?.birthdayProvenance || '').toLocaleLowerCase() === 'manual') return raw;
                const next = normalizeNpc(applyBirthdayFill(raw, {
                    mode,
                    calendar: settings.birthdayRandomCalendar,
                    fallbackDays: settings.birthdayRandomDaysPerMonth,
                }));
                if (!String(raw?.birthday || '').trim() && String(next?.birthday || '').trim()) filled += 1;
                return next;
            });
            return { filled };
        }, { checkpointReason: 'birthday-fill' });
    }

    async function archiveNpc(reference, archived = true, reason = 'manual') {`,
'fill missing birthdays method');

rep(
`        addNpc,
        updateNpc,
        archiveNpc,`,
`        addNpc,
        updateNpc,
        fillMissingBirthdays,
        archiveNpc,`,
'export fill action');

fs.writeFileSync(path, source);
console.log('Added NPC State 0.4.3 local fill-missing-birthdays action');
