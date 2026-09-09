import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);
function once(path, before, after) {
  const s = read(path);
  const n = s.split(before).length - 1;
  if (n !== 1) throw new Error(`${path}: expected one match, found ${n}: ${before.slice(0, 120)}`);
  write(path, s.replace(before, after));
}
function rx(path, re, after) {
  const s = read(path);
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const matches = [...s.matchAll(new RegExp(re.source, flags))];
  if (matches.length !== 1) throw new Error(`${path}: expected one regex match, found ${matches.length}: ${re}`);
  write(path, s.replace(re, after));
}

once('manifest.json', '"version": "0.5.32"', '"version": "0.5.33"');
once('src/schema.js', "export const NPC_STATE_VERSION = '0.5.32';", "export const NPC_STATE_VERSION = '0.5.33';");
once('DEVELOPMENT.md', '- Extension release: `0.5.32`', '- Extension release: `0.5.33`');

once('src/settings-contract.js',
  '}\n\nexport function normalizeNumericSetting(key, value, fallback = NUMERIC_SETTINGS[key]?.default) {',
  `}\n\nexport const FIRST_CONTACT_FOLLOW_UP_MODES = Object.freeze(['off', 'missing_evaluations', 'recheck_unknown_fields']);\nexport function normalizeFirstContactFollowUpMode(value) {\n    const mode = String(value || '').trim().toLocaleLowerCase();\n    return FIRST_CONTACT_FOLLOW_UP_MODES.includes(mode) ? mode : 'off';\n}\n\nexport function normalizeNumericSetting(key, value, fallback = NUMERIC_SETTINGS[key]?.default) {`);
once('src/settings.js',
  "import { NUMERIC_SETTINGS, normalizeNumericSetting } from './settings-contract.js';",
  "import { NUMERIC_SETTINGS, normalizeFirstContactFollowUpMode, normalizeNumericSetting } from './settings-contract.js';");
once('src/settings.js',
  "    newNpcAdmissionMode: 'balanced',\n    birthdayFillMode: 'off',",
  "    newNpcAdmissionMode: 'balanced',\n    firstContactFollowUpMode: 'off',\n    birthdayFillMode: 'off',");
once('src/settings.js',
  '    settings.newNpcAdmissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);\n    settings.birthdayFillMode = normalizeBirthdayFillMode(settings.birthdayFillMode);',
  '    settings.newNpcAdmissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);\n    settings.firstContactFollowUpMode = normalizeFirstContactFollowUpMode(settings.firstContactFollowUpMode);\n    settings.birthdayFillMode = normalizeBirthdayFillMode(settings.birthdayFillMode);');
once('src/settings.js',
  'const DEFAULT_MEMORY_CRITERIA = `Store only durable NPC memories that can matter in later scenes: consequential promises, betrayals, rescues, injuries, discoveries, relationship-defining exchanges, major gifts/debts, established secrets, lasting changes of circumstance, and other facts the NPC would reasonably remember later. Do not store routine dialogue, transient mood, narration texture, or duplicate paraphrases of an existing memory.`;',
  'const DEFAULT_MEMORY_CRITERIA = `Store only durable NPC memories that can matter in later scenes: consequential promises, betrayals, rescues, injuries, discoveries, relationship-defining exchanges, major gifts/debts, established secrets, completed registrations or credentials that establish lasting access, lasting changes of circumstance, and other facts the NPC would reasonably remember later. Do not store routine dialogue, transient mood, narration texture, or duplicate paraphrases of an existing memory.`;');

once('src/settings-layout.js',
  "        '#npc_state_v04_admission',\n        '#npc_state_v047_response_tokens',",
  "        '#npc_state_v04_admission',\n        '#npc_state_v3_first_contact_follow_up',\n        '#npc_state_v047_response_tokens',");

once('src/ui.js',
  "import { NUMERIC_SETTINGS, numericSettingAttributes, normalizeNumericSetting } from './settings-contract.js';",
  "import { NUMERIC_SETTINGS, numericSettingAttributes, normalizeFirstContactFollowUpMode, normalizeNumericSetting } from './settings-contract.js';");
once('src/ui.js',
  '              <label class="npc-state-setting-row"><span><b>New NPC admission</b><small>Balanced keeps current behavior. Named preferred ignores first-seen unnamed role labels. Manual prevents scanner-created dossiers while existing NPCs still update.</small></span><select id="npc_state_v04_admission" class="text_pole"><option value="balanced">Balanced</option><option value="named_preferred">Named preferred</option><option value="manual">Manual</option></select></label>',
  '              <label class="npc-state-setting-row"><span><b>New NPC admission</b><small>Balanced keeps current behavior. Named preferred ignores first-seen unnamed role labels. Manual prevents scanner-created dossiers while existing NPCs still update.</small></span><select id="npc_state_v04_admission" class="text_pole"><option value="balanced">Balanced</option><option value="named_preferred">Named preferred</option><option value="manual">Manual</option></select></label>\n              <label class="npc-state-setting-row"><span><b>First-contact follow-up</b><small>Off uses only the normal scan. Missing evaluations only rechecks newly admitted fields the first response did not account for. Recheck unknown fields also revisits eligible blanks once, including explicit insufficient outcomes. Follow-up adds one request at most and may find no additional information.</small></span><select id="npc_state_v3_first_contact_follow_up" class="text_pole"><option value="off">Off</option><option value="missing_evaluations">Missing evaluations only</option><option value="recheck_unknown_fields">Recheck unknown fields</option></select></label>');
once('src/ui.js',
  "        panel.querySelector('#npc_state_v04_admission').value = settings.newNpcAdmissionMode || 'balanced';",
  "        panel.querySelector('#npc_state_v04_admission').value = settings.newNpcAdmissionMode || 'balanced';\n        panel.querySelector('#npc_state_v3_first_contact_follow_up').value = normalizeFirstContactFollowUpMode(settings.firstContactFollowUpMode);");
once('src/ui.js',
  "        bindCheck('#npc_state_v3_auto', 'autoScan');\n        panel.querySelector('#npc_state_v3_retry_auto_scan')?.addEventListener('click', () => void safely('Retry Auto Scan', retryAutoScan));",
  "        bindCheck('#npc_state_v3_auto', 'autoScan');\n        panel.querySelector('#npc_state_v3_retry_auto_scan')?.addEventListener('click', () => void safely('Retry Auto Scan', retryAutoScan));\n        panel.querySelector('#npc_state_v3_first_contact_follow_up')?.addEventListener('change', event => {\n            const settings = getSettings();\n            settings.firstContactFollowUpMode = normalizeFirstContactFollowUpMode(event.target.value);\n            event.target.value = settings.firstContactFollowUpMode;\n            persistSettings();\n            onSettingsChanged();\n        });");

once('src/dossier-view.js',
  '            <button type="button" class="menu_button npc-state-v3-toggle-diagnostics"><i class="fa-solid fa-stethoscope"></i> ${showDiagnostics ? \'Hide diagnostics\' : \'Show diagnostics\'}</button>',
  '            <button type="button" class="menu_button npc-state-v3-toggle-diagnostics"><i class="fa-solid fa-stethoscope"></i> ${showDiagnostics ? \'Hide diagnostics\' : \'Show diagnostics\'}</button>\n            <button class="menu_button npc-state-v3-recheck-missing" data-npc-id="${escapeHtml(npc.id)}"><i class="fa-solid fa-magnifying-glass"></i> Recheck missing details</button>');
