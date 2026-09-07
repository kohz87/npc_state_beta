export const DOSSIER_FIELD_DEFINITIONS = Object.freeze({
    role: { kind: 'scalar', durability: 'durable', group: 'canon' },
    species: { kind: 'scalar', durability: 'durable', group: 'canon' },
    background: { kind: 'scalar', durability: 'durable', group: 'canon' },
    age: { kind: 'scalar', durability: 'durable', group: 'canon' },
    apparentAge: { kind: 'scalar', durability: 'durable', group: 'canon' },
    birthday: { kind: 'scalar', durability: 'durable', group: 'canon' },
    appearance: { kind: 'scalar', durability: 'durable', group: 'canon' },
    appearanceForms: { kind: 'forms', durability: 'durable', group: 'canon' },
    personality: { kind: 'scalar', durability: 'durable', group: 'profile' },
    behaviorProfile: { kind: 'collection', durability: 'durable', group: 'profile' },
    speech: { kind: 'scalar', durability: 'durable', group: 'profile' },
    mannerisms: { kind: 'collection', durability: 'durable', group: 'profile' },
    mood: { kind: 'scalar', durability: 'live', group: 'live' },
    location: { kind: 'scalar', durability: 'live', group: 'live' },
    goal: { kind: 'scalar', durability: 'live', group: 'live' },
    status: { kind: 'scalar', durability: 'live', group: 'live' },
    currentForm: { kind: 'scalar', durability: 'live', group: 'live' },
    memories: { kind: 'collection', durability: 'durable', group: 'memory' },
    keyRelationships: { kind: 'collection', durability: 'durable', group: 'npcRelationships' },
});

export const DOSSIER_SEMANTIC_FIELDS = Object.freeze(Object.keys(DOSSIER_FIELD_DEFINITIONS));
export const DOSSIER_EVALUATION_GROUPS = Object.freeze(['canon', 'profile', 'live', 'memory', 'npcRelationships']);
export const DOSSIER_SCALAR_FIELDS = Object.freeze(DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field].kind === 'scalar'));
export const DOSSIER_COLLECTION_FIELDS = Object.freeze(DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field].kind === 'collection'));
export const DOSSIER_FORM_FIELDS = Object.freeze(DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field].kind === 'forms'));
export const DOSSIER_DURABLE_FIELDS = Object.freeze(DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field].durability === 'durable'));
export const DOSSIER_LIVE_FIELDS = Object.freeze(DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field].durability === 'live'));

export function dossierFieldDefinition(field) {
    return DOSSIER_FIELD_DEFINITIONS[String(field || '').trim()] || null;
}

export function dossierFieldGroup(field) {
    return dossierFieldDefinition(field)?.group || '';
}

export function dossierSemanticFieldList() {
    return DOSSIER_SEMANTIC_FIELDS.join('|');
}
