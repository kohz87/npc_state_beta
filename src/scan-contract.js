import { DOSSIER_EVALUATION_GROUPS, DOSSIER_FIELD_DEFINITIONS, DOSSIER_SEMANTIC_FIELDS } from './model/dossier-fields.js';
import { RELATIONSHIP_AXES } from './schema.js';

const CURRENT_DYNAMIC_EVIDENCE_RULE = 'CURRENT DYNAMIC EVIDENCE: new/changed relationshipSummary needs relationshipSummaryEvidence:{excerpts:[1-3 exact permitted quotes],explanation}. Ground THIS NPC->PLAYER interaction. Player binding is POV-independent: first-person USER, second-person ASSISTANT narration, explicit PLAYER name, or accepted exchangeActive identity/activity evidence. One excerpt may bind directly; a small coherent set may use connected accepted identity/activity evidence from the same permitted source and need not repeat an already accepted narrator quote; quoted you alone is insufficient; another addressee conflicts. zero numeric movement is allowed; explanation interprets the evidence.';

export const SCAN_OUTPUT_EXAMPLE_SCENES = Object.freeze({
    nia: 'Nia, a harbor clerk in her twenties at the South Quay Registry, wears a blue coat. She tells Ari “Registry first,” slides him the form, explains each entry, and checks his answers.',
    ivo: 'A current registrar note reads: “Ivo has green eyes. Asked about a copied total, he replied, ‘That line is wrong.’”',
});

// One envelope definition for prompt examples and the production response boundary.
export const SCAN_ARRAY_MEMBERS = Object.freeze({
    exchangeActiveNpcIds: 'reference', inChatNpcIds: 'reference', worldActiveNpcIds: 'reference',
    npcs: 'npc', socialEdges: 'object', familyFacts: 'object', lifeStateUpdates: 'object',
});
export const SCAN_IDENTITY_KINDS = Object.freeze(['named', 'role-label']);

export const SCAN_LIFECYCLE_EXAMPLE_ROW = Object.freeze({
    id: 'npc-ivo',
    lifeState: 'dead',
    lifeStateCertainty: 'explicit',
    lifeStateReason: 'Ivo died.',
});

export function emptyScanPayload() {
    return Object.fromEntries(Object.keys(SCAN_ARRAY_MEMBERS).map(key => [key, []]));
}

// Fictional examples are data, not templates with enum alternatives posing as values.
// The tests parse the exact serialized examples through the production parser.
export function scanOutputExamples({ includeNew = true, includeExisting = true } = {}) {
    const minimal = emptyScanPayload();
    const populated = emptyScanPayload();
    const zero = () => ({ evaluated: true, impact: 'none', delta: Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, 0])), axisEvidence: {}, reason: 'No relationship shift.' });
    if (includeNew) {
        const excerpt = SCAN_OUTPUT_EXAMPLE_SCENES.nia;
        const evidence = { excerpts: [excerpt], explanation: 'Nia directs Ari through registry intake.' };
        populated.exchangeActiveNpcIds.push('Nia');
        populated.inChatNpcIds.push('Nia');
        const nia = {
            id: '', name: 'Nia', identityKind: 'named', evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
            identityEvidence: { anchor: 'Nia', ...evidence }, activityEvidence: { exchangeActive: evidence, inChat: evidence },
            role: 'Harbor clerk', background: 'Clerk of the South Quay Registry.', apparentAge: '~20-29', appearance: 'Blue coat.',
            personality: 'Practical and methodical in registry work.', behaviorProfile: ['Guides applicants through forms and checks their entries.'],
            speech: 'Brief practical instructions.', status: 'Processing Ari’s registry form.',
            relationshipChange: zero(), relationshipSummary: 'Professional clerk-applicant interaction.', relationshipSummaryEvidence: evidence,
        };
        const proposed = new Set(Object.keys(nia));
        nia.fieldEvaluations = { unchanged: [], insufficient: DOSSIER_SEMANTIC_FIELDS.filter(field => !proposed.has(field)), unavailable: [] };
        populated.npcs.push(nia);
    }
    if (includeExisting) {
        const excerpt = SCAN_OUTPUT_EXAMPLE_SCENES.ivo;
        const groups = [...DOSSIER_EVALUATION_GROUPS];
        const accounted = new Set(['appearance']);
        populated.candidateAccounting = { ...(populated.candidateAccounting || {}), 'npc-ivo': 'evaluated' };
        populated.npcs.push({
            id: 'npc-ivo', name: 'Ivo', evaluatedGroups: groups,
            fieldEvaluations: {
                unchanged: [],
                insufficient: DOSSIER_SEMANTIC_FIELDS.filter(field => groups.includes(DOSSIER_FIELD_DEFINITIONS[field]?.group) && !accounted.has(field)),
                unavailable: [],
            },
            semanticUpdates: [{ field: 'appearance', operation: 'replace', value: 'Green eyes.', sources: [{ messageId: null, excerpt }], explanation: 'Current registrar note states Ivo’s eye color.' }],
            profileObservations: [{ field: 'speech', observation: 'Gave one brief factual correction in a reported exchange.', concept: 'Brief factual correction replies.', sources: [{ messageId: null, excerpt }] }],
        });
    }
    return { minimal, populated };
}