once('src/ui.js',
  "        root.querySelector('.npc-state-v3-refresh')?.addEventListener('click', async event => {",
  `        root.querySelector('.npc-state-v3-recheck-missing')?.addEventListener('click', async event => {\n            const id = event.currentTarget.dataset.npcId;\n            event.currentTarget.disabled = true;\n            const result = await safely('missing-detail recheck', () => engine.recheckMissingDetails(id));\n            event.currentTarget.disabled = false;\n            const message = result.ok\n                ? (result.skipped ? 'NPC State: no eligible blank dossier fields to recheck.' : 'NPC State: current-exchange missing-detail recheck completed.')\n                : (result.reason === 'branch-unsafe' ? 'NPC State: timeline rebase required before rechecking.' : \`NPC State: missing-detail recheck did not commit (\${result.reason || 'unknown'}).\`);\n            notify(result.ok ? 'success' : 'warning', message);\n            refresh();\n        });\n        root.querySelector('.npc-state-v3-refresh')?.addEventListener('click', async event => {`);

once('src/scan-helpers.js',
  "        'PROFILE EVIDENCE: personality may be established narrowly from multiple reinforcing choices/reactions; one isolated gesture, mood, pose, or line does not prove a broad lifelong trait.',",
  "        'PROFILE EVIDENCE: personality and narrow behavior patterns may be established from multiple reinforcing choices/reactions/actions even in a first scene; one isolated gesture, mood, pose, or line remains tentative observation evidence, not a broad trait or recurring habit.',");
once('src/scan-helpers.js',
  "        'BEHAVIOR PROFILE EVIDENCE: MANNERISM SUFFICIENCY: behaviorProfile is what the NPC tends to do; explicit recurrence/generalization or multiple reinforcing actions can establish one narrow pattern even first-scene. One isolated action may support status/observation but must not be rewritten as a habitual behavior. mannerisms are repeated characteristic gestures/object-handling/social habits; multiple related instances may consolidate into one narrow mannerism; one isolated gesture is insufficient.',",
  "        'MANNERISM SUFFICIENCY: mannerisms are repeated characteristic gestures, object-handling, or social habits. Multiple related instances may consolidate into one narrow mannerism; a single sleeve-grab, tap, sweep, pose, or similar isolated action is insufficient and stays observation/live evidence.',");
once('src/scan-helpers.js',
  "        'BACKGROUND EVIDENCE: role=current function/title; background=durable affiliation/employment, origin, training, prior history, or lasting circumstance. A clearly established workplace or affiliation may populate background on first pass, even if it also supports role; do not mark background insufficient merely because role is populated. Never invent tenure, origin, family history, or earlier events.',",
  "        'BACKGROUND EVIDENCE: role=current function/title; background=durable affiliation/employment, origin, training, prior history, or lasting circumstance. A clearly established workplace or affiliation may populate background on first pass, even if it also supports role; do not mark background insufficient merely because role is populated. Never invent tenure, origin, family history, or earlier events.',\n        'LIVE GOAL: store the remaining objective after the current exchange. Completed registration, payment, delivery, explanation, or other finished action is not a live goal; a lasting consequence of that completion may instead qualify as memory when the memory rubric supports it.',");

once('src/scan-prompts.js',
  "export function buildFirstContactCompletionPrompt({ targets = [], chat, assistantMessageId, playerName = '', memoryCriteria = '', dossierLimits = {} }) {",
  "export function buildFirstContactCompletionPrompt({ targets = [], chat, assistantMessageId, playerName = '', memoryCriteria = '', dossierLimits = {}, scope = 'first-contact' }) {");
once('src/scan-prompts.js',
  '    const limits = normalizeDossierLimits(dossierLimits);\n    const rows =',
  "    const limits = normalizeDossierLimits(dossierLimits);\n    const manualRecheck = scope === 'manual';\n    const rows =");
once('src/scan-prompts.js',
  "        'You are NPC State performing a FIRST-CONTACT COMPLETION CHECK inside the same automatic Scan operation. Return exactly one valid JSON object, no markdown/commentary.',",
  "        manualRecheck\n            ? 'You are NPC State performing a MANUAL CURRENT-EXCHANGE MISSING-DETAIL RECHECK. Return exactly one valid JSON object, no markdown/commentary.'\n            : 'You are NPC State performing a FIRST-CONTACT COMPLETION CHECK inside the same automatic Scan operation. Return exactly one valid JSON object, no markdown/commentary.',");
once('src/scan-prompts.js',
  "        `ADMITTED TARGETS AND ONLY FIELDS TO RECHECK:\\n${JSON.stringify(rows)}`,\n        'Identity/admission already succeeded. Do not create NPCs, rename targets, revisit presence/activity, relationship scores/Current Dynamic, lifecycle, family/social graph, or any field not listed for that target.',",
  "        `${manualRecheck ? 'TARGET NPC AND ONLY FIELDS TO RECHECK' : 'ADMITTED TARGETS AND ONLY FIELDS TO RECHECK'}:\\n${JSON.stringify(rows)}`,\n        manualRecheck\n            ? 'The dossier already exists. Do not create/rename NPCs, revisit presence/activity, relationship scores/Current Dynamic, lifecycle, family/social graph, or any field not listed for the target.'\n            : 'Identity/admission already succeeded. Do not create NPCs, rename targets, revisit presence/activity, relationship scores/Current Dynamic, lifecycle, family/social graph, or any field not listed for that target.',");
once('src/scan-prompts.js',
  "        semanticAppend({ npcs: targetNpcs, mode: 'first-contact', sourceIds }),",
  "        semanticAppend({ npcs: targetNpcs, mode: manualRecheck ? 'manual-recheck' : 'first-contact', sourceIds }),");

