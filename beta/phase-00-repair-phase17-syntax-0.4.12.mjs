import fs from 'node:fs';

const path = 'beta/phase17-second-order-hardening-0.4.12.mjs';
let source = fs.readFileSync(path, 'utf8');
const bad = '^${}()';
const fixed = '^$(){}';
if (!source.includes(bad) && !source.includes(fixed)) throw new Error('Missing phase17 regex syntax marker');
source = source.replace(bad, fixed);
fs.writeFileSync(path, source);
console.log('Repaired v0.4.12 phase17 template-literal regex syntax before execution');
