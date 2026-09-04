import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function rep(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase 8F marker: ' + label);
    return source.replace(from, to);
}

let progression = read('v03/age-progression.js');
progression = rep(progression,
`        const found = [];
        for (let j = Math.max(0, i - 2); j < i; j += 1) if (COLORS.has(tokens[j])) found.push(tokens[j]);
        if (found.length) colors.set(target, [...new Set(found)].sort().join('+'));`,
`        const found = [];
        // Support both adjective-before-noun (silver hair) and predicate/after-noun
        // wording (hair is silver) so short canonical descriptions cannot bypass color
        // preservation merely by changing grammar.
        for (let j = Math.max(0, i - 2); j <= Math.min(tokens.length - 1, i + 2); j += 1) {
            if (j !== i && COLORS.has(tokens[j])) found.push(tokens[j]);
        }
        if (found.length) colors.set(target, [...new Set(found)].sort().join('+'));`,
'bidirectional color extraction');

progression = rep(progression,
`    const structure = new Set(STRUCTURE.filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
    const magic = new Set(MAGIC.filter(marker => new RegExp('\\\\b' + marker + '\\\\b', 'i').test(text)));
    const core = new Set(tokens.filter(token => token.length >= 3 && !COMMON.has(token) && !MUTABLE.has(token)));
    return { text, colors, structure, magic, core };`,
`    const structure = new Set(STRUCTURE.filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
    const magic = new Set(MAGIC.filter(marker => new RegExp('\\\\b' + marker + '\\\\b', 'i').test(text)));
    const core = new Set(tokens.filter(token => token.length >= 3 && !COMMON.has(token) && !MUTABLE.has(token)));
    const structuralDescriptors = new Map();
    const sizeWords = new Set(['small','smaller','large','larger','long','longer','short','shorter','tiny','huge','broad','broader','narrow','narrower']);
    const connectorWords = new Set(['at','on','in','of','with','and','or','the','a','an']);
    for (const [name, pattern] of STRUCTURE) {
        if (!pattern.test(text)) continue;
        const positions = [];
        for (let i = 0; i < tokens.length; i += 1) {
            const singular = tokens[i].replace(/s$/, '');
            if (singular === name || (name === 'prosthetic' && tokens[i].startsWith('prosthetic'))) positions.push(i);
        }
        const descriptors = new Set();
        for (const index of positions) {
            for (let j = Math.max(0, index - 2); j <= Math.min(tokens.length - 1, index + 3); j += 1) {
                if (j === index) continue;
                const token = tokens[j];
                if (token.length < 3 || connectorWords.has(token) || sizeWords.has(token) || COLORS.has(token) || TARGETS.has(token)) continue;
                descriptors.add(token);
            }
        }
        if (descriptors.size) structuralDescriptors.set(name, descriptors);
    }
    return { text, colors, structure, magic, core, structuralDescriptors };`,
'structural descriptor signature');

progression = rep(progression,
`    if (!sameSet(current.structure, proposed.structure) || !sameSet(current.magic, proposed.magic)) return false;
    const visualAge =`,
`    if (!sameSet(current.structure, proposed.structure) || !sameSet(current.magic, proposed.magic)) return false;
    // Preserve stable local descriptors around structural canon. Size words may evolve
    // with biological maturation, but pointed->rounded ears, slender->thick horns, or a
    // scar moving to a different location are not authorized by age progression alone.
    for (const name of current.structure) {
        const before = current.structuralDescriptors.get(name) || new Set();
        const after = proposed.structuralDescriptors.get(name) || new Set();
        if (!before.size) continue;
        let overlap = 0;
        for (const token of before) if (after.has(token)) overlap += 1;
        if (!overlap || overlap / before.size < 0.5) return false;
    }
    const visualAge =`,
'structural descriptor preservation');
write('v03/age-progression.js', progression);

let scanner = read('v03/scanner.js');
scanner = rep(scanner,
`        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, patch?.appearanceFormChanges, String(options.profileContext || ''), ageProgression, npc, patch);`,
`        const effectiveFormChanges = legacyBaseBefore && locked.has('appearance')
            ? (Array.isArray(patch?.appearanceFormChanges) ? patch.appearanceFormChanges : []).filter(raw => normalizeName(raw?.name) !== 'base')
            : patch?.appearanceFormChanges;
        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, effectiveFormChanges, String(options.profileContext || ''), ageProgression, npc, patch);`,
'legacy Base mirror lock');
write('v03/scanner.js', scanner);

console.log('Hardened NPC State 0.4.3 age-progression protected traits and legacy Base lock semantics');
