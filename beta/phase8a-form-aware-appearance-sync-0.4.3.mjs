import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function rep(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase 8A marker: ' + label);
    return source.replace(from, to);
}

// Shared appearance resolution lives in one small module so UI, injection, portraits,
// and backend legacy-Base synchronization all agree on the same semantics.
write('v03/appearance.js', `import { normalizeAppearanceForms } from './schema.js';

function clean(value, max = 5000) {
    return String(value ?? '').replace(/\\s+/g, ' ').trim().slice(0, max);
}

function key(value) {
    return clean(value, 5000).normalize('NFKC').toLocaleLowerCase().replace(/[\\s\\p{P}\\p{S}]+/gu, ' ').trim();
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
`);

let scanner = read('v03/scanner.js');
scanner = rep(scanner,
`import { evidenceReferenceScope, hasRecognizedStructuredBlocks, scannerEvidenceText, structuredEvidencePromptRules } from './evidence-adapter.js';`,
`import { evidenceReferenceScope, hasRecognizedStructuredBlocks, scannerEvidenceText, structuredEvidencePromptRules } from './evidence-adapter.js';
import { appearanceFormDescription, appearanceScalarIsLegacyBase } from './appearance.js';`,
'scanner appearance helper import');

scanner = rep(scanner,
`    if (!locked.has('appearance')) {
        const appearance = String(patch?.appearance ?? '').trim();
        const incomingForms = normalizeAppearanceForms(patch?.appearanceForms);
        const formAware = Boolean((next.appearanceForms || []).length || incomingForms.length || String(patch?.currentForm || '').trim());
        // Ordinary appearance is durable canon too. Multi-form NPCs keep the shared/base
        // summary, while non-transforming NPCs need grounded canonChanges to revise an
        // already-established body description.
        if (appearance && !next.appearance) next.appearance = appearance;
        else if (appearance && !formAware && durableCanonDecision(npc, patch, 'appearance', appearance, options)) next.appearance = appearance;
    }`,
`    if (!locked.has('appearance')) {
        const appearance = String(patch?.appearance ?? '').trim();
        // appearance remains durable canon for both ordinary and form-aware NPCs. A form
        // switch alone never reaches this branch, but a grounded canonChanges.appearance
        // revision may update genuinely shared/common appearance even when forms exist.
        if (appearance && !next.appearance) next.appearance = appearance;
        else if (appearance && durableCanonDecision(npc, patch, 'appearance', appearance, options)) next.appearance = appearance;
    }`,
'form-aware shared appearance authority');

scanner = rep(scanner,
`    if (!locked.has('appearanceForms')) {
        const incomingForms = normalizeAppearanceForms(patch?.appearanceForms);
        const existingForms = normalizeAppearanceForms(next.appearanceForms);
        const hasBase = existingForms.some(form => normalizeName(form.name) === 'base');
        const wantsBase = normalizeName(patch?.currentForm) === 'base';
        const firstAlternate = !existingForms.length && incomingForms.length > 0;
        // Preserve the legacy ordinary body as Base when alternates first appear. Also
        // repair an already-half-migrated dossier on rescan: if an older scan captured
        // only Beast/another alternate but the new scan explicitly says the NPC ended
        // back in Base, recover Base from the pre-existing canonical appearance.
        if (!hasBase && (firstAlternate || wantsBase) && String(npc.appearance || '').trim()) {
            next.appearanceForms = [...existingForms, { name: 'Base', appearance: String(npc.appearance).trim() }];
        }
        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, patch?.appearanceFormChanges, String(options.profileContext || ''));
    }`,
`    if (!locked.has('appearanceForms')) {
        const incomingForms = normalizeAppearanceForms(patch?.appearanceForms);
        const existingForms = normalizeAppearanceForms(next.appearanceForms);
        const hasBase = existingForms.some(form => normalizeName(form.name) === 'base');
        const wantsBase = normalizeName(patch?.currentForm) === 'base';
        const firstAlternate = !existingForms.length && incomingForms.length > 0;
        const legacyBaseBefore = appearanceScalarIsLegacyBase(npc);
        const previousBaseAppearance = appearanceFormDescription(npc, 'Base');
        // Preserve the legacy ordinary body as Base when alternates first appear. Also
        // repair an already-half-migrated dossier on rescan: if an older scan captured
        // only Beast/another alternate but the new scan explicitly says the NPC ended
        // back in Base, recover Base from the pre-existing canonical appearance.
        if (!hasBase && (firstAlternate || wantsBase) && String(npc.appearance || '').trim()) {
            next.appearanceForms = [...existingForms, { name: 'Base', appearance: String(npc.appearance).trim() }];
        }
        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, patch?.appearanceFormChanges, String(options.profileContext || ''));

        // v0.4.1 copied the old scalar ordinary appearance into Base for compatibility.
        // If that duplicated Base is authoritatively revised later, keep the legacy scalar
        // synchronized only while it is still the same old Base. Once the scalar diverges
        // into genuine shared/common traits it becomes independent and is never overwritten.
        const revisedBaseAppearance = appearanceFormDescription(next, 'Base');
        if (!locked.has('appearance')
            && legacyBaseBefore
            && previousBaseAppearance
            && revisedBaseAppearance
            && normalizeName(previousBaseAppearance) !== normalizeName(revisedBaseAppearance)
            && normalizeName(next.appearance) === normalizeName(previousBaseAppearance)) {
            next.appearance = revisedBaseAppearance;
        }
    }`,
'legacy Base synchronization');
write('v03/scanner.js', scanner);

