import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');

const from = `        if (has('lifeStateUpdates') && !scannerObjectArrayValid(parsed.lifeStateUpdates)) invalid.push('lifeStateUpdates[object]');`;
const to = `        // PHASE74B_REQUIRED_LIFE_STATE_UPDATES: parsed model responses must prove lifecycle evaluation explicitly.\n        if ((!allowOmittedSupplemental || has('lifeStateUpdates')) && !scannerObjectArrayValid(parsed.lifeStateUpdates)) invalid.push('lifeStateUpdates[object]');`;

if (!source.includes(to)) {
    if (!source.includes(from)) throw new Error('Missing v0.4.36 optional lifeStateUpdates validation anchor');
    source = source.replace(from, to);
}

fs.writeFileSync(path, source);
console.log('Required lifeStateUpdates in parsed NPC State v0.4.36 model responses');
