import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function rep(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase-7A marker: ' + label);
    return source.replace(from, to);
}

let scanner = read('v03/scanner.js');

scanner = rep(scanner,
    "function applyStablePatch(npc, patch, options = {}) {",
    String.raw`const AGE_CHANGE_KINDS = new Set(['birthday', 'elapsed', 'correction']);
const AGE_BIRTHDAY_CUES = /\b(birthday|turned|turns|turning)\b/i;
const AGE_ELAPSED_CUES = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|several)\s+(?:days?|weeks?|months?|years?)\s+(?:later|passed|have passed|had passed)|\bafter\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?|years?)\b/i;
const AGE_CORRECTION_CUES = /\b(correct(?:s|ed|ion)?|actually|mistaken|mistake|wrong|misstated|rather than|not\s+\d{1,4}[^.!?]{0,30}\bbut\b)\b/i;

function ageEvidenceMentionsTarget(evidence, targetAge) {
    const target = normalizeActualAge(targetAge);
    if (!target) return false;
    const number = target.match(/\d{1,4}/)?.[0] || '';
    if (!number) return false;
    const unit = /\bdays?\b/i.test(target) ? 'day'
        : (/\bweeks?\b/i.test(target) ? 'week'
            : (/\bmonths?\b/i.test(target) ? 'month' : ''));
    if (!unit) return new RegExp('(^|\\D)' + number + '(?!\\d)').test(String(evidence || ''));
    return new RegExp('(^|\\D)' + number + '\\s+' + unit + 's?\\b', 'i').test(String(evidence || ''));
}

function explicitAgeChange(npc, patch, options = {}) {
    const raw = patch?.ageChange;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
    const current = normalizeActualAge(npc?.age);
    const age = normalizeActualAge(raw.age ?? raw.value);
    const kind = String(raw.kind || '').trim().toLocaleLowerCase();
    const evidence = String(raw.evidence || raw.reason || '').trim().slice(0, 600);
    const context = String(options.profileContext || '');
    if (!current || !age || age === current || !AGE_CHANGE_KINDS.has(kind) || !evidence) return '';
    if (!profileEvidenceGrounded(evidence, context) || !ageEvidenceMentionsTarget(evidence, age)) return '';
    if (kind === 'birthday' && !AGE_BIRTHDAY_CUES.test(evidence)) return '';
    if (kind === 'elapsed' && !AGE_ELAPSED_CUES.test(evidence)) return '';
    if (kind === 'correction' && !AGE_CORRECTION_CUES.test(evidence)) return '';
    return age;
}

function applyStablePatch(npc, patch, options = {}) {`,
    'age change helpers');

scanner = rep(scanner,
    "        if (field === 'name' && value !== next.name && next.name && !isTechnicalNpcIdentity(next.name)) next.aliases = appendUnique(next.aliases, [next.name], 10);\n        next[field] = value;\n    }\n    for (const field of ['personality', 'speech']) {",
    "        if (field === 'name' && value !== next.name && next.name && !isTechnicalNpcIdentity(next.name)) next.aliases = appendUnique(next.aliases, [next.name], 10);\n        next[field] = value;\n    }\n    if (!locked.has('age')) {\n        const changedAge = explicitAgeChange(npc, patch, options);\n        if (changedAge) next.age = changedAge;\n    }\n    for (const field of ['personality', 'speech']) {",
    'apply explicit age change');

scanner = rep(scanner,
    "aliases: [], role: '', species: '', age: 'actual chronological numeric age only: N, ~N, or N days/weeks/months; never child/adult/elderly', apparentAge:",
    "aliases: [], role: '', species: '', age: 'initial actual chronological numeric age only, or same-value refinement; use ageChange for an established age changing', ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence that states the new age' }, apparentAge:",
    'full scanner age contract');

scanner = rep(scanner,
    "        '- age is ACTUAL chronological age only. Use one grounded numeric age. Years use N or ~N; if canon explicitly gives a smaller unit, use N days, N weeks, or N months. Never write child, teenager, adult, young adult, middle-aged, elder, elderly, old, or another life-stage label in age. Never infer actual age from appearance. For an EXISTING NPC, leave age empty unless the current exchange explicitly establishes a more authoritative actual age; do not re-estimate it from prose or appearance.',",
    "        '- age is ACTUAL chronological age only. Use one grounded numeric age. Years use N or ~N; if canon explicitly gives a smaller unit, use N days, N weeks, or N months. Never write child, teenager, adult, young adult, middle-aged, elder, elderly, old, or another life-stage label in age. Never infer actual age from appearance. For an EXISTING NPC with an established age, a different number MUST NOT be placed in age. Use ageChange instead.',\n        '- ageChange is the only automatic channel allowed to change an already-established chronological age. kind birthday requires explicit birthday/turned-N evidence; elapsed requires explicit elapsed-time narration that also states the resulting age; correction requires explicit correction/mistake evidence that states the corrected age. The evidence must contain the new numeric age. Casual contradictory age prose, appearance-based guesses, and unstated arithmetic are rejected by the backend. Leave ageChange null/omit when no authoritative chronological change occurred.',",
    'full scanner age rules');

