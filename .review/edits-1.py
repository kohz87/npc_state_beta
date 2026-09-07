apply([
('src/foreground-contract.js', 'fb95208af60e2a66afcb51315bb6015613e04cad', [
(0, 2, r'''import { dossierFirstPassLiveFieldList } from './model/dossier-fields.js';
'''),
(3, 1, r'''import { dossierExtractionPromptRules } from './scan-helpers.js';
import { scanOutputContract } from './scan-contract.js';
'''),
(5, 1, r'''export const FOREGROUND_CONTRACT_VERSION = 6;
'''),
(9, 1, r'''    return source.length <= max ? source : source.slice(0, max - 1).trimEnd() + '\u2026';
'''),
(14, 3, r'''    if (policy === 'manual') return 'Admission=manual: no NEW dossiers; existing may update.';
    if (policy === 'named_preferred') return 'Admission=named_preferred: NEW requires an individually relevant proper name, identityKind="named".';
    return 'Admission=balanced: individually relevant named or uniquely identified unnamed NPCs only.';
'''),
(19, 1, r'''export function foregroundContract(settings = {}, { capture = true } = {}) {
'''),
(22, 1, r'''        'Private continuity. Preserve supplied identity, appearance, profile, relationships and current state; omission is not deletion.',
'''),
(24, 6, r''''''),
(32, 1, r'''        'Visible roleplay first, then one private <npc_state_v1>{JSON}</npc_state_v1> before Inventory. No fences/commentary.',
'''),
(34, 2, r''''''),
(37, 11, r'''        scanOutputContract(),
        'ACTIVITY: exchangeActive=acted/affected; inChat=participating at end; worldActive=off-screen. Mentions/crowds excluded. Active NPCs need patches. PLAYER excluded from NPC graph.',
        'ONE DOSSIER UPDATE PIPELINE: EXISTING ordinary changes use semanticUpdates only (establish|refine|replace|remove). Collections target ref/expected; [] never clears without grounded clear:true.',
        'PROFILE: temporary states/gestures are not durable traits/habits. Replace grounded obsolete placeholders. Scope form traits. age differs from apparentAge; replacing age needs ageKind birthday|elapsed|correction.',
        `FIRST-PASS LIVE STATE: ${dossierFirstPassLiveFieldList()}|currentForm compare supplied values; remove only if ended. status=condition/activity.`,
        'EVIDENCE: World_State:location/status; NPC_Inner_Chatter:mood/goal; otherwise visible narrative. Reference blocks never prove admission/activity/relationship events. Preserve locks/unrelated values; no replay.',
    ].join('\n');
'''),
]),
('src/foreground.js', 'ae026d9b7a0f5f8261b5d2e7d4551be1ca5ef817', [
(0, 1, r'''import { parseScanJson } from './scan-payload.js';
'''),
(2, 1, r'''const OPEN = /<npc_state_v1\b/i;
const MARKER = /<\/?npc_state_v1\b/i;
'''),
(21, 2, r'''    const firstOpen = MARKER.exec(source);
    if (!blocks.length && !firstOpen) return { found: false, cleanedText: source, parsed: null, raw: '', errors: [], errorCodes: [] };
'''),
(25, 0, r'''    const errorCodes = [];
'''),
(28, 1, r'''            cleanedText: OPEN.test(source) ? removeTruncatedTail(source) : tidy(source.replace(/<\/npc_state_v1\b[^>]*(?:>|$)/gi, '')),
'''),
(31, 1, r'''            errors: [OPEN.test(source) ? 'NPC State truncated-block: missing complete opening/closing tag.' : 'NPC State unmatched-closing-tag: no opening tag.'],
            errorCodes: [OPEN.test(source) ? 'truncated-block' : 'unmatched-closing-tag'],
'''),
(35, 1, r'''    if (blocks.length > 1) { errors.push('NPC State duplicate-blocks: multiple foreground blocks; entire update rejected.'); errorCodes.push('duplicate-blocks'); }
'''),
(42, 3, r'''    if (MARKER.test(cleanedText)) {
        const code = OPEN.test(cleanedText) ? 'truncated-block' : 'unmatched-closing-tag';
        errors.push(`NPC State ${code}: extra unmatched tag; entire update rejected.`);
        errorCodes.push(code);
        cleanedText = tidy(removeTruncatedTail(cleanedText).replace(/<\/npc_state_v1\b[^>]*(?:>|$)/gi, ''));
'''),
(50, 1, r'''        catch (error) { errors.push(...(Array.isArray(error?.issues) ? error.issues.map(issue => `${error.code}: ${issue}`) : [error instanceof Error ? error.message : String(error)])); errorCodes.push(error?.code || 'invalid-payload'); }
'''),
(52, 1, r'''    return { found: true, cleanedText, parsed, raw: errors.length ? source.slice(firstOpen.index) : raw, errors, errorCodes };
'''),
]),
('src/scan-contract.js', '27dcb62e612e05ceabf084f5f389bb7d7023c8af', [
(0, 0, r'''import { RELATIONSHIP_AXES } from './schema.js';

// One envelope definition for prompt examples and the production response boundary.
export const SCAN_ARRAY_MEMBERS = Object.freeze({
    exchangeActiveNpcIds: 'reference', inChatNpcIds: 'reference', worldActiveNpcIds: 'reference',
    npcs: 'npc', socialEdges: 'object', familyFacts: 'object', lifeStateUpdates: 'object',
});
export const SCAN_IDENTITY_KINDS = Object.freeze(['named', 'role-label']);

export function emptyScanPayload() {
    return Object.fromEntries(Object.keys(SCAN_ARRAY_MEMBERS).map(key => [key, []]));
}

// Fictional examples are data, not templates with enum alternatives posing as values.
// The tests parse the exact serialized examples through the production parser.
export function scanOutputExamples({ includeNew = true } = {}) {
    const minimal = emptyScanPayload();
    const populated = emptyScanPayload();
    const proof = text => ({ excerpts: [text], explanation: text });
    const zero = () => ({ evaluated: true, impact: 'none', delta: Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, 0])), axisEvidence: {}, reason: 'No new relationship shift.' });
    if (includeNew) {
        populated.exchangeActiveNpcIds.push('Nia');
        populated.inChatNpcIds.push('Nia');
        populated.npcs.push({
            id: '', name: 'Nia', identityKind: 'named',
            identityEvidence: { anchor: 'Nia', ...proof('Nia greets Ari.') },
            activityEvidence: { exchangeActive: proof('Nia greets Ari.'), inChat: proof('Nia greets Ari.') },
            appearance: 'Blue coat.', status: 'Greeting Ari.',
            relationshipChange: zero(), relationshipSummary: 'A new acquaintance of Ari.',
            relationshipSummaryEvidence: proof('Nia greets Ari.'),
        });
    }
    populated.npcs.push({
        id: 'npc-ivo', name: 'Ivo', evaluatedGroups: ['canon'],
        fieldEvaluations: { unchanged: ['age'], insufficient: ['background'], unavailable: ['personality'] },
        semanticUpdates: [{ field: 'appearance', operation: 'replace', value: 'Green eyes.', sources: [{ messageId: null, excerpt: 'Ivo has green eyes.' }], explanation: 'Ivo has green eyes.' }],
    });
    return { minimal, populated };
}

export function scanOutputContract(options = {}) {
    const examples = scanOutputExamples(options);
    return [
        'JSON: all seven arrays required, even empty. References=ids/names. NEW id="", name=canonical name, identityKind=' + SCAN_IDENTITY_KINDS.join('|') + '. EXISTING/name-only: keep supplied id. No canonicalName/activityRefs/live/relationshipToPlayer.',
        'NEW: flat strings; map [] means string arrays; appearanceForms:[{name,appearance}].',
        'Evidence:{excerpts:[1-3 exact quotes],explanation}; identityEvidence adds anchor. activityEvidence keys:exchangeActive/inChat/worldActive. Identity/activity=current visible. Semantic messageId:null=current, number=history.',
        'evaluatedGroups=map groups; fieldEvaluations=field ids.',
        'OUTPUT CONTRACT:\n' + JSON.stringify(examples.minimal),
        'VALID JSON EXAMPLE, fictional, never copy facts/ids: Nia in blue greets Ari. Ivo has green eyes, known age, no background evidence or personality context.\n' + JSON.stringify(examples.populated),
        options.includeRelationship === false ? '' : 'Exchange-active NPCs evaluate relationshipChange: impact=none|ordinary|meaningful|major|extreme; axes=' + RELATIONSHIP_AXES.join('|') + '. Nonzero axes need axisEvidence:{axis:{excerpts,explanation}}; optional priority:[axes]. Changed relationshipSummary needs relationshipSummaryEvidence even at zero delta. Never invent scores/intimacy.',
        'Row notation (NOT JSON): socialEdges:{from,to,relation,summary,provenance}; familyFacts:{owner,relation,members:[],count,descriptor,evidence}; lifeStateUpdates:{id,name,lifeState,lifeStateCertainty,lifeStateReason,livingReturn}. State=alive|dead|unknown; certainty=explicit|strong|uncertain; target-bound reason; dead-to-alive requires livingReturn:true.',
    ].filter(Boolean).join('\n');
}
'''),
]),
('src/scan-helpers.js', '149f2b27a8aed502b0228e268e965fcbc0a5235e', [
(56, 8, r''''''),
(67, 1, r'''        return `${group}:${fields.map(field => field + (DOSSIER_FIELD_DEFINITIONS[field].kind === 'collection' ? '[]' : '')).join(',')}`;
'''),
(73, 2, r'''    if (includeNew) modes.push('NEW: capture supported facts only; unknown is valid');
    if (includeExisting) modes.push('EXISTING: compare supplied context; semanticUpdates only');
'''),
(77, 2, r'''        'FIELD EVALUATION DETAIL: contextCoverage.unavailable/partial is hidden/truncated, NOT empty. Omission is not evaluation.',
        'PRIVATE COMPLETENESS CHECK: silently check all supported dossier facts and Current Dynamic before payload; no reasoning output.',
'''),
]),
('src/scan-payload.js', 'a2a0ab1b3acd5a898b5320bc55ce66a96c5187a2', [
(1, 0, r'''import { SCAN_ARRAY_MEMBERS, SCAN_IDENTITY_KINDS } from './scan-contract.js';
import { RELATIONSHIP_AXES } from './schema.js';
'''),
(2, 2, r'''const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const identity = value => typeof value === 'string' && Boolean(value.trim());
const strings = value => Array.isArray(value) && value.every(identity);
// Existing classifications only. These aliases never constitute admission evidence.
const LEGACY_IDENTITY_KINDS = Object.freeze({ 'proper-name': 'named', proper: 'named', role: 'role-label', unnamed: 'role-label' });
const DRIFT_KEYS = Object.freeze({ canonicalName: 'name', activityRefs: 'activityEvidence', live: 'flat dossier fields', relationshipToPlayer: 'relationshipChange with canonical axes and evidence' });

function payloadError(code, details) {
    const issues = details.slice(0, 12).map(value => String(value).slice(0, 240));
    return Object.assign(new Error(`NPC State ${code}: ${issues.join('; ')}`), { code, issues });
'''),
(6, 22, r'''function npcIssues(npc, index, issues) {
    const path = `npcs[${index}]`;
    if (!object(npc)) { issues.push(`${path}: expected object-with-string-identity`); return; }
    for (const field of ['id', 'name']) if (has(npc, field) && typeof npc[field] !== 'string') issues.push(`${path}.${field}: expected string`);
    if (!identity(npc.id) && !identity(npc.name) && !(Array.isArray(npc.aliases) && npc.aliases.some(identity))) {
        issues.push(`${path}: object-with-string-identity requires id or name (NEW id:"", name:"canonical name")`);
    }
    if (has(npc, 'aliases') && (!Array.isArray(npc.aliases) || !npc.aliases.every(alias => typeof alias === 'string'))) issues.push(`${path}.aliases: expected string array`);
    if (has(npc, 'identityKind') && !SCAN_IDENTITY_KINDS.includes(npc.identityKind) && !has(LEGACY_IDENTITY_KINDS, npc.identityKind)) {
        issues.push(`${path}.identityKind: expected ${SCAN_IDENTITY_KINDS.join('|')}, not ${String(npc.identityKind).slice(0, 40)}`);
    }
    for (const [field, canonical] of Object.entries(DRIFT_KEYS)) if (has(npc, field)) issues.push(`${path}.${field}: unsupported; use ${canonical}`);
    for (const field of ['semanticUpdates', 'evaluatedGroups']) if (has(npc, field) && !Array.isArray(npc[field])) issues.push(`${path}.${field}: expected array`);
    for (const field of ['identityEvidence', 'activityEvidence', 'fieldEvaluations', 'relationshipSummaryEvidence', 'relationshipChange']) {
        if (has(npc, field) && !object(npc[field])) issues.push(`${path}.${field}: expected object`);
    }
    const delta = npc.relationshipChange?.delta;
    if (delta !== undefined) {
        if (!object(delta)) issues.push(`${path}.relationshipChange.delta: expected axis object`);
        else for (const [axis, value] of Object.entries(delta)) {
            if (!RELATIONSHIP_AXES.includes(axis)) issues.push(`${path}.relationshipChange.delta.${axis}: unsupported axis (no automatic mapping)`);
            else if (typeof value !== 'number' || !Number.isFinite(value)) issues.push(`${path}.relationshipChange.delta.${axis}: expected finite number`);
        }
    }
'''),
(31, 3, r'''    if (!object(parsed)) throw payloadError('wrong-root', ['JSON must be an object']);
    const presentKey = has(parsed, 'inChatNpcIds') ? 'inChatNpcIds' : 'finalPresentNpcIds';
'''),
(35, 10, r'''        const missing = [], invalid = [];
        for (const [member, type] of Object.entries(SCAN_ARRAY_MEMBERS)) {
            const key = member === 'inChatNpcIds' ? presentKey : member;
            const required = ['exchangeActiveNpcIds', 'inChatNpcIds', 'npcs'].includes(member)
                || (['familyFacts', 'lifeStateUpdates'].includes(member) ? requireLifeStateUpdates : !allowOmittedSupplemental);
            if (!has(parsed, key)) { if (required) missing.push(`${member}: missing required array`); continue; }
            const value = parsed[key];
            if (!Array.isArray(value)) { invalid.push(`${member}: expected array, including [] when empty`); continue; }
            if (value.length > 100) invalid.push(`${member}: exceeds 100 entries; entire payload rejected`);
            if (type === 'reference' && !strings(value)) invalid.push(`${member}: expected nonempty string references`);
            if (type === 'npc') value.slice(0, 100).forEach((npc, index) => npcIssues(npc, index, invalid));
            if (type === 'object' && !value.every(object)) invalid.push(`${member}: expected objects only`);
        }
        if (has(parsed, 'inChatNpcIds') && has(parsed, 'finalPresentNpcIds')
            && JSON.stringify(parsed.inChatNpcIds) !== JSON.stringify(parsed.finalPresentNpcIds)) invalid.push('inChatNpcIds/finalPresentNpcIds: conflicting presence arrays');
        if (missing.length || invalid.length) throw payloadError(invalid.length ? 'invalid-structure' : 'missing-required-members', [...missing, ...invalid]);
'''),
(48, 1, r'''        finalPresentNpcIds: uniqueStrings(parsed[presentKey]),
'''),
(50, 1, r'''        npcs: Array.isArray(parsed.npcs) ? parsed.npcs.slice(0, 100).map(npc => {
            if (object(npc) && has(LEGACY_IDENTITY_KINDS, npc.identityKind)) return { ...npc, identityKind: LEGACY_IDENTITY_KINDS[npc.identityKind] };
            return npc;
        }) : [],
'''),
(59, 5, r'''    if (!text) throw payloadError('empty-response', ['scanner returned no JSON']);
    // A complete surrounding JSON fence is supported for older separate scanners.
    // Never slice out braces: trailing garbage or an incomplete outer object must fail.
    const fence = /^\x60\x60\x60(?:json)?\s*\n?([\s\S]*?)\s*\x60\x60\x60$/i.exec(text);
    const body = fence ? fence[1].trim() : text;
'''),
(65, 2, r'''    try { parsed = JSON.parse(body); }
    catch (error) {
        const detail = String(error?.message || error);
        const position = /position (\d+)/i.exec(detail);
        const truncated = /unexpected end|unterminated string/i.test(detail) || (position && Number(position[1]) >= body.length);
        throw payloadError(truncated ? 'truncated-json' : 'json-syntax', [detail]);
    }
'''),
]),
('src/scan-prompts.js', 'a485d5cc189cdf32d02587f61afbee3224230fed', [
(1, 1, r'''import { scanOutputContract } from './scan-contract.js';
'''),
(4, 1, r'''import { dossierExtractionPromptRules, relationshipSummaryRepairContext, compactText, containsNormalizedPhrase, currentExchange, nonSystemMessages, resolvePlayerName } from './scan-helpers.js';
'''),
(103, 20, r''''''),
(137, 1, r''''''),
(178, 1, r'''        scanOutputContract(),
'''),
(219, 5, r'''        ...dossierExtractionPromptRules({ includeNew: false }),
        scanOutputContract({ includeNew: false, includeRelationship: false }),
'''),
(255, 1, r'''        scanOutputContract({ includeNew: false }),
'''),
(282, 4, r''''''),
]),
])
