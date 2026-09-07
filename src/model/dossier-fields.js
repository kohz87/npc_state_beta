export const DOSSIER_SEMANTIC_OPERATIONS = Object.freeze(['establish', 'refine', 'replace', 'remove']);

function fieldContract({
    kind,
    durability,
    group,
    normalization,
    evidence = 'visible-narrative',
    structuredContext = '',
    firstPass = false,
}) {
    return Object.freeze({
        kind,
        durability,
        group,
        normalization,
        evidence,
        structuredContext,
        firstPass,
        operations: DOSSIER_SEMANTIC_OPERATIONS,
        manualOwnership: 'manualProfileFields',
    });
}

export const DOSSIER_FIELD_DEFINITIONS = Object.freeze({
    role: fieldContract({ kind: 'scalar', durability: 'durable', group: 'canon', normalization: 'text:240' }),
    species: fieldContract({ kind: 'scalar', durability: 'durable', group: 'canon', normalization: 'text:160' }),
    background: fieldContract({ kind: 'scalar', durability: 'durable', group: 'canon', normalization: 'text:1600' }),
    age: fieldContract({ kind: 'scalar', durability: 'durable', group: 'canon', normalization: 'normalizeActualAge' }),
    apparentAge: fieldContract({ kind: 'scalar', durability: 'durable', group: 'canon', normalization: 'normalizeApparentAge' }),
    birthday: fieldContract({ kind: 'scalar', durability: 'durable', group: 'canon', normalization: 'normalizeBirthday' }),
    appearance: fieldContract({ kind: 'scalar', durability: 'durable', group: 'canon', normalization: 'text:1800' }),
    appearanceForms: fieldContract({ kind: 'forms', durability: 'durable', group: 'canon', normalization: 'normalizeAppearanceForms' }),
    personality: fieldContract({ kind: 'scalar', durability: 'durable', group: 'profile', normalization: 'text:1200' }),
    behaviorProfile: fieldContract({ kind: 'collection', durability: 'durable', group: 'profile', normalization: 'bounded-list:behaviorProfile' }),
    speech: fieldContract({ kind: 'scalar', durability: 'durable', group: 'profile', normalization: 'text:900' }),
    mannerisms: fieldContract({ kind: 'collection', durability: 'durable', group: 'profile', normalization: 'bounded-list:mannerisms' }),
    mood: fieldContract({ kind: 'scalar', durability: 'live', group: 'live', normalization: 'text:240', evidence: 'visible-narrative|npc-inner-chatter', structuredContext: 'semanticPrivateContext', firstPass: true }),
    location: fieldContract({ kind: 'scalar', durability: 'live', group: 'live', normalization: 'text:360', evidence: 'visible-narrative|world-state', structuredContext: 'semanticWorldContext', firstPass: true }),
    goal: fieldContract({ kind: 'scalar', durability: 'live', group: 'live', normalization: 'text:600', evidence: 'visible-narrative|npc-inner-chatter', structuredContext: 'semanticPrivateContext', firstPass: true }),
    status: fieldContract({ kind: 'scalar', durability: 'live', group: 'live', normalization: 'normalizeCurrentStatus', evidence: 'visible-narrative|world-state', structuredContext: 'semanticWorldContext', firstPass: true }),
    currentForm: fieldContract({ kind: 'scalar', durability: 'live', group: 'live', normalization: 'appearance-form-name' }),
    memories: fieldContract({ kind: 'collection', durability: 'durable', group: 'memory', normalization: 'normalizeMemoryEntries' }),
    keyRelationships: fieldContract({ kind: 'collection', durability: 'durable', group: 'npcRelationships', normalization: 'normalizeKeyRelationshipEntries' }),
});

export const DOSSIER_SEMANTIC_FIELDS = Object.freeze(Object.keys(DOSSIER_FIELD_DEFINITIONS));
export const DOSSIER_EVALUATION_GROUPS = Object.freeze(['canon', 'profile', 'live', 'memory', 'npcRelationships']);
export const DOSSIER_SCALAR_FIELDS = Object.freeze(DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field].kind === 'scalar'));
export const DOSSIER_COLLECTION_FIELDS = Object.freeze(DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field].kind === 'collection'));
export const DOSSIER_FORM_FIELDS = Object.freeze(DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field].kind === 'forms'));
export const DOSSIER_DURABLE_FIELDS = Object.freeze(DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field].durability === 'durable'));
export const DOSSIER_LIVE_FIELDS = Object.freeze(DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field].durability === 'live'));
export const DOSSIER_FIRST_PASS_LIVE_FIELDS = Object.freeze(DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field].firstPass === true));

export function dossierFieldDefinition(field) {
    return DOSSIER_FIELD_DEFINITIONS[String(field || '').trim()] || null;
}

export function dossierFieldGroup(field) {
    return dossierFieldDefinition(field)?.group || '';
}

export function dossierFieldManualProtected(npc, field) {
    if (!dossierFieldDefinition(field)) return false;
    // Manual corrections are preserved across rollback separately. Only an explicit
    // field lock is allowed to suppress future automatic semantic evolution.
    return (Array.isArray(npc?.manualProfileFields) ? npc.manualProfileFields : []).includes(field);
}

export function dossierSemanticFieldList() {
    return DOSSIER_SEMANTIC_FIELDS.join('|');
}

export function dossierFirstPassLiveFieldList() {
    return DOSSIER_FIRST_PASS_LIVE_FIELDS.join('|');
}
