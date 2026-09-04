import fs from 'node:fs';

const path = 'CHANGELOG.md';
let text = fs.readFileSync(path, 'utf8');
const header = '## v0.4.3\n';
const relationship = '- Deep-audit follow-up grounds automatic relationship changes for EXISTING NPCs against the actual current relationship-evidence context too. A model-written evidence sentence that is absent from the exchange can no longer move visible scores, accumulate hidden fractional progress, or enter semantic relationship-evidence history. Manual dossier relationship edits remain authoritative and bypass the scanner path.';
const audit = '- Deep-audit hardening closes cross-feature edge cases found after the phased release: long-message NPC/reference matching no longer truncates at identity-key length; gradual character development requires a genuinely different assistant message; form corrections, Key Relationship removals, and family facts are grounded against source evidence; World_State world-active authority is backend-filtered; unrelated <Blocks> wrappers stay inert while truncated recognized wrappers fail closed; life/death/resurrection changes are evidence-gated; Named preferred cannot be bypassed by a mislabeled role identity; explicitly named returning NPCs receive foreground dossier priority; fully disabling capture+continuity removes the prompt; manual name/alias collisions are rejected; deceased manual restore normalizes back to alive; and branch rollback preserves current user-locked canon plus editor-owned Importance.';
if (!text.includes(header)) throw new Error('Missing v0.4.3 changelog header');
for (const bullet of [relationship, audit]) {
    while (text.includes(bullet)) text = text.replace(bullet, '');
}
text = text.replace(/\n{3,}/g, '\n\n');
text = text.replace(header, header + '\n' + relationship + '\n\n' + audit + '\n');
text = text.replace(/\n{3,}/g, '\n\n');
fs.writeFileSync(path, text);
console.log('Normalized deep-audit changelog entries to one copy each');
