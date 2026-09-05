import fs from 'node:fs';

const path = 'v03/injection.js';
let source = fs.readFileSync(path, 'utf8');
const marker = '// Relationship milestone contract remains: 25 meaningful+, 50 major+ with raw 3, 75 extreme raw 5, 90 extreme raw 8; runtime remains authoritative.';
if (!source.includes(marker)) {
    const anchor = "import { relationshipCustomCriteriaPrompt, relationshipJudgmentRubricPrompt, relationshipMechanicsPrompt } from './relationship-policy.js';";
    if (!source.includes(anchor)) throw new Error('Missing v0.4.22 relationship helper import');
    source = source.replace(anchor, anchor + '\n\n' + marker);
}
fs.writeFileSync(path, source);
console.log('Preserved v0.4.22 relationship milestone architecture marker without duplicating prompt guidance');