export function scanOutputContract(options = {}) {
    const examples = scanOutputExamples(options);
    const compact = options.compact === true;
    return [
        compact
            ? 'JSON: seven arrays required. NEW id="", canonical name, identityKind=named|role-label; EXISTING/name-only: keep supplied id. No alternate dialects.'
            : 'JSON: all seven arrays required, even empty. References=ids/names. NEW id="", name=canonical name, identityKind=' + SCAN_IDENTITY_KINDS.join('|') + '. EXISTING/name-only: keep supplied id. No canonicalName/activityRefs/live/relationshipToPlayer.',
        compact ? 'NEW ordinary fields are flat; []=string arrays; appearanceForms:[{name,appearance}].' : 'NEW: flat strings; map [] means string arrays; appearanceForms:[{name,appearance}].',
        compact
            ? 'candidateAccounting maps supplied stable existing NPC ids to evaluated|mentioned|inactive|unresolved; coverage only, never presence. NEW/EXISTING patches may add evidence-only profileObservations:[{field,observation,concept?,sources:[{messageId,excerpt}],explanation?}] for personality|behaviorProfile|speech|mannerisms.'
            : 'Routine candidateAccounting maps each supplied stable existing NPC id to evaluated|mentioned|inactive|unresolved; it is separate from activity and fieldEvaluations. NEW/EXISTING patches may add evidence-only profileObservations:[{field,observation,concept?,sources:[{messageId,excerpt}],explanation?}] for personality|behaviorProfile|speech|mannerisms.',
        compact
            ? 'Evidence={excerpts:[exact quotes],explanation}; identity adds anchor; activity keys=exchangeActive/inChat/worldActive; messageId:null=current.'
            : 'Evidence:{excerpts:[1-3 exact quotes],explanation}; identityEvidence adds anchor. activityEvidence keys:exchangeActive/inChat/worldActive. Identity/activity=current visible. Semantic/observation messageId:null=current, number=history.',
        compact ? '' : 'evaluatedGroups=map groups only. Modern coverage: each applicable ordinary field is proposed or listed once in fieldEvaluations unchanged|insufficient|unavailable; group labels never prove field evaluation.',
        'OUTPUT CONTRACT:\n' + JSON.stringify(examples.minimal),
        (compact
            ? 'VALID FICTIONAL EXAMPLE: populated NEW live/profile + zero-delta Current Dynamic + insufficient fields. Never copy facts/ids.\n'
            : 'VALID JSON EXAMPLE, fictional, never copy facts/ids: Nia shows grounded new-NPC live/profile facts and a zero-delta Current Dynamic; unsupported fields remain explicitly insufficient. Ivo is an evaluated but non-active existing dossier reconciled from a current registry note, with candidate and field coverage kept separate from presence.\n') + JSON.stringify(examples.populated),
        options.includeRelationship === false ? '' : (compact
            ? 'Relationship: impact=none|ordinary|meaningful|major|extreme; axes=trust|affection|desire|tension. Nonzero axes need axisEvidence. For each exchange-active NPC, relationshipSummary must be present: grounded text when supported, or "" when insufficient. Never invent intimacy. ' + CURRENT_DYNAMIC_EVIDENCE_RULE
            : 'Exchange-active NPCs evaluate relationshipChange: impact=none|ordinary|meaningful|major|extreme; axes=' + RELATIONSHIP_AXES.join('|') + '. Nonzero axes need axisEvidence:{axis:{excerpts,explanation}}; optional priority:[axes]. For every exchange-active NPC, include relationshipSummary: use grounded descriptive text when the Current Dynamic is established/changed, preserve already established unchanged text or use an empty string when insufficient. Never invent scores/intimacy. ' + CURRENT_DYNAMIC_EVIDENCE_RULE),
        'Rows (shape notation): socialEdges{from,to,relation,summary,provenance}; familyFacts{owner,relation,members,count,descriptor,evidence}; lifeStateUpdates{id|name,lifeState,lifeStateCertainty,lifeStateReason,livingReturn?}. lifeState alive|dead|unknown; certainty explicit|strong|uncertain; dead->alive needs livingReturn:true + grounded target-bound reason.',
        'Life row example: ' + JSON.stringify(SCAN_LIFECYCLE_EXAMPLE_ROW),
    ].filter(Boolean).join('\n');
}