scanner = rep(scanner,
    "        'age is ACTUAL chronological age only. Use grounded numeric age data only: N or ~N years, or N days/weeks/months when explicitly established. Never use child, teenager, adult, young adult, middle-aged, elder, elderly, old, or another life-stage label. If the target already has an age and the chat does not explicitly correct it, leave age empty rather than re-estimating it.',",
    "        'age is ACTUAL chronological age only. Use grounded numeric age data only: N or ~N years, or N days/weeks/months when explicitly established. Never use child, teenager, adult, young adult, middle-aged, elder, elderly, old, or another life-stage label. If the target already has an age, leave age empty for any different number and use ageChange only for an explicit birthday, elapsed-time update, or correction that states the resulting numeric age.',\n        'ageChange is the only automatic revision channel for an established chronological age: {age, kind birthday|elapsed|correction, evidence}. Evidence must explicitly state the new age and the birthday/elapsed/correction basis. Casual contradictions and appearance guesses are not revisions.',",
    'targeted age rules');

scanner = rep(scanner,
    "age: 'actual chronological numeric age only or empty', apparentAge:",
    "age: 'initial actual chronological numeric age only or empty', ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence' }, apparentAge:",
    'targeted age contract');

write('v03/scanner.js', scanner);

let injection = read('v03/injection.js');
injection = rep(injection,
    "        'age is ACTUAL chronological age only. Use one grounded numeric age. Years use N or ~N; when canon explicitly gives smaller units, use N days, N weeks, or N months. Never put child, teenager, adult, young adult, middle-aged, elder, elderly, old, or any other life-stage label in age. Never infer actual age from appearance. For an existing NPC, leave age empty unless this response explicitly establishes a more authoritative actual age; do not re-estimate it each turn. apparentAge is the separate visual estimate and uses ~N only.',",
    "        'age is ACTUAL chronological age only. Use one grounded numeric age. Years use N or ~N; when canon explicitly gives smaller units, use N days, N weeks, or N months. Never put child, teenager, adult, young adult, middle-aged, elder, elderly, old, or any other life-stage label in age. Never infer actual age from appearance. For an existing NPC with an established age, do not place a different number in age. apparentAge is the separate visual estimate and uses ~N only.',\n        'ageChange is the only channel allowed to revise an established chronological age. Use {age, kind: birthday|elapsed|correction, evidence}. birthday requires explicit birthday/turned-N evidence; elapsed requires explicit passage of time AND narration stating the resulting age; correction requires an explicit correction/mistake statement. Evidence must state the new numeric age. Casual contradictory age prose, appearance guesses, and unstated arithmetic must leave ageChange empty.',",
    'foreground age rule');
injection = rep(injection,
    "\"age\":\"actual chronological numeric age only or empty\",\"apparentAge\":",
    "\"age\":\"initial actual chronological numeric age only or empty\",\"ageChange\":{\"age\":\"new actual chronological age\",\"kind\":\"birthday|elapsed|correction\",\"evidence\":\"explicit grounded age-change evidence stating new age\"},\"apparentAge\":",
    'foreground age output');
write('v03/injection.js', injection);

let changelog = read('CHANGELOG.md');
const line = '- Phase 7A adds an explicit evidence-gated ageChange channel. Established chronological ages remain sticky against casual contradictory prose; automatic revision now requires a grounded birthday, explicit elapsed-time update, or explicit correction that states the resulting numeric age. Appearance guesses and unstated arithmetic fail closed, while manual dossier edits remain authoritative.';
if (!changelog.includes(line)) changelog = rep(changelog, '## v0.4.2\n\n', '## v0.4.2\n\n' + line + '\n', 'phase 7A changelog');
write('CHANGELOG.md', changelog);
console.log('Applied NPC State 0.4.2 phase 7A explicit age-change channel');