rx('src/engine.js', /function firstContactFieldMissing\(npc = \{\}, field = ''\) \{[\s\S]*?\n\}\n\nfunction lifecycleNotice/, `function firstContactFieldMissing(npc = {}, field = '') {\n    const definition = dossierFieldDefinition(field);\n    if (!definition) return false;\n    const value = npc?.[field];\n    if (definition.kind === 'collection' || definition.kind === 'forms') return !Array.isArray(value) || value.length === 0;\n    const clean = String(value ?? '').trim();\n    return !clean || normalizeName(clean) === 'unknown';\n}\n\nfunction missingEvaluationFields(coverageDiagnostics = [], npcId = '') {\n    const out = new Set();\n    for (const row of Array.isArray(coverageDiagnostics) ? coverageDiagnostics : []) {\n        if (row?.npcId !== npcId) continue;\n        if (row.status === 'missing-npc-patch') {\n            for (const field of DOSSIER_SEMANTIC_FIELDS) out.add(field);\n            continue;\n        }\n        if (row.status !== 'incomplete-evaluation') continue;\n        for (const field of Array.isArray(row.missingFields) ? row.missingFields : []) out.add(field);\n    }\n    return out;\n}\n\nfunction firstContactCompletionTargets(beforeState = {}, afterState = {}, coverageDiagnostics = [], mode = 'off') {\n    if (mode === 'off') return [];\n    const existingIds = new Set((beforeState?.npcs || []).map(npc => npc?.id).filter(Boolean));\n    return (afterState?.npcs || []).filter(npc => npc?.id && !existingIds.has(npc.id)).map(npc => {\n        const missingEvaluations = missingEvaluationFields(coverageDiagnostics, npc.id);\n        const fields = DOSSIER_SEMANTIC_FIELDS.filter(field => firstContactFieldMissing(npc, field)\n            && (mode === 'recheck_unknown_fields' || missingEvaluations.has(field)));\n        return { npc, fields };\n    }).filter(target => target.fields.length);\n}\n\nfunction manualRecheckTargets(npc = {}) {\n    const fields = DOSSIER_SEMANTIC_FIELDS.filter(field => firstContactFieldMissing(npc, field));\n    return fields.length ? [{ npc, fields }] : [];\n}\n\nfunction filterFirstContactFieldEvaluations(value, allowed) {\n    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;\n    const out = {};\n    for (const key of ['unchanged', 'insufficient', 'unavailable']) {\n        const rows = [...new Set((Array.isArray(value[key]) ? value[key] : []).map(item => String(item || '').trim()).filter(field => allowed.has(field)))];\n        if (rows.length) out[key] = rows;\n    }\n    return Object.keys(out).length ? out : undefined;\n}\n\nfunction sanitizeFirstContactCompletionPayload(result = {}, targets = []) {\n    const byId = new Map();\n    const byName = new Map();\n    for (const target of Array.isArray(targets) ? targets : []) {\n        if (!target?.npc?.id) continue;\n        const row = { npc: target.npc, allowed: new Set(target.fields || []) };\n        byId.set(target.npc.id, row);\n        const name = normalizeName(target.npc.name);\n        if (name && !byName.has(name)) byName.set(name, row);\n    }\n    const npcs = [];\n    const seen = new Set();\n    const diagnostics = [];\n    for (const patch of Array.isArray(result?.npcs) ? result.npcs : []) {\n        const patchId = String(patch?.id || '').trim();\n        const target = byId.get(patchId);\n        if (!target) {\n            const named = byName.get(normalizeName(patch?.name));\n            diagnostics.push({ npcId: named?.npc?.id || '', status: 'identity-rejected', coverageKind: 'first-contact-completion', reason: patchId ? 'wrong-stable-id' : 'missing-stable-id' });\n            continue;\n        }\n        if (seen.has(target.npc.id)) {\n            diagnostics.push({ npcId: target.npc.id, status: 'identity-rejected', coverageKind: 'first-contact-completion', reason: 'duplicate-target-patch' });\n            continue;\n        }\n        seen.add(target.npc.id);\n        const semanticUpdates = (Array.isArray(patch?.semanticUpdates) ? patch.semanticUpdates : [])\n            .filter(update => target.allowed.has(String(update?.field || '').trim()))\n            .map(update => structuredClone(update));\n        const profileObservations = (Array.isArray(patch?.profileObservations) ? patch.profileObservations : [])\n            .filter(observation => target.allowed.has(String(observation?.field || '').trim()))\n            .map(observation => structuredClone(observation));\n        const fieldEvaluations = filterFirstContactFieldEvaluations(patch?.fieldEvaluations, target.allowed);\n        npcs.push({\n            id: target.npc.id,\n            name: target.npc.name,\n            ...(semanticUpdates.length ? { semanticUpdates } : {}),\n            ...(profileObservations.length ? { profileObservations } : {}),\n            ...(fieldEvaluations ? { fieldEvaluations } : {}),\n        });\n    }\n    return {\n        payload: { exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs, socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} },\n        diagnostics,\n    };\n}\n\nfunction auditFirstContactCompletion(payload = {}, targets = [], semanticDiagnostics = [], sanitizeDiagnostics = []) {\n    const diagnostics = [...(Array.isArray(sanitizeDiagnostics) ? sanitizeDiagnostics : [])];\n    const resolvedByNpc = new Map();\n    let requestedFields = 0;\n    let acceptedChanges = 0;\n    for (const target of Array.isArray(targets) ? targets : []) {\n        const npcId = target?.npc?.id;\n        const allowed = new Set(target?.fields || []);\n        requestedFields += allowed.size;\n        const resolved = new Set();\n        const patch = (payload?.npcs || []).find(row => row?.id === npcId);\n        if (!patch) {\n            diagnostics.push({ npcId, status: 'missing-npc-patch', missingFields: [...allowed], missingGroups: [], coverageKind: 'first-contact-completion' });\n            resolvedByNpc.set(npcId, resolved);\n            continue;\n        }\n        const invalidEvaluations = new Set((semanticDiagnostics || []).filter(row => row?.npcId === npcId && row?.status === 'invalid-field-evaluation').map(row => row?.field).filter(Boolean));\n        for (const status of ['unchanged', 'insufficient', 'unavailable']) {\n            for (const field of Array.isArray(patch?.fieldEvaluations?.[status]) ? patch.fieldEvaluations[status] : []) {\n                if (allowed.has(field) && !invalidEvaluations.has(field)) resolved.add(field);\n            }\n        }\n        const proposed = new Set((patch.semanticUpdates || []).map(row => String(row?.field || '').trim()).filter(field => allowed.has(field)));\n        for (const field of proposed) {\n            const accepted = (semanticDiagnostics || []).some(row => row?.npcId === npcId && row?.field === field && ['applied', 'no-change-proposed'].includes(row?.status));\n            if (accepted) resolved.add(field);\n            if ((semanticDiagnostics || []).some(row => row?.npcId === npcId && row?.field === field && row?.status === 'applied')) acceptedChanges += 1;\n        }\n        const missingFields = [...allowed].filter(field => !resolved.has(field));\n        if (missingFields.length) diagnostics.push({ npcId, status: 'incomplete-evaluation', missingFields, missingGroups: [], coverageKind: 'first-contact-completion' });\n        resolvedByNpc.set(npcId, resolved);\n    }\n    const resolvedFields = [...resolvedByNpc.values()].reduce((sum, fields) => sum + fields.size, 0);\n    return { diagnostics, resolvedByNpc, requestedFields, resolvedFields, acceptedChanges, remainingOutcomes: Math.max(0, requestedFields - resolvedFields) };\n}\n\nfunction reconcileCompletionCoverage(firstPass = [], completionAudit = null) {\n    if (!completionAudit) return Array.isArray(firstPass) ? structuredClone(firstPass) : [];\n    const out = [];\n    for (const original of Array.isArray(firstPass) ? firstPass : []) {\n        const resolved = completionAudit.resolvedByNpc.get(original?.npcId);\n        if (!resolved || original?.status !== 'incomplete-evaluation' || !Array.isArray(original.missingFields)) {\n            out.push(structuredClone(original));\n            continue;\n        }\n        const originalFields = original.missingFields.filter(Boolean);\n        const missingFields = originalFields.filter(field => !resolved.has(field));\n        const unresolvedGroups = new Set(missingFields.map(field => dossierFieldDefinition(field)?.group).filter(Boolean));\n        const originalFieldGroups = new Set(originalFields.map(field => dossierFieldDefinition(field)?.group).filter(Boolean));\n        const missingGroups = (Array.isArray(original.missingGroups) ? original.missingGroups : []).filter(group => !originalFieldGroups.has(group) || unresolvedGroups.has(group));\n        if (!missingFields.length && !missingGroups.length) continue;\n        out.push({ ...structuredClone(original), missingFields, missingGroups });\n    }\n    return [...out, ...structuredClone(completionAudit.diagnostics)];\n}\n\nfunction createProviderRequestBudget(limit = 2) {\n    return { limit: Math.max(1, Math.trunc(Number(limit) || 2)), count: 0, requests: [] };\n}\n\nfunction requestBudgetSnapshot(budget = null) {\n    if (!budget) return {};\n    const aggregate = budget.requests.reduce((sum, row) => ({ chars: sum.chars + (row.input?.chars || 0), tokenEstimate: sum.tokenEstimate + (row.input?.tokenEstimate || 0) }), { chars: 0, tokenEstimate: 0 });\n    return {\n        count: budget.count, limit: budget.limit, items: structuredClone(budget.requests),\n        aggregate: { ...aggregate, tokenEstimateKind: 'estimated', tokenEstimateMethod: FOREGROUND_TOKEN_ESTIMATE_METHOD, billedTokens: 'unavailable' },\n    };\n}\n\nfunction lifecycleNotice`);

