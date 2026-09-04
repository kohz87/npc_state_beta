import fs from 'node:fs';

const path = 'v03/engine.js';
let source = fs.readFileSync(path, 'utf8');
const from = `                dossierLimits: settings.dossierLimits,
                applyReturnedNpcPatches: true,`;
const to = `                dossierLimits: settings.dossierLimits,
                birthdayFill: {
                    mode: settings.birthdayFillMode,
                    calendar: settings.birthdayRandomCalendar,
                    fallbackDays: settings.birthdayRandomDaysPerMonth,
                },
                applyReturnedNpcPatches: true,`;
const count = source.split(from).length - 1;
// Four are applyScanResult callers; one is the targeted-prompt options object. Passing the
// same passive metadata through that prompt-options object is inert and keeps this marker
// deterministic without depending on function formatting.
if (count !== 5) throw new Error('Expected five v0.4.3 dossier-limit/reconciliation markers, got ' + count);
source = source.split(from).join(to);
fs.writeFileSync(path, source);
console.log('Wired NPC State 0.4.3 birthday fill options through reconciliation paths');
