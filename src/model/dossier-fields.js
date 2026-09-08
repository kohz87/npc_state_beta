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


function plainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const NUMERIC_SCALAR_COMPAT_FIELDS = new Set(['age', 'apparentAge']);
const COLLECTION_TEXT_KEYS = Object.freeze({
    behaviorProfile: ['text', 'value', 'summary', 'description', 'behavior', 'trait', 'label', 'name'],
    mannerisms: ['text', 'value', 'summary', 'description', 'mannerism', 'behavior', 'trait', 'label', 'name'],
    memories: ['text', 'value', 'summary', 'description', 'memory', 'label', 'name'],
    keyRelationships: ['name', 'npc', 'person', 'target', 'otherNpc', 'other', 'with', 'character', 'relationship', 'relation', 'type', 'kind', 'role', 'tie', 'summary', 'description', 'details', 'note'],
});

function collectionObjectIssue(field, value) {
    if (!plainObject(value)) return 'expected-supported-object';
    const keys = COLLECTION_TEXT_KEYS[field] || [];
    let supportedText = false;
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        if (typeof value[key] !== 'string') return `${key}-expected-string`;
        if (value[key].trim()) supportedText = true;
    }
    return supportedText ? '' : 'expected-supported-text-property';
}

export function dossierCollectionMemberText(field, value, max = 700) {
    if (typeof value === 'string') return value.replace(/\u0000/g, '').trim().slice(0, max);
    if (!plainObject(value) || field === 'keyRelationships') return '';
    for (const key of COLLECTION_TEXT_KEYS[field] || []) {
        const candidate = value[key];
        if (typeof candidate !== 'string') continue;
        const clean = candidate.replace(/\u0000/g, '').trim().slice(0, max);
        if (clean) return clean;
    }
    return '';
}

export function normalizeDossierTextCollection(field, values, max = 12, itemMax = 700) {
    const definition = dossierFieldDefinition(field);
    if (definition?.kind !== 'collection' || field === 'keyRelationships') return [];
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(values) ? values : []) {
        const clean = dossierCollectionMemberText(field, raw, itemMax);
        const key = clean.normalize('NFKC').toLocaleLowerCase();
        if (!clean || !key || seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
        if (out.length >= max) break;
    }
    return out;
}

function appearanceFormsIssue(value) {
    const rows = Array.isArray(value)
        ? value
        : (plainObject(value) ? Object.entries(value).map(([name, appearance]) => ({ name, appearance })) : null);
    if (!rows) return 'expected-form-array-or-map';
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (!plainObject(row)) return `form-${index}-expected-object`;
        const name = row.name ?? row.form ?? row.label;
        const appearance = row.appearance ?? row.description ?? row.text;
        if (typeof name !== 'string' || !name.trim()) return `form-${index}-expected-string-name`;
        if (typeof appearance !== 'string' || !appearance.trim()) return `form-${index}-expected-string-appearance`;
    }
    return '';
}

export function dossierFieldValueIssue(field, value) {
    const definition = dossierFieldDefinition(field);
    if (!definition) return 'unsupported-field';
    if (definition.kind === 'scalar') {
        if (NUMERIC_SCALAR_COMPAT_FIELDS.has(field) && typeof value === 'number' && Number.isFinite(value) && value >= 0) return '';
        return typeof value === 'string' ? '' : 'expected-string-value';
    }
    if (definition.kind === 'collection') {
        if (!Array.isArray(value)) return 'expected-array-value';
        for (let index = 0; index < value.length; index += 1) {
            const item = value[index];
            if (typeof item === 'string') continue;
            const issue = collectionObjectIssue(field, item);
            if (!issue) continue;
            return `member-${index}-${issue}`;
        }
        return '';
    }
    if (definition.kind === 'forms') return appearanceFormsIssue(value);
    return 'unsupported-field-kind';
}

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