rx('src/engine.js', /    async function invokeJson\(prompt, label = 'scan', signal = null\) \{[\s\S]*?\n    \}\n\n    async function invokeOperationJson\(prompt, label, operationId, signal = null\) \{[\s\S]*?\n    \}\n\n    async function scan/, `    async function invokeJson(prompt, label = 'scan', signal = null, { budget = null, operationId = '', purpose = label } = {}) {\n        const responseLength = normalizeScannerResponseTokens(getSettings().scannerResponseTokens);\n        const route = await resolveGenerationRoute({ label });\n        const request = async (requestPrompt, requestLabel, requestPurpose) => {\n            if (budget && budget.count >= budget.limit) {\n                const error = new Error(\`Provider request budget exhausted (\${budget.count}/\${budget.limit}).\`);\n                error.code = 'NPC_STATE_PROVIDER_REQUEST_BUDGET';\n                throw error;\n            }\n            if (budget) {\n                budget.count += 1;\n                budget.requests.push({ number: budget.count, purpose: requestPurpose, label: requestLabel, input: operationPromptMetadata(SCAN_SYSTEM_PROMPT + '\\n\\n' + requestPrompt) });\n                if (operationId) operationLog.patch(operationId, { requests: requestBudgetSnapshot(budget) });\n            }\n            return generate({ systemPrompt: SCAN_SYSTEM_PROMPT, prompt: requestPrompt, responseLength, label: requestLabel, route, signal });\n        };\n        let raw = await request(prompt, label, purpose);\n        try { return parseScanJson(raw, { requireLifeStateUpdates: true }); }\n        catch (firstError) {\n            const retryPrompt = prompt + '\\n\\nYour previous response was malformed. Return exactly one valid JSON object, no markdown and no commentary.';\n            try { raw = await request(retryPrompt, label + '-json-retry', purpose + '-json-retry'); }\n            catch (budgetError) { budgetError.cause = firstError; throw budgetError; }\n            try { return parseScanJson(raw, { requireLifeStateUpdates: true }); }\n            catch (secondError) { secondError.cause = firstError; throw secondError; }\n        }\n    }\n\n    async function invokeOperationJson(prompt, label, operationId, signal = null, requestOptions = {}) {\n        try { return await invokeJson(prompt, label, signal, { ...requestOptions, operationId }); }\n        catch (error) {\n            operationLog.finish(operationId, { status: 'failed', failure: { stage: 'model', reason: String(error?.message || error).slice(0, 300) } });\n            throw error;\n        }\n    }\n\n    async function scan`);

once('src/engine.js',
  "            const operationId = beginOperationDiagnostics(ownership, prompt);\n            onPhase?.('scanning');",
  "            const operationId = beginOperationDiagnostics(ownership, prompt);\n            const requestBudget = !manual ? createProviderRequestBudget(2) : null;\n            onPhase?.('scanning');");
once('src/engine.js',
  "                parsed = await invokeOperationJson(prompt, manual ? 'manual-current-cast' : 'automatic-current-cast', operationId, signal);",
  "                parsed = await invokeOperationJson(prompt, manual ? 'manual-current-cast' : 'automatic-current-cast', operationId, signal, requestBudget ? { budget: requestBudget, purpose: 'automatic-first-pass' } : {});");

rx('src/engine.js', /            if \(!manual\) \{\n                const completionTargets = firstContactCompletionTargets\(working, applied\.state\);[\s\S]*?\n            \}\n\n            applied\.state = trimStateRelationshipHistory/, `            if (!manual) {\n                const followUpMode = String(settings.firstContactFollowUpMode || 'off');\n                const completionTargets = firstContactCompletionTargets(working, applied.state, applied.coverageDiagnostics, followUpMode);\n                const followUp = {\n                    mode: followUpMode,\n                    status: followUpMode === 'off' ? 'off' : (completionTargets.length ? 'pending' : 'unnecessary'),\n                    targetCount: completionTargets.length,\n                    requestedFields: completionTargets.reduce((sum, target) => sum + target.fields.length, 0),\n                    acceptedChanges: 0,\n                    remainingOutcomes: 0,\n                };\n                if (completionTargets.length && requestBudget.count >= requestBudget.limit) {\n                    followUp.status = 'skipped-budget';\n                } else if (completionTargets.length) {\n                    const completionPrompt = buildFirstContactCompletionPrompt({\n                        targets: completionTargets, chat, assistantMessageId: messageId,\n                        playerName: resolvePlayerName('', chat, messageId),\n                        memoryCriteria: settings.memoryCriteria, dossierLimits: settings.dossierLimits,\n                    });\n                    try {\n                        const completionRaw = await invokeJson(completionPrompt, 'automatic-first-contact-completion', signal, { budget: requestBudget, operationId, purpose: 'first-contact-follow-up' });\n                        const postCompletionChat = getContext().chat || [];\n                        if (signal?.aborted || !operationOwnershipMatches(ownership) || (expectedSource && !sourceDescriptorMatches(expectedSource, chatKey, postCompletionChat, messageId))) {\n                            finishDiscardedOperation(operationId, signal?.aborted ? 'scan-cancelled' : 'stale-operation', 'post-first-contact-completion');\n                            return { ok: false, discarded: true, reason: signal?.aborted ? 'scan-cancelled' : 'stale-operation', messageId };\n                        }\n                        const sanitized = sanitizeFirstContactCompletionPayload(completionRaw, completionTargets);\n                        const completionApplied = applyScanResult(applied.state, sanitized.payload, {\n                            sourceMessageId: messageId, ...semanticSourceOptions, turn: working.turn,\n                            preservePresence: true, preserveObservation: true, applyRelationship: false, reconcileFamilyGraph: false,\n                            playerName: resolvePlayerName('', chat, messageId), dossierLimits: settings.dossierLimits,\n                            profileContext: profileContextForExchange(exchange), evidencePolicy,\n                            currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),\n                            birthdayFill: { mode: settings.birthdayFillMode, calendar: settings.birthdayRandomCalendar, fallbackDays: settings.birthdayRandomDaysPerMonth },\n                            applyReturnedNpcPatches: true,\n                        });\n                        const audit = auditFirstContactCompletion(sanitized.payload, completionTargets, completionApplied.semanticDiagnostics, sanitized.diagnostics);\n                        applied = {\n                            ...applied,\n                            state: completionApplied.state,\n                            semanticDiagnostics: [...(applied.semanticDiagnostics || []), ...(completionApplied.semanticDiagnostics || [])],\n                            coverageDiagnostics: reconcileCompletionCoverage(applied.coverageDiagnostics, audit),\n                        };\n                        followUp.status = 'ran';\n                        followUp.acceptedChanges = audit.acceptedChanges;\n                        followUp.remainingOutcomes = audit.remainingOutcomes;\n                    } catch (error) {\n                        if (signal?.aborted) {\n                            finishDiscardedOperation(operationId, 'scan-cancelled', 'first-contact-completion');\n                            return { ok: false, discarded: true, reason: 'scan-cancelled', messageId };\n                        }\n                        const reason = String(error?.message || error).slice(0, 300);\n                        followUp.status = 'failed';\n                        followUp.failure = reason;\n                        applied.coverageDiagnostics = [\n                            ...(applied.coverageDiagnostics || []),\n                            ...completionTargets.map(target => ({ npcId: target.npc.id, status: 'first-contact-completion-failed', coverageKind: 'first-contact-completion', reason })),\n                        ];\n                    }\n                }\n                operationLog.patch(operationId, { followUp, requests: requestBudgetSnapshot(requestBudget) });\n            }\n\n            applied.state = trimStateRelationshipHistory`);