let injection = read('v03/injection.js');
injection = rep(injection,
`import { structuredEvidencePromptRules } from './evidence-adapter.js';
import { normalizeNpcAdmissionMode } from './schema.js';`,
`import { structuredEvidencePromptRules } from './evidence-adapter.js';
import { resolvedCurrentAppearance } from './appearance.js';
import { normalizeNpcAdmissionMode } from './schema.js';`,
'injection appearance helper import');
injection = rep(injection,
`        field('Current form', npc.currentForm), field('Appearance', npc.appearance), field('Known physical forms', appearanceFormsText(npc)),`,
`        field('Current form', npc.currentForm), field('Current appearance', resolvedCurrentAppearance(npc)),
        field('Shared / ordinary appearance', npc.appearance), field('Known physical forms', appearanceFormsText(npc)),`,
'injection resolved appearance fields');
write('v03/injection.js', injection);

let portrait = read('v03/portrait-prompt.js');
portrait = `import { resolvedCurrentAppearance as currentFormAppearance } from './appearance.js';\n` + portrait;
const oldPortraitResolver = `function currentFormAppearance(npc = {}) {
    const current = inlineText(npc.currentForm, 80).toLocaleLowerCase();
    const forms = Array.isArray(npc.appearanceForms) ? npc.appearanceForms : [];
    const form = current ? forms.find(item => inlineText(item?.name, 80).toLocaleLowerCase() === current) : null;
    const general = inlineText(npc.appearance, 3000);
    const specific = inlineText(form?.appearance, 3000);
    return [general, specific].filter(Boolean).join('; ');
}

`;
portrait = rep(portrait, oldPortraitResolver, '', 'portrait local resolver removal');
write('v03/portrait-prompt.js', portrait);

let dossier = read('v03/dossier-view.js');
dossier = `import { resolvedCurrentAppearance } from './appearance.js';\n` + dossier;
dossier = rep(dossier,
`            \${npc.currentForm ? currentFact('Current form', npc.currentForm) : ''}
          </div>`,
`            \${npc.currentForm ? currentFact('Current form', npc.currentForm) : ''}
            \${currentFact('Current appearance', resolvedCurrentAppearance(npc))}
          </div>`,
'dossier current appearance');
dossier = rep(dossier,
`            \${block('Appearance', paragraphHtml(npc.appearance))}
            \${(npc.appearanceForms || []).length ? block('Appearance forms', appearanceFormsHtml(npc), 'npc-state-v3-block-wide') : ''}`,
`            \${block('Shared / ordinary appearance', paragraphHtml(npc.appearance))}
            \${(npc.appearanceForms || []).length ? block('Appearance forms', appearanceFormsHtml(npc), 'npc-state-v3-block-wide') : ''}`,
'dossier shared appearance label');
write('v03/dossier-view.js', dossier);

console.log('Applied NPC State 0.4.3 phase 8A form-aware appearance synchronization');
