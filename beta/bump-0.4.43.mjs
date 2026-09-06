import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.43 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.42', '0.4.43'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.42', '0.4.43');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.42', '0.4.43'].includes(manifest.version)) throw new Error('Expected the complete 0.4.42 baseline');
manifest.version = '0.4.43';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.42', '# NPC State Beta 0.4.43', 'README title');
if (!readme.includes('## Post-response scan toggle and block-render stability')) {
    readme = readme.replace(
        '## Separate scan connection and completeness pass',
        `## Post-response scan toggle and block-render stability\n\n- **Scan after each response** now gates the optional completeness path cleanly. When the toggle is off, an ordinary successful embedded NPC digest is not followed by completion metadata bookkeeping or a second post-response UI mutation. Duplicate completion events are deduplicated in memory without touching the message DOM.\n- Completion metadata that is needed when the optional pass is enabled is now persisted with chat-save only. Metadata-only bookkeeping no longer calls SillyTavern's updateMessageBlock(), so it does not tear down freshly rendered peer-extension cards such as Megumin Suite blocks.\n- The ordinary embedded foreground digest is unchanged: NPC State still consumes its hidden <npc_state_v1> transport once, applies the state update, and performs the one message rerender needed to remove that transport.\n- Full recovery scans, malformed-capture handling, relationship scoring, lifecycle semantics, and branch/recovery rules are unchanged.\n\n## Separate scan connection and completeness pass`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.43\n')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.43\n\n- Fixes the disabled **Scan after each response** path so an ordinary embedded digest does not perform post-response completion bookkeeping or a second message/UI mutation.\n- Persists completion metadata with chat-save only instead of updateMessageBlock(), preventing metadata-only NPC State bookkeeping from tearing down freshly rendered Megumin Suite block cards.\n- Keeps duplicate completed-response events deduplicated in memory while the optional completeness pass is off, without launching another embedded digest or separate scanner request.\n- Leaves the ordinary embedded digest, enabled completeness request, recovery scans, relationship scoring, lifecycle semantics, and branch/recovery behavior unchanged.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.43');