once('src/engine.js', '    async function refreshDossier(reference) {', `    async function recheckMissingDetails(reference) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };\n        invalidate(chatKey);\n        return exclusive(chatKey, async () => {\n            const state = await loadChat(chatKey);\n            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state?.recovery) };\n            if (state?.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };\n            const npc = findNpcByReference(state, reference);\n            if (!npc) return { ok: false, reason: 'not-found' };\n            const chat = getContext().chat || [];\n            const messageId = latestAssistantMessageId(chat);\n            if (messageId < 0) return { ok: false, reason: 'no-assistant-message' };\n            const exchange = currentExchange(chat, messageId);\n            if (!exchange) return { ok: false, reason: 'not-assistant-message' };\n            const targets = manualRecheckTargets(npc);\n            if (!targets.length) return { ok: true, skipped: true, reason: 'no-eligible-blank-fields', npcId: npc.id, state: structuredClone(state) };\n            const ownership = captureOperationOwnership('recheck-missing-details', chatKey, chat, messageId);\n            const settings = getSettings();\n            const prompt = buildFirstContactCompletionPrompt({ targets, chat, assistantMessageId: messageId, playerName: resolvePlayerName('', chat, messageId), memoryCriteria: settings.memoryCriteria, dossierLimits: settings.dossierLimits, scope: 'manual' });\n            const operationId = beginOperationDiagnostics(ownership, prompt, { selectedNpcIds: [npc.id] });\n            const parsedRaw = await invokeOperationJson(prompt, 'manual-missing-detail-recheck-' + npc.id, operationId);\n            const liveChat = getContext().chat || [];\n            if (!operationOwnershipMatches(ownership)) {\n                finishDiscardedOperation(operationId, 'stale-operation', 'post-model');\n                return { ok: false, discarded: true, reason: 'stale-operation', npcId: npc.id };\n            }\n            const sanitized = sanitizeFirstContactCompletionPayload(parsedRaw, targets);\n            const evidencePolicy = buildExchangeEvidencePolicy(exchange);\n            const sourceIds = [exchange.user?.id, exchange.assistant?.id].filter(Number.isInteger);\n            const applied = applyScanResult(state, sanitized.payload, {\n                sourceMessageId: messageId, ...profileEvidenceSourceOptions(chatKey, liveChat, messageId, sourceIds), turn: state.turn,\n                preservePresence: true, preserveObservation: true, applyRelationship: false, reconcileFamilyGraph: false,\n                playerName: resolvePlayerName('', liveChat, messageId), dossierLimits: settings.dossierLimits,\n                profileContext: profileContextForExchange(exchange), evidencePolicy,\n                currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),\n                birthdayFill: { mode: settings.birthdayFillMode, calendar: settings.birthdayRandomCalendar, fallbackDays: settings.birthdayRandomDaysPerMonth },\n                applyReturnedNpcPatches: true,\n            });\n            const audit = auditFirstContactCompletion(sanitized.payload, targets, applied.semanticDiagnostics, sanitized.diagnostics);\n            applied.coverageDiagnostics = audit.diagnostics;\n            updateOperationFromApplication(operationId, applied);\n            operationLog.patch(operationId, { followUp: { mode: 'manual', status: 'ran', targetCount: 1, requestedFields: audit.requestedFields, acceptedChanges: audit.acceptedChanges, remainingOutcomes: audit.remainingOutcomes } });\n            const commit = await commitState({ token: ownership, operationId, state: applied.state, chat: liveChat, messageId, checkpointReason: 'manual-missing-detail-recheck' });\n            if (!commit.ok) return { ...commit, npcId: npc.id, semanticDiagnostics: applied.semanticDiagnostics || [], coverageDiagnostics: audit.diagnostics };\n            return { ok: true, npcId: npc.id, semanticDiagnostics: applied.semanticDiagnostics || [], coverageDiagnostics: audit.diagnostics, state: structuredClone(commit.state) };\n        });\n    }\n\n    async function refreshDossier(reference) {`);
once('src/engine.js', '        scan,\n        refreshDossier,', '        scan,\n        recheckMissingDetails,\n        refreshDossier,');
once('src/index.js', '    addNpc: name => engine.addNpc(name),', '    addNpc: name => engine.addNpc(name),\n    recheckMissingDetails: reference => engine.recheckMissingDetails(reference),');

once('src/post-response-coordinator.js',
  "            'first-contact-completion-failed',",
  "            'first-contact-completion-failed', 'identity-rejected', 'identity-unresolved',");

