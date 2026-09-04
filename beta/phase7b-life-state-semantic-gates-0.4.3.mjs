import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
const from = `    const grounded = Boolean(reason && (!lifeContext.trim() || profileEvidenceGrounded(reason, lifeContext)));
    const wasDead = String(npc?.lifeState || '').toLocaleLowerCase() === 'dead'
        || (npc?.archived === true && String(npc?.archiveReason || '').toLocaleLowerCase() === 'deceased');`;
const to = `    const grounded = Boolean(reason && (!lifeContext.trim() || profileEvidenceGrounded(reason, lifeContext)));
    const deathCue = /\\b(?:dies?|died|dead|death|killed|slain|lifeless|no pulse|stopped breathing|ceased breathing)\\b/i.test(lifeContext);
    const livingReturnCue = /\\b(?:alive|surviv(?:e|ed|es|ing)|resurrect(?:ed|s|ing)?|reviv(?:e|ed|es|ing)|not dead|wasn't dead|was not dead|death reports? (?:were|was) false|emerges? alive|returns? alive)\\b/i.test(lifeContext);
    const wasDead = String(npc?.lifeState || '').toLocaleLowerCase() === 'dead'
        || (npc?.archived === true && String(npc?.archiveReason || '').toLocaleLowerCase() === 'deceased');`;
if (!source.includes(from)) throw new Error('Missing deep-audit life-state grounding marker');
source = source.replace(from, to);
source = source.replace(
    `        if (!grounded) return next;
        next.archived = false;`,
    `        if (!grounded || !livingReturnCue) return next;
        next.archived = false;`
);
source = source.replace(
    `        if (!['explicit', 'confirmed'].includes(certainty.toLocaleLowerCase()) || !grounded) return next;`,
    `        if (!['explicit', 'confirmed'].includes(certainty.toLocaleLowerCase()) || !grounded || !deathCue) return next;`
);
fs.writeFileSync(path, source);
console.log('Tightened life-state grounding with semantic death/living-return cues');
