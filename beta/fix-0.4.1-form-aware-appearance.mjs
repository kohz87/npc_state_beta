import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing form-aware appearance marker: ' + label);
    return source.replace(from, to);
}

// 1) Extend normalized dossier state without changing the v3-compatible storage envelope.
let schema = read('v03/schema.js');
schema = replaceRequired(
    schema,
    "    'name', 'aliases', 'role', 'species', 'age', 'apparentAge', 'appearance',\n    'personality', 'behaviorProfile', 'speech', 'mannerisms', 'background', 'keyRelationships',",
    "    'name', 'aliases', 'role', 'species', 'age', 'apparentAge', 'appearance', 'appearanceForms',\n    'personality', 'behaviorProfile', 'speech', 'mannerisms', 'background', 'keyRelationships',",
    'stable profile form field',
);
schema = replaceRequired(
    schema,
    'export const CHECKPOINT_LIMIT = 48;\n',
    "export const CHECKPOINT_LIMIT = 48;\nexport const APPEARANCE_FORM_LIMIT = 12;\n",
    'appearance form limit',
);
schema = replaceRequired(
    schema,
    "export function normalizeDossierLimits(value = {}) {",
    `export function normalizeAppearanceForms(value) {
    const source = Array.isArray(value)
        ? value
        : (value && typeof value === 'object'
            ? Object.entries(value).map(([name, appearance]) => ({ name, appearance }))
            : []);
    const out = [];
    const seen = new Set();
    for (const raw of source) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const name = text(raw.name ?? raw.form ?? raw.label, 80);
        const appearance = text(raw.appearance ?? raw.description ?? raw.text, 1800);
        const key = normalizeName(name);
        if (!name || !key || !appearance || seen.has(key)) continue;
        seen.add(key);
        out.push({ name, appearance });
        if (out.length >= APPEARANCE_FORM_LIMIT) break;
    }
    return out;
}

export function appearanceFormByName(forms, reference) {
    const key = normalizeName(reference);
    if (!key) return null;
    return normalizeAppearanceForms(forms).find(form => normalizeName(form.name) === key) || null;
}

export function normalizeDossierLimits(value = {}) {`,
    'appearance form normalizers',
);
schema = replaceRequired(
    schema,
    "    })) : [];\n    return {\n        id,",
    "    })) : [];\n    const appearanceForms = normalizeAppearanceForms(input.appearanceForms);\n    const requestedCurrentForm = text(input.currentForm, 80);\n    const matchedCurrentForm = appearanceFormByName(appearanceForms, requestedCurrentForm);\n    const currentForm = matchedCurrentForm?.name || requestedCurrentForm;\n    return {\n        id,",
    'normalized current form setup',
);
schema = replaceRequired(
    schema,
    "        appearance: text(input.appearance, 1800),\n        personality: text(input.personality, 1200),",
    "        appearance: text(input.appearance, 1800),\n        appearanceForms,\n        currentForm,\n        personality: text(input.personality, 1200),",
    'stored form-aware fields',
);
write('v03/schema.js', schema);

