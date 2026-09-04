import fs from 'node:fs';

const path = 'v03/schema.js';
let source = fs.readFileSync(path, 'utf8');
const from = `    const sharedEvent = [...left.events].some(event => right.events.has(event));
    const eventTokens = new Set([...left.events, ...right.events]);
    const sharedAnchors = [...left.tokenSet].filter(token => right.tokenSet.has(token) && !eventTokens.has(token)).length;
    // A shared event verb plus three concrete anchors (typically actor/target/object/place)`;
const to = `    const sharedEvent = [...left.events].some(event => right.events.has(event));
    const isEventToken = token => MEMORY_EVENT_GROUPS.some(([, pattern]) => pattern.test(token));
    const sharedAnchors = [...left.tokenSet].filter(token => right.tokenSet.has(token) && !isEventToken(token)).length;
    // A shared event verb plus three concrete anchors (typically actor/target/object/place)`;
if (!source.includes(from)) throw new Error('Missing Phase 3 event-anchor marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Separated memory event verbs from concrete duplicate anchors');