once('README.md', '## Release 0.5.32', '## Release 0.5.33');
rx('README.md', /0\.5\.32 makes first-contact creation more robust[\s\S]*?Deterministically generated birthdays remain internally tracked but are presented and supplied to normal scanner continuity as ordinary stable birthdays, without a `generated` label\./,
  '0.5.33 makes first-contact follow-up explicit instead of unconditional. **Off** is the default, including when the setting is absent on upgrade. **Missing evaluations only** rechecks only eligible blank fields on newly admitted NPCs that the first response neither proposed nor explicitly evaluated. **Recheck unknown fields** may also revisit eligible blanks explicitly marked insufficient. Any automatic follow-up uses the same complete current exchange, exact admitted stable IDs, existing locks/source validation, and the same final persistence/checkpoint boundary. A shared two-request budget includes malformed-JSON retries, so spending the retry budget skips follow-up rather than issuing a third request. Individual dossiers also offer a current-exchange-only **Recheck missing details** action that is distinct from historical Refresh. Deterministically generated birthdays remain internally tracked but are presented and supplied to normal scanner continuity as ordinary stable birthdays, without a `generated` label.');
once('README.md',
  '- **0.5.32:** add a new-admission-only current-exchange completion request inside the same automatic operation, and return deterministic birthday provenance to internal-only bookkeeping.',
  '- **0.5.32:** add a new-admission-only current-exchange completion request inside the same automatic operation, and return deterministic birthday provenance to internal-only bookkeeping.\n- **0.5.33:** make that follow-up optional with an Off default, exact target-field completion coverage, a shared two-request budget, per-request estimates, and a manual current-exchange missing-detail recheck.');
once('README.md',
  '`compact continuity -> visible roleplay response -> dedicated post-response scan -> optional new-admission completion -> validate/apply -> guarded persistence/checkpoint -> refresh continuity/UI`',
  '`compact continuity -> visible roleplay response -> dedicated post-response scan -> optional configured first-contact follow-up -> validate/apply -> guarded persistence/checkpoint -> refresh continuity/UI`');
once('README.md',
  'Roleplay generation does not emit `<npc_state_v1>` or other NPC JSON. Foreground injection is continuity-only. `autoScan=true` means one logical dedicated scan operation after each completed assistant revision. Ordinary existing-cast turns use one provider request; only a turn that actually admits a new NPC may use one additional bounded first-contact completion request before the same guarded commit. Duplicate host completion events share the same logical job; edits, swipes, deletion, branch changes, and chat switches invalidate stale work.',
  'Roleplay generation does not emit `<npc_state_v1>` or other NPC JSON. Foreground injection is continuity-only. `autoScan=true` means one logical dedicated scan operation after each completed assistant revision. With first-contact follow-up Off, a valid first response uses one provider request. When a follow-up mode is enabled, the same automatic operation may use one additional request for eligible newly admitted fields, but the shared cap is two requests total including malformed-JSON retries. Duplicate host completion events share the same logical job; edits, swipes, deletion, branch changes, and chat switches invalidate stale work.');
once('README.md',
  '- **Auto scan**: one dedicated post-response scan operation; newly admitted NPCs may receive one bounded current-exchange completion request before commit.',
  '- **Auto scan**: one dedicated post-response scan operation.\n- **First-contact follow-up**: Off by default; optionally recheck only missing evaluations or recheck eligible unknown fields for newly admitted NPCs. A follow-up consumes the same two-request automatic-operation budget and may find no additional information.');
once('README.md', '- Release label: **0.5.24**', '- Release label: **0.5.33**');

const oldCore = "Dedicated post-response scanning is the only automatic extraction operation. Normal roleplay generation receives continuity context only and never has to emit newly generated NPC JSON. When that operation admits a genuinely new NPC, it may make one bounded first-contact completion request before the single persistence/checkpoint boundary, limited to that newly admitted NPC's still-unresolved ordinary dossier fields and the same current exchange. This is not a recurring completeness scan: existing cast, activity/presence, relationships, lifecycle, graph state, history, and already-populated fields are outside its authority. Embedded extraction, automatic embedded fallback, general supplemental completeness requests, and historical backfill remain retired workflows. Manual Scan, targeted Refresh, and historical reconstruction keep their distinct scopes. Rollback enters the same commit boundary after a valid restored state has been selected.";
const newCore = "Dedicated post-response scanning is the only automatic extraction operation. Normal roleplay generation receives continuity context only and never has to emit newly generated NPC JSON. First-contact follow-up is one optional phase inside that same owned operation and defaults to Off, including when the setting is absent. Missing evaluations only targets eligible blank fields on successfully admitted new NPCs that the first response neither proposed nor explicitly evaluated; explicit insufficient, unavailable, and legitimate unchanged outcomes do not trigger it. Recheck unknown fields may reconsider eligible blank ordinary fields once, including explicit insufficient outcomes. Either mode uses exact stable IDs, only the same complete current USER + ASSISTANT exchange, existing field locks/source validation, and the same final persistence/checkpoint boundary; it never owns populated fields, identity, relationship scores/Current Dynamic, activity/presence, lifecycle, or family/social graph. Automatic operations have a shared maximum of two provider requests including malformed-JSON retries, so a consumed retry budget skips follow-up rather than issuing a third request. Manual Recheck missing details reuses this current-exchange target/validation path for one dossier and remains distinct from historical Refresh. Embedded extraction, automatic embedded fallback, general supplemental completeness requests, and historical backfill remain retired workflows. Manual Scan, targeted Refresh, and historical reconstruction keep their distinct scopes. Rollback enters the same commit boundary after a valid restored state has been selected.";
once('docs/core-contract.md', oldCore, newCore);

const cl = read('CHANGELOG.md');
const entry = `## 0.5.33\n\n- Make first-contact follow-up one canonical enum setting with **Off** as the default, including absent-setting upgrades. **Missing evaluations only** targets unaccounted eligible blanks on successfully admitted NPCs; **Recheck unknown fields** may also revisit eligible blanks explicitly marked insufficient.\n- Audit follow-up coverage against exact requested stable-ID/field pairs. Empty, wrong-ID, omitted, invalid, and rejected responses remain diagnostic; accepted repairs clear only the repaired first-pass omission and explicit insufficient/unavailable/unchanged are valid evaluated outcomes.\n- Bound automatic scans to two provider requests total across malformed-JSON retry and optional follow-up. Operation diagnostics record request purpose/count, estimated input characters/tokens per request, aggregate estimates, and follow-up outcome without presenting estimates as billed usage.\n- Add dossier **Recheck missing details**, a current-exchange-only manual action that reuses the same target construction, source validation, ordinary-field locks, persistence, and diagnostics while remaining distinct from historical Refresh.\n- Consolidate grounded first-scene guidance: isolated actions remain observations rather than habits, multiple reinforcing actions can establish a narrow pattern, lasting completed registration/access may qualify as memory, and live goals describe remaining objectives.\n- Remove the unconditional v0.5.32 completion dispatch and synthesized completion group coverage. Persisted suppression/rollback/replay tombstones and supported compatibility readers remain unchanged. Persisted schema remains version 1.\n\n`;
write('CHANGELOG.md', cl.replace('## 0.5.32\n', entry + '## 0.5.32\n'));