// 2) Teach full scan, targeted refresh, and deterministic apply semantics.
let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "    normalizeActualAge,\n    normalizeApparentAge,",
    "    normalizeActualAge,\n    normalizeAppearanceForms,\n    normalizeApparentAge,",
    'scanner form normalizer import',
);
scanner = replaceRequired(
    scanner,
    "        apparentAge: npc.apparentAge,\n        archived: npc.archived,",
    "        apparentAge: npc.apparentAge,\n        appearance: npc.appearance,\n        appearanceForms: npc.appearanceForms,\n        currentForm: npc.currentForm,\n        archived: npc.archived,",
    'recovery scanner appearance continuity',
);
scanner = replaceRequired(
    scanner,
    "            aliases: [], role: '', species: '', age: 'actual chronological numeric age only: N, ~N, or N days/weeks/months; never child/adult/elderly', apparentAge: '~N only, e.g. ~25, or empty', appearance: '', personality: '',",
    "            aliases: [], role: '', species: '', age: 'actual chronological numeric age only: N, ~N, or N days/weeks/months; never child/adult/elderly', apparentAge: '~N only, e.g. ~25, or empty', appearance: 'shared/common appearance, or ordinary single-form appearance', currentForm: 'current named physical form or empty', appearanceForms: [{ name: 'newly established physical form', appearance: 'durable canonical appearance for this form' }], appearanceFormChanges: [{ name: 'existing form explicitly corrected/changed', appearance: 'replacement canonical appearance', evidence: 'explicit current-exchange correction/growth/change evidence' }], personality: '',",
    'full scanner form contract',
);
scanner = replaceRequired(
    scanner,
    "        '- apparentAge is separate from actual age. When clearly supported, it MUST be one approximate integer written exactly as ~N, for example ~18 or ~25. Never output decade bands, prose bands, or ranges such as twenties, 20s, late twenties, 20-30, or twenties to thirties. If a single numeric apparent age is not supported, leave apparentAge empty.',",
    "        '- apparentAge is separate from actual age. When clearly supported, it MUST be one approximate integer written exactly as ~N, for example ~18 or ~25. Never output decade bands, prose bands, or ranges such as twenties, 20s, late twenties, 20-30, or twenties to thirties. If a single numeric apparent age is not supported, leave apparentAge empty.',\n        '- appearance remains the shared/common physical description, or the ordinary appearance for an NPC with no distinct transforming forms. Do not rewrite appearance merely because a multi-form NPC changed form.',\n        '- currentForm is live physical-form state only, such as Human, Demihuman, or Beast. Leave it empty for ordinary non-transforming NPCs. A temporary outfit, pose, disguise, mood, or condition is not a physical form.',\n        '- appearanceForms stores durable canonical descriptions of distinct physical forms. For a NEW multi-form NPC, return every grounded form established by the current exchange. For an EXISTING NPC, appearanceForms must contain only genuinely NEW forms not already present in EXISTING DOSSIERS; never resend an existing form with a newly guessed description.',\n        '- Existing form descriptions are sticky continuity facts. Never change an established form because later prose casually uses different dimensions, colors, anatomy, or proportions. Use appearanceFormChanges only when the CURRENT exchange explicitly corrects canon or establishes a real persistent physical change/growth/evolution. Every appearanceFormChanges entry requires concrete evidence; otherwise omit it.',",
    'full scanner form semantics',
);
scanner = replaceRequired(
    scanner,
    "        'apparentAge must be one supported numeric approximation formatted exactly as ~N. Never use decade bands, worded age bands, or ranges. Leave it empty if no single numeric apparent age is supported.',",
    "        'apparentAge must be one supported numeric approximation formatted exactly as ~N. Never use decade bands, worded age bands, or ranges. Leave it empty if no single numeric apparent age is supported.',\n        'appearance is shared/common physical description, or ordinary single-form appearance. currentForm is live physical-form state only and should stay empty for a non-transforming NPC.',\n        'appearanceForms contains only newly established distinct physical forms. Preserve every existing form shown in TARGET DOSSIER. Never rewrite a stored form from a casual contradictory description.',\n        'appearanceFormChanges may revise a stored form only when this chat explicitly corrects canon or establishes persistent physical growth/change/evolution; include concrete evidence for every revision.',",
    'targeted refresh form semantics',
);
scanner = replaceRequired(
    scanner,
    "`OUTPUT CONTRACT:\\n${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: npc.id, name: npc.name, aliases: [], role: '', species: '', age: 'actual chronological numeric age only or empty', apparentAge: '~N only or empty', appearance: '', personality: '', behaviorProfile: null, speech: '', mannerisms: null, background: '', keyRelationships: null, memories: null, relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0, lifeState: 'alive|dead|unknown', lifeStateCertainty: '', lifeStateReason: '', livingReturn: false, relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' } }], socialEdges: [] })}`",
    "`OUTPUT CONTRACT:\\n${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: npc.id, name: npc.name, aliases: [], role: '', species: '', age: 'actual chronological numeric age only or empty', apparentAge: '~N only or empty', appearance: 'shared/common or ordinary single-form appearance', currentForm: 'current physical form or empty', appearanceForms: null, appearanceFormChanges: null, personality: '', behaviorProfile: null, speech: '', mannerisms: null, background: '', keyRelationships: null, memories: null, relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0, lifeState: 'alive|dead|unknown', lifeStateCertainty: '', lifeStateReason: '', livingReturn: false, relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' } }], socialEdges: [] })}`",
    'targeted refresh form contract',
);
scanner = replaceRequired(
    scanner,
    "function applyStablePatch(npc, patch, options = {}) {",
    `function mergeAppearanceFormPatch(existingValue, newValue, revisionValue) {
    const out = normalizeAppearanceForms(existingValue);
    const indexByName = () => new Map(out.map((form, index) => [normalizeName(form.name), index]));
    let indices = indexByName();

    // Ordinary scan output may only add genuinely new forms. Existing form descriptions
    // are intentionally sticky so incidental prose cannot resize/recolor a known body.
    for (const form of normalizeAppearanceForms(newValue)) {
        const key = normalizeName(form.name);
        if (!key || indices.has(key)) continue;
        out.push(form);
        indices.set(key, out.length - 1);
        if (out.length >= 12) break;
    }

    // Existing forms can change only through the explicit revision channel with evidence.
    for (const raw of Array.isArray(revisionValue) ? revisionValue : []) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const evidence = String(raw.evidence || raw.reason || '').trim();
        if (!evidence) continue;
        const revised = normalizeAppearanceForms([raw])[0];
        if (!revised) continue;
        const key = normalizeName(revised.name);
        indices = indexByName();
        const index = indices.get(key);
        if (Number.isInteger(index)) out[index] = revised;
        else if (out.length < 12) out.push(revised);
    }
    return normalizeAppearanceForms(out);
}

function applyStablePatch(npc, patch, options = {}) {`,
    'appearance form merge helper',
);
scanner = replaceRequired(
    scanner,
    "    const stringFields = ['name', 'role', 'species', 'age', 'apparentAge', 'appearance', 'personality', 'speech', 'background'];",
    "    const stringFields = ['name', 'role', 'species', 'age', 'apparentAge', 'personality', 'speech', 'background'];",
    'separate appearance application',
);
scanner = replaceRequired(
    scanner,
    "    if (!locked.has('aliases')) {",
    `    if (!locked.has('appearance')) {
        const appearance = String(patch?.appearance ?? '').trim();
        const incomingForms = normalizeAppearanceForms(patch?.appearanceForms);
        const formAware = Boolean((next.appearanceForms || []).length || incomingForms.length || String(patch?.currentForm || '').trim());
        // Non-transforming NPCs keep the legacy behavior. Once an NPC is form-aware,
        // shared appearance stops being rewritten merely because the current body changed.
        if (appearance && (!formAware || !next.appearance)) next.appearance = appearance;
    }
    if (!locked.has('appearanceForms')) {
        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, patch?.appearanceForms, patch?.appearanceFormChanges);
    }
    if (!locked.has('aliases')) {`,
    'sticky form-aware appearance application',
);
scanner = replaceRequired(
    scanner,
    "    const status = normalizeCurrentStatus(patch?.status);\n    if (status) next.status = status;",
    `    const status = normalizeCurrentStatus(patch?.status);
    if (status) next.status = status;
    const requestedForm = String(patch?.currentForm || '').trim().slice(0, 80);
    if (requestedForm) {
        const matchedForm = normalizeAppearanceForms(next.appearanceForms)
            .find(form => normalizeName(form.name) === normalizeName(requestedForm));
        next.currentForm = matchedForm?.name || requestedForm;
    }`,
    'live current form application',
);
write('v03/scanner.js', scanner);

