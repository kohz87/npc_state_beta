import { DOSSIER_EVALUATION_GROUPS, DOSSIER_SEMANTIC_FIELDS } from './model/dossier-fields.js';
import { RELATIONSHIP_AXES } from './schema.js';

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
export function scanOutputExamples({ includeNew = true, includeExisting = true } = {}) {
    const minimal = emptyScanPayload();
    const populated = emptyScanPayload();
    const proof = text => ({ excerpts: [text], explanation: 'Nia tells Ari to register.' });
    const zero = () => ({ evaluated: true, impact: 'none', delta: Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, 0])), axisEvidence: {}, reason: 'No relationship shift.' });
    if (includeNew) {
        const evidence = 'Nia, harbor clerk in blue, tells Ari “Registry first,” slides the form back when he hesitates, says “Next line,” and taps the signature box.';
        populated.exchangeActiveNpcIds.push('Nia');
        populated.inChatNpcIds.push('Nia');
        const nia = {
            id: '', name: 'Nia', identityKind: 'named', evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
            identityEvidence: { anchor: 'Nia', ...proof(evidence) },
            activityEvidence: { exchangeActive: proof(evidence), inChat: proof(evidence) },
            role: 'Harbor clerk', appearance: 'Blue coat.', personality: 'Brisk and impatiently task-focused during professional intake.',
            behaviorProfile: ['Keeps intake moving with direct instructions and little ceremony.'], speech: 'Brief practical instructions.',
            mannerisms: ['Observed tapping the signature box.'], mood: 'Businesslike.', location: 'Harbor desk.', goal: 'Register Ari.', status: 'Processing registry.',
            relationshipChange: zero(), relationshipSummary: 'Professional clerk-applicant interaction.', relationshipSummaryEvidence: proof(evidence),
        };
        const proposed = new Set(Object.keys(nia));
        nia.fieldEvaluations = { unchanged: [], insufficient: DOSSIER_SEMANTIC_FIELDS.filter(field => !proposed.has(field)), unavailable: [] };
        populated.npcs.push(nia);
    }
    if (includeExisting) populated.npcs.push({
        id: 'npc-ivo', name: 'Ivo', evaluatedGroups: ['canon'], fieldEvaluations: { unchanged: ['age'], insufficient: ['background'], unavailable: ['personality'] },
        semanticUpdates: [{ field: 'appearance', operation: 'replace', value: 'Green eyes.', sources: [{ messageId: null, excerpt: 'Ivo has green eyes.' }], explanation: 'Ivo has green eyes.' }],
        profileObservations: [{
            field: 'speech', observation: 'Uses brief factual corrections during registry work.', concept: 'Brief factual correction replies.',
            sources: [{ messageId: null, excerpt: 'Ivo says, “That line is wrong.”' }], explanation: 'A grounded speech observation that does not itself force a Speech update.',
        }],
    });
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
            ? 'candidateAccounting maps supplied stable existing NPC ids to evaluated|mentioned|inactive|unresolved; coverage only, never presence. Existing patches may add evidence-only profileObservations:[{field,observation,concept?,sources:[{messageId,excerpt}],explanation?}] for personality|behaviorProfile|speech|mannerisms.'
            : 'Routine candidateAccounting maps each supplied stable existing NPC id to evaluated|mentioned|inactive|unresolved; it is separate from activity and fieldEvaluations. Existing patches may add evidence-only profileObservations:[{field,observation,concept?,sources:[{messageId,excerpt}],explanation?}] for personality|behaviorProfile|speech|mannerisms.',
        compact
            ? 'Evidence={excerpts:[exact quotes],explanation}; identity adds anchor; activity keys=exchangeActive/inChat/worldActive; messageId:null=current.'
            : 'Evidence:{excerpts:[1-3 exact quotes],explanation}; identityEvidence adds anchor. activityEvidence keys:exchangeActive/inChat/worldActive. Identity/activity=current visible. Semantic/observation messageId:null=current, number=history.',
        compact ? '' : 'evaluatedGroups=map groups only. Modern coverage: each applicable ordinary field is proposed or listed once in fieldEvaluations unchanged|insufficient|unavailable; group labels never prove field evaluation.',
        'OUTPUT CONTRACT:\n' + JSON.stringify(examples.minimal),
        (compact
            ? 'VALID FICTIONAL EXAMPLE: populated NEW live/profile + zero-delta Current Dynamic + insufficient fields. Never copy facts/ids.\n'
            : 'VALID JSON EXAMPLE, fictional, never copy facts/ids: Nia shows a narrowly evidenced first-scene personality plus live/profile facts and a zero-delta Current Dynamic; unsupported fields remain explicitly insufficient. Ivo shows existing semantic update and field outcomes.\n') + JSON.stringify(examples.populated),
        options.includeRelationship === false ? '' : (compact
            ? 'Relationship: impact=none|ordinary|meaningful|major|extreme; axes=trust|affection|desire|tension. Nonzero axes need axisEvidence. For each exchange-active NPC, relationshipSummary must be present: grounded text when a Current Dynamic is supported, or "" when evaluated but insufficient; changed text needs exact evidence. Never invent intimacy.'
            : 'Exchange-active NPCs evaluate relationshipChange: impact=none|ordinary|meaningful|major|extreme; axes=' + RELATIONSHIP_AXES.join('|') + '. Nonzero axes need axisEvidence:{axis:{excerpts,explanation}}; optional priority:[axes]. For every exchange-active NPC, include relationshipSummary: use grounded descriptive text when the Current Dynamic is established/changed, preserve an already established unchanged dynamic by returning the same text or use an empty string when current evidence is insufficient to establish one. Changed relationshipSummary needs relationshipSummaryEvidence even at zero delta. Never invent scores/intimacy.'),
        compact
            ? 'Graph/life rows (not JSON examples): socialEdges from,to,relation,summary,provenance; familyFacts owner,relation,members,count,descriptor,evidence; lifeStateUpdates id/name,state,certainty,reason,livingReturn. dead->alive needs livingReturn:true.'
            : 'Row notation (NOT JSON): socialEdges:{from,to,relation,summary,provenance}; familyFacts:{owner,relation,members:[],count,descriptor,evidence}; lifeStateUpdates:{id,name,lifeState,lifeStateCertainty,lifeStateReason,livingReturn}. State=alive|dead|unknown; certainty=explicit|strong|uncertain; target-bound reason; dead-to-alive requires livingReturn:true.',
    ].filter(Boolean).join('\n');
}