fs.rmSync('tests/v0532-first-contact-completion.test.mjs');
write('tests/v0533-optional-first-contact-recheck.test.mjs', String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { buildFirstContactCompletionPrompt } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { normalizeSettings } from '../src/settings.js';

const visible = 'A young woman in a wool waistcoat grips your sleeve, sets down a ledger, taps one thumbnail, later sweeps drying sand aside, and completes Lucien\'s provisional G1 registration.';
const assistant = `${visible}\n\n<Blocks><World_State>NPCs Present:\nTessa Morren:\n* G-Rank: N/A (Guild Intake Clerk)\n* Position: Behind the registration counter</World_State><NPC_Inner_Chatter>TESSA: I need this ledger closed by dusk.</NPC_Inner_Chatter></Blocks>`;
const chat = [
  { is_user: true, name: 'Lucien Noctis', mes: 'I enter the guild and approach the young woman receptionist.' },
  { is_user: false, name: 'Narrator', swipe_id: 0, mes: assistant },
];

function firstPayload({ goalEvaluation = null, includeGoal = false } = {}) {
  const insufficient = ['species','background','age','apparentAge','birthday','appearance','appearanceForms','behaviorProfile','speech','mannerisms','mood','currentForm','memories','keyRelationships'];
  if (goalEvaluation === 'insufficient') insufficient.push('goal');
  return {
    exchangeActiveNpcIds: ['Tessa Morren'], inChatNpcIds: ['Tessa Morren'], worldActiveNpcIds: [],
    npcs: [{
      id: '', name: 'Tessa Morren', identityKind: 'named', evaluatedGroups: ['canon','profile','live','memory','npcRelationships'],
      identityEvidence: { anchor: 'young woman in a wool waistcoat', excerpts: [visible], explanation: 'The visible receptionist is Tessa Morren in current World_State.' },
      activityEvidence: { exchangeActive: { excerpts: [visible], explanation: 'She handles Lucien intake.' }, inChat: { excerpts: [visible], explanation: 'She remains at the counter.' } },
      role: 'Guild intake clerk', personality: 'Brisk and efficient during guild intake.', location: 'Adventurer Guild Post', status: 'Handling the station intake backlog.',
      ...(includeGoal ? { goal: 'Close the intake ledger by dusk.' } : {}),
      relationshipChange: { evaluated: true, impact: 'none', delta: { trust:0, affection:0, desire:0, tension:0 }, axisEvidence: {}, reason: 'Initial professional interaction.' },
      relationshipSummary: 'Neutral professional clerk-to-adventurer interaction.',
      relationshipSummaryEvidence: { excerpts: [visible], explanation: 'A role-defined neutral first interaction.' },
      fieldEvaluations: { unchanged: [], insufficient, unavailable: [] },
    }],
    socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {},
  };
}

function completionPayload(id, { goal = true, evaluateGoal = false, extras = {} } = {}) {
  return {
    exchangeActiveNpcIds: ['wrong'], inChatNpcIds: ['wrong'], worldActiveNpcIds: ['wrong'],
    npcs: [{ id, name: 'Tessa Morren',
      ...(goal ? { semanticUpdates: [{ field: 'goal', operation: 'establish', value: 'Close the intake ledger by dusk.', sources: [{ messageId: 1, excerpt: 'TESSA: I need this ledger closed by dusk.' }] }] } : {}),
      ...(evaluateGoal ? { fieldEvaluations: { insufficient: ['goal'] } } : {}),
      ...extras,
    }], socialEdges: [{ from: id, to: 'somebody', relation: 'invented' }], familyFacts: [],
    lifeStateUpdates: [{ id, lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'invented' }], candidateAccounting: {},
  };
}

const latest = h => h.api.operationDiagnostics({ limit: 1 }).at(-1);

test('absent/default first-contact follow-up is Off and admission uses one provider request', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  h.context.generateRaw = async () => { h.metrics.generations += 1; return JSON.stringify(firstPayload()); };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  assert.equal(h.metrics.generations, 1);
  assert.equal(h.api.settings().firstContactFollowUpMode, 'off');
  assert.equal(latest(h).followUp.status, 'off');
  assert.equal(latest(h).requests.count, 1);
}), { state: createEmptyState('chat:actor.png:fixture') });

test('follow-up setting is one normalized enum and unknown values fail to Off', () => {
  assert.equal(normalizeSettings({}).firstContactFollowUpMode, 'off');
  assert.equal(normalizeSettings({ firstContactFollowUpMode: 'missing_evaluations' }).firstContactFollowUpMode, 'missing_evaluations');
  assert.equal(normalizeSettings({ firstContactFollowUpMode: 'recheck_unknown_fields' }).firstContactFollowUpMode, 'recheck_unknown_fields');
  assert.equal(normalizeSettings({ firstContactFollowUpMode: true }).firstContactFollowUpMode, 'off');
});

test('Missing evaluations only ignores explicit insufficient while Recheck unknown fields revisits it once', async t => {
  await t.test('missing evaluations mode', () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    h.context.generateRaw = async () => { h.metrics.generations += 1; return JSON.stringify(firstPayload({ goalEvaluation: 'insufficient' })); };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 1);
    assert.equal(latest(h).followUp.status, 'unnecessary');
  }, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));

  await t.test('recheck unknown mode', () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async ({ prompt }) => {
      h.metrics.generations += 1; calls += 1;
      if (calls === 1) return JSON.stringify(firstPayload({ goalEvaluation: 'insufficient' }));
      const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
      return JSON.stringify(completionPayload(id, { goal: false, evaluateGoal: true }));
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 2);
    assert.equal(latest(h).followUp.status, 'ran');
    assert.equal(latest(h).followUp.remainingOutcomes, 0);
  }, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'recheck_unknown_fields' } }));
});

test('existing NPCs never trigger automatic first-contact follow-up', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  const existing = h.persisted().npcs[0];
  h.context.generateRaw = async () => {
    h.metrics.generations += 1;
    const payload = firstPayload({ includeGoal: true });
    payload.npcs[0].id = existing.id;
    payload.npcs[0].identityKind = 'named';
    payload.candidateAccounting = { [existing.id]: 'evaluated' };
    return JSON.stringify(payload);
  };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  assert.equal(h.metrics.generations, 1);
  assert.equal(latest(h).followUp.status, 'unnecessary');
}), { state: (() => { const s = createEmptyState('chat:actor.png:fixture'); s.npcs.push(normalizeNpc({ id: 'npc-tessa', name: 'Tessa Morren', role: 'Guild intake clerk' })); return s; })(), settings: { firstContactFollowUpMode: 'recheck_unknown_fields' } });

