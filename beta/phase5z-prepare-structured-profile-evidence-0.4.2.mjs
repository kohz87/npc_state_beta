import fs from 'node:fs';

const path = 'v03/engine.js';
let source = fs.readFileSync(path, 'utf8');
const from = "        rows.push(String(message.mes || '').slice(0, 8000));";
const to = "        rows.push(profileEvidenceText(message.mes || '').slice(0, 8000));";
if (!source.includes(from)) throw new Error('Missing Phase 6 profile-history preparation marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Prepared visible-only profile history for Phase 6 evidence adapter');