// 3) Inject current and durable form continuity into relevant foreground generations.
let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "function fullNpc(npc) {",
    `function appearanceFormsText(npc = {}) {
    const forms = Array.isArray(npc.appearanceForms) ? npc.appearanceForms.filter(Boolean) : [];
    if (!forms.length) return '';
    const currentKey = String(npc.currentForm || '').trim().toLocaleLowerCase();
    const ordered = [...forms].sort((a, b) => Number(String(b?.name || '').trim().toLocaleLowerCase() === currentKey) - Number(String(a?.name || '').trim().toLocaleLowerCase() === currentKey));
    const rows = [];
    let used = 0;
    for (const form of ordered.slice(0, 12)) {
        const name = String(form?.name || '').trim();
        const appearance = String(form?.appearance || '').trim().slice(0, 1200);
        if (!name || !appearance) continue;
        const row = name + (name.toLocaleLowerCase() === currentKey ? ' [CURRENT]' : '') + ': ' + appearance;
        if (used + row.length > 6000) break;
        rows.push(row);
        used += row.length;
    }
    return rows.join(' | ');
}

function fullNpc(npc) {`,
    'foreground form formatter',
);
injection = replaceRequired(
    injection,
    "        field('Appearance', npc.appearance), field('Personality', npc.personality),",
    "        field('Appearance', npc.appearance), field('Current form', npc.currentForm), field('Known physical forms', appearanceFormsText(npc)), field('Personality', npc.personality),",
    'foreground form continuity fields',
);
injection = replaceRequired(
    injection,
    "        'age is ACTUAL chronological age only. Use one grounded numeric age. Years use N or ~N; when canon explicitly gives smaller units, use N days, N weeks, or N months. Never put child, teenager, adult, young adult, middle-aged, elder, elderly, old, or any other life-stage label in age. Never infer actual age from appearance. For an existing NPC, leave age empty unless this response explicitly establishes a more authoritative actual age; do not re-estimate it each turn. apparentAge is the separate visual estimate and uses ~N only.',",
    "        'age is ACTUAL chronological age only. Use one grounded numeric age. Years use N or ~N; when canon explicitly gives smaller units, use N days, N weeks, or N months. Never put child, teenager, adult, young adult, middle-aged, elder, elderly, old, or any other life-stage label in age. Never infer actual age from appearance. For an existing NPC, leave age empty unless this response explicitly establishes a more authoritative actual age; do not re-estimate it each turn. apparentAge is the separate visual estimate and uses ~N only.',\n        'appearance is shared/common physical description, or ordinary single-form appearance. currentForm is live physical-form state only; leave it empty for ordinary non-transforming NPCs. Clothing, disguises, poses, moods, and injuries are not forms.',\n        'appearanceForms is durable form-specific canon. For a NEW multi-form NPC include every grounded distinct physical form. For an EXISTING NPC return only genuinely NEW forms; never rewrite a known form from casual contradictory prose. Existing form dimensions/anatomy/colors/proportions are sticky.',\n        'appearanceFormChanges is the only scanner channel allowed to revise an existing form. Use it only for an explicit current-exchange correction or real persistent growth/change/evolution, and include concrete evidence. Otherwise omit/null it.',",
    'foreground form semantics',
);
injection = replaceRequired(
    injection,
    "\"appearance\":\"\",\"personality\":\"\"",
    "\"appearance\":\"shared/common or ordinary single-form appearance\",\"currentForm\":\"current physical form or empty\",\"appearanceForms\":[{\"name\":\"new physical form\",\"appearance\":\"durable canonical form appearance\"}],\"appearanceFormChanges\":[{\"name\":\"existing form explicitly changed\",\"appearance\":\"replacement canonical form appearance\",\"evidence\":\"explicit correction/growth/change evidence\"}],\"personality\":\"\"",
    'foreground form output contract',
);
write('v03/injection.js', injection);