test('successful narrow repair clears only repaired warning and preserves protected/focused state', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  let calls = 0;
  h.context.generateRaw = async ({ prompt }) => {
    h.metrics.generations += 1; calls += 1;
    if (calls === 1) return JSON.stringify(firstPayload());
    const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
    return JSON.stringify(completionPayload(id, { extras: { personality: 'overwrite', relationshipSummary: 'overwrite' } }));
  };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  const npc = h.persisted().npcs.find(row => row.name === 'Tessa Morren');
  assert.equal(npc.goal, 'Close the intake ledger by dusk.');
  assert.equal(npc.personality, 'Brisk and efficient during guild intake.');
  assert.equal(npc.relationshipSummary, 'Neutral professional clerk-to-adventurer interaction.');
  assert.deepEqual(npc.relationship, { trust:0, affection:0, desire:0, tension:0 });
  assert.equal(npc.lifeState, 'unknown');
  assert.equal(npc.present, true);
  assert.equal(npc.worldActive, false);
  assert.deepEqual(h.persisted().socialEdges, []);
  assert.equal(result.coverageDiagnostics.some(row => row?.missingFields?.includes('goal')), false);
  assert.ok(result.coverageDiagnostics.some(row => row?.missingFields?.includes('species')));
  const d = latest(h);
  assert.equal(d.requests.count, 2);
  assert.equal(d.requests.items[0].purpose, 'automatic-first-pass');
  assert.equal(d.requests.items[1].purpose, 'first-contact-follow-up');
  assert.ok(d.requests.aggregate.chars > d.requests.items[0].input.chars);
  assert.ok(d.requests.aggregate.tokenEstimate > d.requests.items[0].input.tokenEstimate);
  assert.equal(d.requests.aggregate.tokenEstimateKind, 'estimated');
  assert.equal(d.requests.aggregate.billedTokens, 'unavailable');
  assert.equal(d.followUp.acceptedChanges, 1);
  assert.equal(h.metrics.posts, 1);
}), { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } });

test('empty, wrong-id, and omitted-field completion responses stay partial', async t => {
  for (const kind of ['empty', 'wrong-id', 'omitted']) await t.test(kind, () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async ({ prompt }) => {
      h.metrics.generations += 1; calls += 1;
      if (calls === 1) return JSON.stringify(firstPayload());
      const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
      if (kind === 'empty') return JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} });
      if (kind === 'wrong-id') return JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: 'npc-wrong', name: 'Tessa Morren', fieldEvaluations: { insufficient: ['goal'] } }], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} });
      return JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id, name: 'Tessa Morren', fieldEvaluations: { insufficient: ['species'] } }], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} });
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.ok(result.coverageDiagnostics.some(row => ['missing-npc-patch','incomplete-evaluation'].includes(row.status) && row.coverageKind === 'first-contact-completion'));
    if (kind === 'wrong-id') assert.ok(result.coverageDiagnostics.some(row => row.status === 'identity-rejected' && row.reason === 'wrong-stable-id'));
    assert.equal(h.persisted().npcs[0].goal, '');
  }, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));
});

test('zero-change but fully evaluated requested fields is a valid completion', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  let calls = 0;
  h.context.generateRaw = async ({ prompt }) => {
    h.metrics.generations += 1; calls += 1;
    if (calls === 1) return JSON.stringify(firstPayload());
    const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
    const fields = JSON.parse(prompt.match(/"unresolvedFields":(\[[^\]]*\])/)?.[1] || '[]');
    return JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id, name: 'Tessa Morren', fieldEvaluations: { insufficient: fields } }], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} });
  };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  assert.equal(result.coverageDiagnostics.some(row => row.coverageKind === 'first-contact-completion' && ['missing-npc-patch','incomplete-evaluation'].includes(row.status)), false);
  assert.equal(latest(h).followUp.remainingOutcomes, 0);
}), { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } });

test('shared request budget spends malformed first-pass retry and skips follow-up', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  let calls = 0;
  h.context.generateRaw = async () => { h.metrics.generations += 1; calls += 1; return calls === 1 ? '{bad json' : JSON.stringify(firstPayload()); };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  assert.equal(h.metrics.generations, 2);
  const d = latest(h);
  assert.equal(d.requests.count, 2);
  assert.equal(d.requests.items[1].purpose, 'automatic-first-pass-json-retry');
  assert.equal(d.followUp.status, 'skipped-budget');
}), { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } });

test('malformed follow-up cannot make a third request and preserves first-pass data', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  let calls = 0;
  h.context.generateRaw = async () => { h.metrics.generations += 1; calls += 1; return calls === 1 ? JSON.stringify(firstPayload()) : '{bad completion'; };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  assert.equal(h.metrics.generations, 2);
  assert.equal(h.persisted().npcs[0].personality, 'Brisk and efficient during guild intake.');
  assert.ok(result.coverageDiagnostics.some(row => row.status === 'first-contact-completion-failed'));
  assert.equal(latest(h).followUp.status, 'failed');
}), { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } });

test('edit, swipe, and chat ownership changes during follow-up discard before combined persistence', async t => {
  for (const kind of ['edit','swipe','chat']) await t.test(kind, () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async ({ prompt }) => {
      h.metrics.generations += 1; calls += 1;
      if (calls === 1) return JSON.stringify(firstPayload());
      const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
      if (kind === 'edit') h.context.chat[1].mes += ' edited';
      if (kind === 'swipe') h.context.chat[1].swipe_id = 1;
      if (kind === 'chat') h.context.chatId = 'other-chat';
      return JSON.stringify(completionPayload(id));
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.discarded, true);
    assert.equal(h.persisted().npcs.length, 0);
    assert.equal(h.metrics.posts, 0);
  }, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));
});

test('manual Recheck missing details is current-exchange-only and isolated from focused state channels', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  const before = structuredClone(h.persisted().npcs[0]);
  h.context.generateRaw = async ({ prompt }) => {
    h.metrics.generations += 1;
    assert.match(prompt, /MANUAL CURRENT-EXCHANGE MISSING-DETAIL RECHECK/);
    assert.doesNotMatch(prompt, /OLDER REFERENCE CONTEXT|CHAT WINDOW/);
    return JSON.stringify(completionPayload(before.id));
  };
  const result = await h.api.recheckMissingDetails(before.id);
  assert.equal(result.ok, true);
  const npc = h.persisted().npcs[0];
  assert.equal(npc.goal, 'Close the intake ledger by dusk.');
  assert.equal(npc.relationshipSummary, before.relationshipSummary);
  assert.deepEqual(npc.relationship, before.relationship);
  assert.equal(npc.present, before.present);
  assert.equal(npc.worldActive, before.worldActive);
  assert.equal(npc.lifeState, before.lifeState);
  assert.deepEqual(h.persisted().socialEdges, []);
}), { state: (() => { const s = createEmptyState('chat:actor.png:fixture'); s.npcs.push(normalizeNpc({ id: 'npc-tessa', name: 'Tessa Morren', role: 'Guild intake clerk', personality: 'Brisk and efficient during guild intake.', present: true, worldActive: false, relationshipSummary: 'Neutral professional clerk-to-adventurer interaction.' })); return s; })() });

test('completion prompt remains exact-id/current-exchange scoped', () => {
  const npc = normalizeNpc({ id: 'npc-tessa', name: 'Tessa Morren' });
  const prompt = buildFirstContactCompletionPrompt({ targets: [{ npc, fields: ['goal','mood'] }], chat, assistantMessageId: 1, playerName: 'Lucien Noctis' });
  assert.match(prompt, /FIRST-CONTACT COMPLETION CHECK/);
  assert.match(prompt, /ONLY the complete CURRENT USER \+ ASSISTANT exchange/);
  assert.match(prompt, /ONLY FIELDS TO RECHECK/);
  assert.doesNotMatch(prompt, /OLDER REFERENCE CONTEXT|CHAT WINDOW/);
});
`);

console.log('Applied v0.5.33 patch');
