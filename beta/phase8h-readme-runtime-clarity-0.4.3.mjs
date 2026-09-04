import fs from 'node:fs';

const path = 'README.md';
let source = fs.readFileSync(path, 'utf8');
source = source.replace(
    '- With Inventory Block 0.4, NPC State yields the terminal position: NPC payload first, Inventory `INVENTORY_BLOCK_UPDATE` last.',
    '- With current Inventory Block transports, NPC State yields the terminal position: the NPC payload comes first and Inventory keeps its own final `INVENTORY_BLOCK_V05` / legacy `INVENTORY_BLOCK_UPDATE` control.'
);
source = source.replace(
    '- Automatic recovery after missing/malformed foreground capture is optional and off by default.',
    '- When embedded capture is enabled, a completely missing `<npc_state_v1>` block automatically triggers one recovery scan. Recovery for a malformed block remains separately optional/configurable.'
);
fs.writeFileSync(path, source);
console.log('Aligned README with current foreground recovery and Inventory transport behavior');
