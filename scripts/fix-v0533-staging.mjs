import fs from 'node:fs';

const path = 'scripts/apply-v0533.mjs';
let source = fs.readFileSync(path, 'utf8');
const start = source.indexOf("replaceOnce('src/settings-contract.js',");
const end = source.indexOf("replaceOnce('src/settings.js',", start);
if (start < 0 || end < 0) throw new Error('settings-contract staging block not found');
const replacement = "replaceOnce('src/settings-contract.js',\n`export function normalizeNumericSetting(key, value, fallback = NUMERIC_SETTINGS[key]?.default) {`,\n`export const FIRST_CONTACT_FOLLOW_UP_MODES = Object.freeze(['off', 'missing_evaluations', 'recheck_unknown_fields']);\\nexport function normalizeFirstContactFollowUpMode(value) {\\n    const mode = String(value || '').trim().toLocaleLowerCase();\\n    return FIRST_CONTACT_FOLLOW_UP_MODES.includes(mode) ? mode : 'off';\\n}\\n\\nexport function normalizeNumericSetting(key, value, fallback = NUMERIC_SETTINGS[key]?.default) {`);\n";
fs.writeFileSync(path, source.slice(0, start) + replacement + source.slice(end));
