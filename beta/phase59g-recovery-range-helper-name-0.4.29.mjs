import fs from 'node:fs';

const path = 'v03/engine.js';
let source = fs.readFileSync(path, 'utf8');

if (source.includes('recoveryRangeForChat')) {
    source = source.replaceAll('recoveryRangeForChat', 'computeRecoveryRangeForChat');
} else if (!source.includes('computeRecoveryRangeForChat')) {
    throw new Error('Missing v0.4.29 recovery range planner helper');
}

const publicCount = (source.match(/function recoveryRange\s*\(/g) || []).length;
if (publicCount !== 1) throw new Error('Expected one public recoveryRange declaration after helper rename, found ' + publicCount);
fs.writeFileSync(path, source);
console.log('Renamed v0.4.29 recovery range planner helper to keep the public recoveryRange declaration unambiguous');
