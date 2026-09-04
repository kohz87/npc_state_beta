import { normalizeAppearanceForms } from './schema.js';

function clean(value, max = 5000) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function key(value) {
    return clean(value, 5000).normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ').trim();
}

export function appearanceFormByName(npc = {}, name = '') {
    const wanted = key(name);
    if (!wanted) return null;
    return normalizeAppearanceForms(npc?.appearanceForms).find(form => key(form?.name) === wanted) || null;
}

export function appearanceFormDescription(npc = {}, name = '') {
    return clean(appearanceFormByName(npc, name)?.appearance, 5000);
}

export function appearanceScalarIsLegacyBase(npc = {}) {
    const scalar = clean(npc?.appearance, 5000);
    const base = appearanceFormDescription(npc, 'Base');
    return Boolean(scalar && base && key(scalar) === key(base));
}

export function resolvedCurrentAppearance(npc = {}) {
    const scalar = clean(npc?.appearance, 5000);
    const current = appearanceFormByName(npc, npc?.currentForm);
    const specific = clean(current?.appearance, 5000);
    if (!specific) return scalar;

    // Once the old scalar ordinary body has been copied into Base it is no longer a
    // cross-form shared description. Do not leak Base anatomy into Beast/Dragon/etc.
    if (appearanceScalarIsLegacyBase(npc)) return specific;
    if (!scalar || key(scalar) === key(specific)) return specific || scalar;
    return scalar + '; ' + specific;
}
