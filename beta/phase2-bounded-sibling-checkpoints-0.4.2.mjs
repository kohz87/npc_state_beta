import fs from 'node:fs';

const path = 'v03/branches.js';
let source = fs.readFileSync(path, 'utf8');
const from = `    // One current rollback snapshot per assistant message id. Swipe/regeneration variants
    // replace that message's checkpoint instead of consuming the entire 48-entry window.
    next.checkpoints = next.checkpoints.filter(item => item.messageId !== messageId);
    next.checkpoints.push(checkpoint);
    next.checkpoints.sort((a, b) => a.lineage.length - b.lineage.length || a.createdAt - b.createdAt);
    if (next.checkpoints.length > CHECKPOINT_LIMIT) next.checkpoints.splice(0, next.checkpoints.length - CHECKPOINT_LIMIT);`;
const to = `    // Keep several exact content-lineage siblings for one assistant message instead of
    // collapsing every swipe/regeneration onto a single rollback slot. The cap prevents a
    // swipe-heavy message from consuming the whole global checkpoint window. The embedded
    // per-swipe payload remains the fallback after an older sibling snapshot is evicted.
    const siblingLimit = 4;
    const exact = next.checkpoints.findIndex(item => item.messageId === messageId && arraysEqual(item.lineage || [], lineage));
    if (exact >= 0) next.checkpoints[exact] = checkpoint;
    else next.checkpoints.push(checkpoint);
    const siblings = next.checkpoints
        .filter(item => item.messageId === messageId)
        .sort((a, b) => b.createdAt - a.createdAt);
    const evictedSiblingKeys = new Set(siblings.slice(siblingLimit).map(item => JSON.stringify(item.lineage || [])));
    if (evictedSiblingKeys.size) {
        next.checkpoints = next.checkpoints.filter(item => item.messageId !== messageId || !evictedSiblingKeys.has(JSON.stringify(item.lineage || [])));
    }
    next.checkpoints.sort((a, b) => a.lineage.length - b.lineage.length || a.createdAt - b.createdAt);
    if (next.checkpoints.length > CHECKPOINT_LIMIT) next.checkpoints.splice(0, next.checkpoints.length - CHECKPOINT_LIMIT);`;
if (!source.includes(from)) throw new Error('Missing phase-2 one-checkpoint-per-message marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const line = '- Phase 2 restores bounded exact sibling swipe snapshots: up to four distinct content-lineage checkpoints may coexist for one assistant message, while v0.4.2 keeps swipe-index-independent fingerprints, the global 48-checkpoint bound, and stored embedded-payload replay as fallback after older sibling eviction.';
if (!changelog.includes(line)) {
    const marker = '## v0.4.2\n\n';
    if (!changelog.includes(marker)) throw new Error('Missing v0.4.2 changelog marker');
    changelog = changelog.replace(marker, marker + line + '\n');
    fs.writeFileSync('CHANGELOG.md', changelog);
}
console.log('Applied NPC State 0.4.2 phase 2 bounded sibling checkpoints');
