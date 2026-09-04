import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
const from = `    if (field === 'birthday') {
        return mode === 'correction' && CANON_CORRECTION_CUES.test(evidence + ' ' + context);
    }`;
const to = `    if (field === 'birthday') {
        return mode === 'correction'
            && birthdayEvidenceGrounded(incoming, context)
            && CANON_CORRECTION_CUES.test(evidence + ' ' + context);
    }`;
if (!source.includes(from)) throw new Error('Missing phase 8K birthday correction marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Hardened NPC State 0.4.3 birthday correction grounding');
