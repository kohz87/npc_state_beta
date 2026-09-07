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
