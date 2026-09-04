import fs from 'node:fs';

const path = 'v03/age-progression.js';
let source = fs.readFileSync(path, 'utf8');
const from = `            for (let j = Math.max(0, index - 2); j <= Math.min(tokens.length - 1, index + 3); j += 1) {`;
const to = `            const afterWindow = name === 'scar' ? 4 : 3;
            for (let j = Math.max(0, index - 2); j <= Math.min(tokens.length - 1, index + afterWindow); j += 1) {`;
if (!source.includes(from)) throw new Error('Missing structural descriptor window marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Extended scar descriptor preservation through local location anatomy');
