import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
const from = `    const visibleChanged = Object.values(actualDelta).some(Boolean);
    if (visibleChanged) {
        const event = { ...evidenceEvent, delta: actualDelta };
        next.lastRelationshipChange = event;
        next.relationshipHistory = [...(next.relationshipHistory || []), event].slice(-24);
    }

    const summary = String(patch?.relationshipSummary ?? '').trim();
    if (summary && relationshipSummarySupported(summary, next.relationship, next.relationshipMilestones)) {
        next.relationshipSummary = summary.slice(0, 1000);
    }
    return next;`;
const to = `    const visibleChanged = Object.values(actualDelta).some(Boolean);
    if (visibleChanged) {
        const event = { ...evidenceEvent, delta: actualDelta };
        next.lastRelationshipChange = event;
        next.relationshipHistory = [...(next.relationshipHistory || []), event].slice(-24);
    }

    const progressChanged = RELATIONSHIP_AXES.some(axis => Number(next.relationshipProgress?.[axis] || 0) !== Number(priorProgress?.[axis] || 0));
    const relationshipStateChanged = visibleChanged || progressChanged || crossings.length > 0;
    const summary = String(patch?.relationshipSummary ?? '').trim();
    if (summary && relationshipStateChanged && relationshipSummarySupported(summary, next.relationship, next.relationshipMilestones)) {
        next.relationshipSummary = summary.slice(0, 1000);
    }
    return next;`;
if (!source.includes(from)) throw new Error('Missing phase-1 relationship summary gate marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Tightened relationship summary updates to accepted state changes only');