// 4) Show and manually edit forms without burdening ordinary NPCs in the dossier view.
let dossierView = read('v03/dossier-view.js');
dossierView = replaceRequired(
    dossierView,
    "function paragraphHtml(value, empty = 'Unknown') {",
    `function appearanceFormsHtml(npc = {}) {
    const forms = Array.isArray(npc.appearanceForms) ? npc.appearanceForms.filter(Boolean) : [];
    if (!forms.length) return '<p class="npc-state-muted">No alternate physical forms established.</p>';
    const current = String(npc.currentForm || '').trim().toLocaleLowerCase();
    return '<ul class="npc-state-v3-block-list">' + forms.map(form => {
        const name = String(form?.name || '').trim();
        const appearance = String(form?.appearance || '').trim();
        const suffix = name && name.toLocaleLowerCase() === current ? ' · current' : '';
        return '<li><b>' + escapeHtml(name + suffix) + '</b><br>' + escapeHtml(appearance) + '</li>';
    }).join('') + '</ul>';
}

function paragraphHtml(value, empty = 'Unknown') {`,
    'dossier form renderer',
);
dossierView = replaceRequired(
    dossierView,
    "            ${currentFact('Activity / condition', npc.status)}\n          </div>",
    "            ${currentFact('Activity / condition', npc.status)}\n            ${npc.currentForm ? currentFact('Current form', npc.currentForm) : ''}\n          </div>",
    'dossier current form card',
);
dossierView = replaceRequired(
    dossierView,
    "            ${block('Appearance', paragraphHtml(npc.appearance))}\n            ${block('Behavioral profile', listHtml(npc.behaviorProfile))}",
    "            ${block('Appearance', paragraphHtml(npc.appearance))}\n            ${(npc.appearanceForms || []).length ? block('Appearance forms', appearanceFormsHtml(npc), 'npc-state-v3-block-wide') : ''}\n            ${block('Behavioral profile', listHtml(npc.behaviorProfile))}",
    'dossier appearance forms block',
);
write('v03/dossier-view.js', dossierView);

