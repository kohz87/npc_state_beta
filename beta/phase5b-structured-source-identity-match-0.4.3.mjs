import fs from 'node:fs';

const path = 'v03/evidence-adapter.js';
let source = fs.readFileSync(path, 'utf8');
const from = `    const variants = [...new Set([npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : []), npc?.role]
        .map(value => String(value || '').trim()).filter(Boolean))];`;
const to = `    // Deliberate structured import must identify the dossier by canonical name/alias.
    // Generic occupations such as Guard or Clerk are not identity evidence and could pull
    // another NPC's structured block into the selected dossier.
    const variants = [...new Set([npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]
        .map(value => String(value || '').trim()).filter(Boolean))];`;
if (!source.includes(from)) throw new Error('Missing Phase 5B structured identity-match marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Tightened deliberate structured dossier matching to canonical name/aliases');
