import fs from 'node:fs';

const path = 'v03/evidence-adapter.js';
let source = fs.readFileSync(path, 'utf8');
if (!source.includes('IDENTITY BRIDGE / ENRICHMENT:')) {
    if (!source.includes('IDENTITY ENRICHMENT:')) throw new Error('Missing v0.4.27 identity enrichment prompt marker');
    source = source.replace('IDENTITY ENRICHMENT:', 'IDENTITY BRIDGE / ENRICHMENT:');
}
fs.writeFileSync(path, source);
console.log('Preserved legacy IDENTITY BRIDGE prompt marker for v0.4.27');
