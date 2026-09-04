import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
const from = `                requireCurrentRelationshipEvidence: createdNpcIds.has(npc.id),`;
const to = `                // Automatic relationship movement is always current-exchange evidence.
                // Existing NPCs are not allowed to bypass grounding merely because their
                // dossier already exists. Direct/manual relationship editing uses engine
                // mutation and does not pass through this scanner path.
                requireCurrentRelationshipEvidence: createdNpcIds.has(npc.id) || Boolean(String(options.relationshipContext || '').trim()),`;
if (!source.includes(from)) throw new Error('Missing existing-NPC relationship evidence marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);

const changelogPath = 'CHANGELOG.md';
let changelog = fs.readFileSync(changelogPath, 'utf8');
const changelogMarker = `## v0.4.3\n`;
const changelogEntry = `## v0.4.3\n\n- Deep-audit follow-up grounds automatic relationship changes for EXISTING NPCs against the actual current relationship-evidence context too. A model-written evidence sentence that is absent from the exchange can no longer move visible scores, accumulate hidden fractional progress, or enter semantic relationship-evidence history. Manual dossier relationship edits remain authoritative and bypass the scanner path.\n`;
if (!changelog.includes(changelogMarker)) throw new Error('Missing v0.4.3 changelog marker');
changelog = changelog.replace(changelogMarker, changelogEntry);
fs.writeFileSync(changelogPath, changelog);

console.log('Grounded existing NPC relationship changes against current exchange evidence');