// 5) Extend the manual editor. One form per line keeps the UI compact and readable.
let ui = read('v03/ui.js');
ui = replaceRequired(
    ui,
    "function latestAssistantMessageId(chat = []) {",
    `function parseAppearanceForms(value, max = 12) {
    const out = [];
    const seen = new Set();
    for (const raw of String(value || '').split(/\\r?\\n/)) {
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
        .filter(line => !/^\\s*\\|/.test(line))
        .join('\\n');
}

function latestAssistantMessageId(chat = []) {`,
    'editor form parsing helpers',
);
ui = replaceRequired(
    ui,
    "          <label class=\"npc-state-v3-editor-wide\">Personality<textarea id=\"npc_state_v3_edit_personality\" class=\"text_pole\" rows=\"3\">${escapeHtml(npc.personality)}</textarea></label><label class=\"npc-state-v3-editor-wide\">Behavioral profile · one per line<textarea id=\"npc_state_v3_edit_behavior\" class=\"text_pole\" rows=\"5\">${escapeHtml((npc.behaviorProfile || []).join('\\n'))}</textarea></label><label class=\"npc-state-v3-editor-wide\">Speech<textarea id=\"npc_state_v3_edit_speech\" class=\"text_pole\" rows=\"3\">${escapeHtml(npc.speech)}</textarea></label><label class=\"npc-state-v3-editor-wide\">Appearance<textarea id=\"npc_state_v3_edit_appearance\" class=\"text_pole\" rows=\"5\">${escapeHtml(npc.appearance)}</textarea></label><label class=\"npc-state-v3-editor-wide\">Background",
    "          <label class=\"npc-state-v3-editor-wide\">Personality<textarea id=\"npc_state_v3_edit_personality\" class=\"text_pole\" rows=\"3\">${escapeHtml(npc.personality)}</textarea></label><label class=\"npc-state-v3-editor-wide\">Behavioral profile · one per line<textarea id=\"npc_state_v3_edit_behavior\" class=\"text_pole\" rows=\"5\">${escapeHtml((npc.behaviorProfile || []).join('\\n'))}</textarea></label><label class=\"npc-state-v3-editor-wide\">Speech<textarea id=\"npc_state_v3_edit_speech\" class=\"text_pole\" rows=\"3\">${escapeHtml(npc.speech)}</textarea></label><label class=\"npc-state-v3-editor-wide\">Appearance · shared/common or ordinary single form<textarea id=\"npc_state_v3_edit_appearance\" class=\"text_pole\" rows=\"5\">${escapeHtml(npc.appearance)}</textarea></label>${field('Current physical form', 'npc_state_v3_edit_current_form', npc.currentForm)}<label class=\"npc-state-v3-editor-wide\">Appearance forms · one per line as Form | description<textarea id=\"npc_state_v3_edit_appearance_forms\" class=\"text_pole\" rows=\"6\">${escapeHtml(appearanceFormsEditorText(npc))}</textarea></label><label class=\"npc-state-v3-editor-wide\">Background",
    'editor form fields',
);
ui = replaceRequired(
    ui,
    "        const stableFields = ['name', 'role', 'species', 'age', 'apparentAge', 'personality', 'behaviorProfile', 'speech', 'appearance', 'background', 'mannerisms', 'keyRelationships'];",
    "        const stableFields = ['name', 'role', 'species', 'age', 'apparentAge', 'personality', 'behaviorProfile', 'speech', 'appearance', 'appearanceForms', 'background', 'mannerisms', 'keyRelationships'];",
    'editor form lock field',
);
ui = replaceRequired(
    ui,
    "            personality: value('npc_state_v3_edit_personality'), behaviorProfile: splitLines(value('npc_state_v3_edit_behavior'), limits.behaviorProfile), speech: value('npc_state_v3_edit_speech'), appearance: value('npc_state_v3_edit_appearance'), background: value('npc_state_v3_edit_background'), mannerisms: splitLines(value('npc_state_v3_edit_mannerisms'), limits.mannerisms), keyRelationships: splitLines(value('npc_state_v3_edit_key_relationships'), limits.keyRelationships),",
    "            personality: value('npc_state_v3_edit_personality'), behaviorProfile: splitLines(value('npc_state_v3_edit_behavior'), limits.behaviorProfile), speech: value('npc_state_v3_edit_speech'), appearance: value('npc_state_v3_edit_appearance'), currentForm: value('npc_state_v3_edit_current_form').trim(), appearanceForms: parseAppearanceForms(value('npc_state_v3_edit_appearance_forms')), background: value('npc_state_v3_edit_background'), mannerisms: splitLines(value('npc_state_v3_edit_mannerisms'), limits.mannerisms), keyRelationships: splitLines(value('npc_state_v3_edit_key_relationships'), limits.keyRelationships),",
    'editor form save payload',
);
write('v03/ui.js', ui);

