import fs from 'node:fs';

const path = 'scripts/apply-v0533.mjs';
let source = fs.readFileSync(path, 'utf8');
const start = source.indexOf("replaceOnce('src/settings-contract.js',");
const end = source.indexOf("replaceOnce('src/settings.js',", start);
if (start < 0 || end < 0) throw new Error('settings-contract staging block not found');
const replacement = "replaceOnce('src/settings-contract.js',\n`export function normalizeNumericSetting(key, value, fallback = NUMERIC_SETTINGS[key]?.default) {`,\n`export const FIRST_CONTACT_FOLLOW_UP_MODES = Object.freeze(['off', 'missing_evaluations', 'recheck_unknown_fields']);\\nexport function normalizeFirstContactFollowUpMode(value) {\\n    const mode = String(value || '').trim().toLocaleLowerCase();\\n    return FIRST_CONTACT_FOLLOW_UP_MODES.includes(mode) ? mode : 'off';\\n}\\n\\nexport function normalizeNumericSetting(key, value, fallback = NUMERIC_SETTINGS[key]?.default) {`);\n";
source = source.slice(0, start) + replacement + source.slice(end);

// Everything after the patch body begins is source text destined for repository files.
// Protect the handful of deliberate meta-interpolations, then prevent the staging
// helper itself from evaluating target-code template expressions.
const patchStart = source.indexOf('// One canonical first-contact follow-up setting.');
if (patchStart < 0) throw new Error('patch body marker not found');
const head = source.slice(0, patchStart);
let body = source.slice(patchStart);
const protectedForms = ["${'${prompt}'}", "${'${label}'}", "${'${purpose}'}", "${'${visible}'}"];
protectedForms.forEach((value, index) => { body = body.replaceAll(value, `__NPC_STAGE_INTERP_${index}__`); });
body = body.replaceAll('${', '\\${');
protectedForms.forEach((value, index) => { body = body.replaceAll(`__NPC_STAGE_INTERP_${index}__`, value); });
fs.writeFileSync(path, head + body);
