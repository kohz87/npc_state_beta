import fs from 'node:fs';

const path = 'beta/verify-phase42-relationship-history-remarks-0.4.21.mjs';
let source = fs.readFileSync(path, 'utf8');
const from = "html.indexOf('Relationship evaluation & scoring')";
const to = "html.indexOf('Relationship evaluation &amp; scoring')";
if (source.includes(from)) source = source.replaceAll(from, to);
else if (!source.includes(to)) throw new Error('Missing rendered relationship-scoring boundary marker');
fs.writeFileSync(path, source);
console.log('Aligned v0.4.21 history verifier with escaped dossier block title');
