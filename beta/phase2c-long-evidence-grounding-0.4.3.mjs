import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
const from = `function profileEvidenceGrounded(evidence, context) {
    const proof = normalizeName(evidence);
    const source = normalizeName(context);
    if (!proof || !source) return false;
    if (source.includes(proof)) return true;
    const stop = new Set(['the','and','that','this','with','from','into','their','they','them','then','when','while','because','after','before','more','less','very','some','current','exchange','npc','player']);
    const proofTokens = proof.split(/\\s+/).filter(token => token.length >= 3 && !stop.has(token));
    const sourceTokens = new Set(source.split(/\\s+/).filter(token => token.length >= 3));
    if (!proofTokens.length) return false;
    const matched = proofTokens.filter(token => sourceTokens.has(token)).length;
    return matched >= Math.min(2, proofTokens.length) && matched / proofTokens.length >= 0.34;
}`;
const to = `function evidenceTextKey(value, max = 20000) {
    return String(value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\\s\\p{P}\\p{S}]+/gu, ' ')
        .trim()
        .slice(0, max);
}

function profileEvidenceGrounded(evidence, context) {
    // Identity normalization is intentionally short (160 chars); evidence grounding is not.
    // Using normalizeName() here silently hid evidence appearing later in a normal scene.
    const proof = evidenceTextKey(evidence, 1200);
    const source = evidenceTextKey(context, 20000);
    if (!proof || !source) return false;
    if (source.includes(proof)) return true;
    const stop = new Set(['the','and','that','this','with','from','into','their','they','them','then','when','while','because','after','before','more','less','very','some','current','exchange','npc','player']);
    const proofTokens = proof.split(/\\s+/).filter(token => token.length >= 3 && !stop.has(token));
    const sourceTokens = new Set(source.split(/\\s+/).filter(token => token.length >= 3));
    if (!proofTokens.length) return false;
    const matched = proofTokens.filter(token => sourceTokens.has(token)).length;
    return matched >= Math.min(2, proofTokens.length) && matched / proofTokens.length >= 0.34;
}`;
if (!source.includes(from)) throw new Error('Missing short evidence-grounding helper');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Fixed long-form evidence grounding for durable canon/profile/age validation');
