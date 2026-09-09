import fs from 'node:fs';

const path = 'scripts/apply-v0533.mjs';
let source = fs.readFileSync(path, 'utf8');
const start = source.indexOf("replaceOnce('src/settings-contract.js',");
const end = source.indexOf("replaceOnce('src/settings.js',", start);
if (start < 0 || end < 0) throw new Error('settings-contract staging block not found');
const replacement = "replaceOnce('src/settings-contract.js',\n`export function normalizeNumericSetting(key, value, fallback = NUMERIC_SETTINGS[key]?.default) {`,\n`export const FIRST_CONTACT_FOLLOW_UP_MODES = Object.freeze(['off', 'missing_evaluations', 'recheck_unknown_fields']);\\nexport function normalizeFirstContactFollowUpMode(value) {\\n    const mode = String(value || '').trim().toLocaleLowerCase();\\n    return FIRST_CONTACT_FOLLOW_UP_MODES.includes(mode) ? mode : 'off';\\n}\\n\\nexport function normalizeNumericSetting(key, value, fallback = NUMERIC_SETTINGS[key]?.default) {`);\n";
source = source.slice(0, start) + replacement + source.slice(end);

const readmeStart = source.indexOf('// Release documentation.');
const coreStart = source.indexOf('const coreOld =', readmeStart);
if (readmeStart < 0 || coreStart < 0) throw new Error('README staging block not found');
const readmeBlock = "// Release documentation.\n"
  + "replaceOnce('README.md', '## Release 0.5.32', '## Release 0.5.33');\n"
  + "replaceRegex('README.md', /0\\.5\\.32 makes[\\s\\S]*?(?=\\n\\nRecent 0\\.5\\.x refinements retained by this release include:)/, `0.5.33 makes first-contact follow-up explicit rather than automatic. The default and absent-setting behavior is Off. Missing evaluations only can make one bounded current-exchange request for newly admitted fields the first response did not account for; Recheck unknown fields can also reconsider eligible blank fields explicitly marked insufficient. Exact target-field coverage, source ownership, locks, validation, and the existing single persistence/checkpoint boundary remain authoritative.`);\n"
  + "replaceOnce('README.md', '`compact continuity -> visible roleplay response -> dedicated post-response scan -> optional new-admission completion -> validate/apply -> guarded persistence/checkpoint -> refresh continuity/UI`', '`compact continuity -> visible roleplay response -> dedicated post-response scan -> optional configured first-contact follow-up -> validate/apply -> guarded persistence/checkpoint -> refresh continuity/UI`');\n"
  + "replaceRegex('README.md', /Roleplay generation does not emit `<npc_state_v1>`[\\s\\S]*?(?=\\n\\nBefore the next ordinary generation)/, `Roleplay generation does not emit <npc_state_v1> or other NPC JSON. Foreground injection is continuity-only. autoScan=true means one logical dedicated scan operation after each completed assistant revision. Automatic operations share a hard maximum of two provider requests, including malformed-JSON retry and optional first-contact follow-up. Existing NPCs never trigger that automatic follow-up. Duplicate host completion events share the same logical job; edits, swipes, deletion, branch changes, and chat switches invalidate stale work.`);\n"
  + "replaceRegex('README.md', /Scanner input sizing is measured separately[\\s\\S]*?These are local engineering estimates, not provider-reported usage\\./, `Scanner input sizing is measured separately from foreground continuity and scanner output allowance. npm run measure:scan-prompts reports the current stable fixture matrix using the existing conservative local estimator and exact scanner system wrapper. Operation diagnostics separately record estimated input characters/tokens for every provider request and an aggregate across retries/follow-up. These estimates are not provider-reported or billed token usage.`);\n"
  + "replaceOnce('README.md', '- **Auto scan**: one dedicated post-response scan operation; newly admitted NPCs may receive one bounded current-exchange completion request before commit.', '- **Auto scan**: one dedicated post-response scan operation. First-contact follow-up is separately configurable and defaults to Off.');\n"
  + "replaceOnce('README.md', '- **Scanner output tokens**: adjustable up to 15,000.', '- **First-contact follow-up**: Off (default), Missing evaluations only, or Recheck unknown fields. Enabled modes can add at most one request and may find no additional information.\\n- **Scanner output tokens**: adjustable up to 15,000.');\n"
  + "replaceOnce('README.md', '- Release label: **0.5.24**', '- Release label: **0.5.33**');\n"
  + "replaceOnce('README.md', 'No database reset, rebuild, or storage-key migration is required. Automatic historical enrichment/backfill remains intentionally deferred; this release does not add a raw-history window or follow-up scanner request.', 'No database reset, rebuild, or storage-key migration is required. Automatic historical enrichment/backfill remains intentionally deferred. Optional first-contact follow-up and manual Recheck missing details use only the current exchange and do not add a raw-history enrichment path.');\n\n";
source = source.slice(0, readmeStart) + readmeBlock + source.slice(coreStart);

const patchStart = source.indexOf('// One canonical first-contact follow-up setting.');
if (patchStart < 0) throw new Error('patch body marker not found');
const head = source.slice(0, patchStart);
let body = source.slice(patchStart);
const protectedForms = ["${'${prompt}'}", "${'${label}'}", "${'${purpose}'}", "${'${visible}'}"];
protectedForms.forEach((value, index) => { body = body.replaceAll(value, `__NPC_STAGE_INTERP_${index}__`); });
body = body.replaceAll('${', '\\${');
body = body.replace(/\\+\$\{budget\.count\}/g, '\\${budget.count}');
body = body.replace(/\\+\$\{budget\.limit\}/g, '\\${budget.limit}');
protectedForms.forEach((value, index) => { body = body.replaceAll(`__NPC_STAGE_INTERP_${index}__`, value); });
fs.writeFileSync(path, head + body);
