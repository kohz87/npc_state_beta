import fs from 'node:fs';

const path = 'beta/verify-form-aware-appearance-0.4.1.mjs';
let source = fs.readFileSync(path, 'utf8');
source = source.replace(
    '// Ordinary non-transforming NPCs retain legacy appearance replacement behavior.',
    '// In 0.4.3 ordinary non-transforming NPCs remain non-form-aware, but established appearance is durable canon.'
);
const from = "assert(mira.appearance === 'Auburn hair now tied back.', 'Form-aware support changed ordinary NPC appearance behavior');";
const to = "assert(mira.appearance === 'Auburn hair worn loose.', '0.4.3 durable canon allowed casual ordinary appearance drift');";
if (!source.includes(from)) throw new Error('Missing legacy ordinary-appearance assertion');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Aligned legacy form regression with 0.4.3 durable ordinary appearance canon');
