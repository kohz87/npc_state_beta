import fs from 'node:fs';

const path = 'v03/branch-recovery-ui.js';
let source = fs.readFileSync(path, 'utf8');

const from = '#${FORCE_ID} button{margin:0}#${FORCE_ID}[data-running="1"] button{opacity:.65;pointer-events:none}';
const to = '#${FORCE_ID}{display:grid!important;grid-template-columns:minmax(0,1fr);gap:8px;align-items:start;width:100%;min-width:0;max-width:100%;box-sizing:border-box}\n'
    + '#${FORCE_ID}>span{min-width:0;max-width:100%;overflow-wrap:anywhere}\n'
    + '#${FORCE_ID} .npc-state-v3-branch-recovery-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;min-width:0;max-width:100%;box-sizing:border-box}\n'
    + '#${FORCE_ID} button{margin:0;width:100%;min-width:0;max-width:100%;height:auto;min-height:32px;box-sizing:border-box;white-space:normal!important;overflow-wrap:anywhere;line-height:1.25}\n'
    + '#${FORCE_ID}[data-running="1"] button{opacity:.65;pointer-events:none}\n'
    + '@media(max-width:720px){#${FORCE_ID} .npc-state-v3-branch-recovery-actions{grid-template-columns:1fr}}';

if (!source.includes(to)) {
    if (!source.includes(from)) throw new Error('Missing Force Timeline Rebase style anchor');
    source = source.replace(from, to);
}

if (!source.includes('PHASE72_RESPONSIVE_RECOVERY_CONTROLS')) {
    source = source.replace(
        'function ensureStyles() {',
        '// PHASE72_RESPONSIVE_RECOVERY_CONTROLS: keep Advanced Recovery actions bounded inside the settings drawer.\nfunction ensureStyles() {',
    );
}

fs.writeFileSync(path, source);
console.log('Applied NPC State v0.4.35 responsive recovery controls');
