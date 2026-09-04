import fs from 'node:fs';

const path = 'v03/engine.js';
let source = fs.readFileSync(path, 'utf8');
const from = `                const loaded = await readV3Sidecar({ chatKey, pointer, fetchFn });
                if (!loaded) throw new Error('NPC State beta sidecar pointer exists but the file is missing. Refusing to create a blank replacement.');
                state = loaded.state;`;
const to = `                const loaded = await readV3Sidecar({ chatKey, pointer, fetchFn });
                if (!loaded) throw new Error('NPC State beta sidecar pointer exists but the file is missing. Refusing to create a blank replacement.');
                if (loaded.retired) {
                    const error = new Error('NPC State beta sidecar was retired by a chat rename/delete lifecycle transaction. Refusing to hydrate it as empty live state.');
                    error.code = 'NPC_STATE_V04_BETA_RETIRED_SIDECAR';
                    error.redirectChatKey = loaded.redirectChatKey || '';
                    throw error;
                }
                state = loaded.state;`;
if (!source.includes(from)) throw new Error('Missing phase-5 retired load marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Added retired-sidecar hydration guard');
