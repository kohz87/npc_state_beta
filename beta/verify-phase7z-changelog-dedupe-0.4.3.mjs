import fs from 'node:fs';

const text = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const relationship = '- Deep-audit follow-up grounds automatic relationship changes for EXISTING NPCs against the actual current relationship-evidence context too.';
const audit = '- Deep-audit hardening closes cross-feature edge cases found after the phased release:';
function count(needle) { return text.split(needle).length - 1; }
if (count(relationship) !== 1) throw new Error('Existing-NPC relationship deep-audit changelog entry is not idempotent');
if (count(audit) !== 1) throw new Error('Deep-audit changelog entry is not idempotent');
console.log('NPC State 0.4.3 deep-audit changelog idempotence verification passed');
