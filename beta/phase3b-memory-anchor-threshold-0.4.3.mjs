import fs from 'node:fs';

const path = 'v03/schema.js';
let source = fs.readFileSync(path, 'utf8');
const from = `    if (sharedEvent && sharedAnchors >= 2 && jaccard >= 0.38) return true;
    return shared >= 4 && jaccard >= 0.70;`;
const to = `    // A shared event verb plus three concrete anchors (typically actor/target/object/place)
    // is strong enough to tolerate richer paraphrasing. Requiring three anchors avoids
    // collapsing two separate rescues merely because the same pair of people is involved.
    if (sharedEvent && sharedAnchors >= 3 && jaccard >= 0.28) return true;
    return shared >= 4 && jaccard >= 0.70;`;
if (!source.includes(from)) throw new Error('Missing Phase 3 semantic-memory threshold marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Tuned semantic memory matching around shared event anchors');
