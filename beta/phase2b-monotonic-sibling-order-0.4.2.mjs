import fs from 'node:fs';

const path = 'v03/branches.js';
let source = fs.readFileSync(path, 'utf8');
const from = `    const checkpoint = {
        messageId,
        lineage,
        reason: String(reason || 'scan').slice(0, 80),
        createdAt: Date.now(),
        snapshot: snapshotForCheckpoint(next),
    };`;
const to = `    const newestCheckpointTime = Math.max(0, ...(next.checkpoints || []).map(item => Number(item?.createdAt) || 0), Number(next.branchBase?.createdAt) || 0);
    const checkpoint = {
        messageId,
        lineage,
        reason: String(reason || 'scan').slice(0, 80),
        // Date.now() can repeat inside rapid swipe/regeneration churn. Keep checkpoint
        // recency strictly monotonic so bounded sibling eviction is deterministic.
        createdAt: Math.max(Date.now(), newestCheckpointTime + 1),
        snapshot: snapshotForCheckpoint(next),
    };`;
if (!source.includes(from)) throw new Error('Missing phase-2 checkpoint creation marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const line = '- Phase 2 follow-up makes checkpoint recency strictly monotonic so rapid sibling swipes created within the same millisecond still evict the true oldest sibling deterministically.';
if (!changelog.includes(line)) {
    const marker = '## v0.4.2\n\n';
    if (!changelog.includes(marker)) throw new Error('Missing v0.4.2 changelog marker');
    changelog = changelog.replace(marker, marker + line + '\n');
    fs.writeFileSync('CHANGELOG.md', changelog);
}
console.log('Applied deterministic monotonic sibling checkpoint ordering');