// 6) Portrait generation uses the current form instead of accidentally describing a different body.
let portrait = read('v03/portrait-prompt.js');
portrait = replaceRequired(
    portrait,
    "function naturalCharacter(npc = {}) {",
    `function currentFormAppearance(npc = {}) {
    const current = inlineText(npc.currentForm, 80).toLocaleLowerCase();
    const forms = Array.isArray(npc.appearanceForms) ? npc.appearanceForms : [];
    const form = current ? forms.find(item => inlineText(item?.name, 80).toLocaleLowerCase() === current) : null;
    const general = inlineText(npc.appearance, 3000);
    const specific = inlineText(form?.appearance, 3000);
    return [general, specific].filter(Boolean).join('; ');
}

function appearanceFormsPromptText(npc = {}) {
    return (Array.isArray(npc.appearanceForms) ? npc.appearanceForms : [])
        .map(form => {
            const name = inlineText(form?.name, 80);
            const appearance = inlineText(form?.appearance, 1200);
            return name && appearance ? name + ': ' + appearance : '';
        })
        .filter(Boolean)
        .join(' | ');
}

function naturalCharacter(npc = {}) {`,
    'portrait current form helper',
);
portrait = replaceRequired(
    portrait,
    "    const appearance = inlineText(npc.appearance, 3000);",
    "    const appearance = currentFormAppearance(npc);",
    'portrait natural form appearance',
);
portrait = replaceRequired(
    portrait,
    "    push(npc.appearance);",
    "    push(currentFormAppearance(npc));",
    'portrait tags form appearance',
);
// There are two appearance declarations; the first was replaced above, replace the remaining hybrid one now.
portrait = replaceRequired(
    portrait,
    "    const appearance = inlineText(npc.appearance, 3000);",
    "    const appearance = currentFormAppearance(npc);",
    'portrait hybrid form appearance',
);
portrait = replaceRequired(
    portrait,
    "    'positivePreset', 'negativePreset', 'character', 'name', 'aliases', 'role', 'species', 'age', 'apparentAge',\n    'appearance', 'personality',",
    "    'positivePreset', 'negativePreset', 'character', 'name', 'aliases', 'role', 'species', 'age', 'apparentAge',\n    'appearance', 'currentForm', 'currentFormAppearance', 'appearanceForms', 'personality',",
    'portrait form placeholders',
);
portrait = replaceRequired(
    portrait,
    "        apparentAge: inlineText(npc.apparentAge, 80),\n        appearance: inlineText(npc.appearance, 3000),",
    "        apparentAge: inlineText(npc.apparentAge, 80),\n        appearance: inlineText(npc.appearance, 3000),\n        currentForm: inlineText(npc.currentForm, 80),\n        currentFormAppearance: currentFormAppearance(npc),\n        appearanceForms: appearanceFormsPromptText(npc),",
    'portrait form placeholder values',
);
write('v03/portrait-prompt.js', portrait);

let changelog = read('CHANGELOG.md');
const line = '- Form-aware appearance: multi-form NPCs now track currentForm plus durable named appearanceForms, preserve unrelated/established forms across transformations, require evidence-gated revisions for explicit physical changes, inject known forms back into relevant turns, expose form editing in dossiers, and use the current form for portrait prompts while ordinary NPC appearance remains backward-compatible.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line + '\n', 'changelog heading');
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.1 form-aware appearance');
