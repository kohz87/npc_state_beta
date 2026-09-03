import fs from 'node:fs';

const path = 'v03/engine.js';
let source = fs.readFileSync(path, 'utf8');

const from = `                if (stablePointer?.path) {
                    const stable = await readV3Sidecar({ chatKey, pointer: stablePointer, fetchFn });
                    if (!stable) throw new Error('Stable NPC State v0.3 sidecar pointer exists but the file is missing. Refusing to create a blank beta replacement.');
                    state = stable.state;
                    importedStable = true;
                } else {
                    state = createEmptyState(chatKey);
                }`;

const to = `                if (stablePointer?.path) {
                    const stable = await readV3Sidecar({ chatKey, pointer: stablePointer, fetchFn });
                    if (stable) {
                        state = stable.state;
                        importedStable = true;
                    } else {
                        // Stable v0.3 is only an optional import source for the beta. A stale
                        // legacy pointer must never prevent a first-time beta user from starting.
                        // Do not mutate stable settings or recreate the missing stable sidecar.
                        console.warn('[NPC State Beta] Optional stable v0.3 import pointer is stale; starting a fresh beta database.', {
                            chatKey,
                            path: stablePointer.path,
                        });
                        state = createEmptyState(chatKey);
                    }
                } else {
                    state = createEmptyState(chatKey);
                }`;

if (!source.includes(from)) throw new Error('Missing first-run stable-probe marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Hardened optional stable import for first-time beta users');
