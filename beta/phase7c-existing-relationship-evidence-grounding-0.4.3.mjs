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
console.log('Grounded existing NPC relationship changes against current exchange evidence');
