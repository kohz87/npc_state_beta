import fs from 'node:fs';

const path = 'v03/evidence-adapter.js';
let source = fs.readFileSync(path, 'utf8');
if (!source.includes('IDENTITY BRIDGE:')) {
    if (!source.includes('IDENTITY ENRICHMENT:')) throw new Error('Missing v0.4.27 identity enrichment prompt marker');
    source = source.replace(
        'IDENTITY ENRICHMENT:',
        'IDENTITY BRIDGE: public identity enrichment remains optional corroboration.',
    );
}
if (!source.includes('World_State without an independent visible introduction still cannot create a dossier')) {
    const marker = "The public anchor remains mandatory. World_State, NPC_Inner_Chatter, CYOA, or other reference material without a public anchor cannot manufacture a dossier or missing identity.";
    if (!source.includes(marker)) throw new Error('Missing v0.4.27 public-anchor invariant');
    source = source.replace(
        marker,
        marker + ' World_State without an independent visible introduction still cannot create a dossier.',
    );
}
fs.writeFileSync(path, source);
console.log('Preserved legacy IDENTITY BRIDGE invariants for v0.4.27');
