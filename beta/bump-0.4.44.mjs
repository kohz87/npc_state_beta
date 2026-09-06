import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.44 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.43', '0.4.44'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.43', '0.4.44');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.43', '0.4.44'].includes(manifest.version)) throw new Error('Expected the complete 0.4.43 baseline');
manifest.version = '0.4.44';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.43', '# NPC State Beta 0.4.44', 'README title');
if (!readme.includes('## Durable Important Memories')) {
    readme = readme.replace(
        '## Post-response scan toggle and block-render stability',
        `## Durable Important Memories\n\n- Important Memories on an existing NPC are now durable merge-patch continuity instead of a fragile whole-array replacement. A foreground or recovery scan may add a new distinct memory or provide a richer wording for the same event, but omitting an established memory no longer deletes it.\n- An empty memories array on an existing NPC now means “no memory additions this scan”. This makes the normal JSON shape safe even when the model emits memories: [] for an otherwise unchanged dossier patch.\n- Semantic duplicate compaction remains active, and the configured Important Memories cap is still enforced. Existing memories keep their slots; new distinct memories fill remaining capacity rather than silently wiping older entries.\n- New-NPC bootstrap behavior is unchanged because a new dossier starts with no stored memories. Relationship scoring, lifecycle semantics, presence tracking, profile evolution, and recovery/rebase behavior are unchanged.\n\n## Post-response scan toggle and block-render stability`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.44\n')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.44\n\n- Fixes Important Memories being silently replaced or cleared on ordinary existing-NPC scans when the model returned only the current memory subset or the schema-default `memories: []`.\n- Existing NPC memories now merge durably: omitted memories persist, distinct new memories fill remaining configured capacity, and richer semantic duplicates may refine the stored wording without spending another slot.\n- Keeps semantic duplicate hygiene and configured memory limits while preventing routine foreground/recovery scans from resetting the collection.\n- Leaves new-NPC memory bootstrap, relationship scoring, lifecycle semantics, presence, profile evolution, and recovery/rebase behavior unchanged.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

const workflowPath = '.github/workflows/seed-beta.yml';
let workflow = fs.readFileSync(workflowPath, 'utf8');
workflow = replaceRequired(workflow, 'name: Build NPC State 0.4.43 Beta', 'name: Build NPC State 0.4.44 Beta', 'workflow title');
workflow = replaceRequired(workflow,
    `      # Once CI has committed the regenerated v0.4.43 runtime, test that exact checkout\n      # before replacing v03 from the pinned stable baseline. During the one-time transition\n      # from the checked-in v0.4.42 runtime, the cold build generates v0.4.43 first.`,
    `      # Once CI has committed the regenerated v0.4.44 runtime, test that exact checkout\n      # before replacing v03 from the pinned stable baseline. During the one-time transition\n      # from the checked-in v0.4.43 runtime, the cold build generates v0.4.44 first.`,
    'workflow source-gate comment');
workflow = replaceRequired(workflow,
    `          if grep -q '\"version\": \"0.4.43\"' manifest.json; then`,
    `          if grep -q '\"version\": \"0.4.44\"' manifest.json; then`,
    'workflow source-gate version');
workflow = replaceRequired(workflow,
    `            echo \"Checked-in runtime predates v0.4.43; cold build will generate v0.4.43 first.\"`,
    `            echo \"Checked-in runtime predates v0.4.44; cold build will generate v0.4.44 first.\"`,
    'workflow source-gate message');
workflow = replaceRequired(workflow,
    '      - name: Apply 0.4.43 transformation in ordered phases',
    '      - name: Apply 0.4.44 transformation in ordered phases',
    'workflow transform step');
workflow = replaceRequired(workflow,
    '          for patch in $(seq 2 43); do',
    '          for patch in $(seq 2 44); do',
    'workflow replay range');
workflow = replaceRequired(workflow,
    `          # node beta/bump-0.4.43.mjs ; -name 'phase*-0.4.43.mjs'`,
    `          # node beta/bump-0.4.43.mjs ; -name 'phase*-0.4.43.mjs'\n          # node beta/bump-0.4.44.mjs ; -name 'phase*-0.4.44.mjs'`,
    'workflow v0.4.44 source marker');
workflow = replaceRequired(workflow,
    `          grep -Eq '\"version\": \"0\\.4\\.(41|42|43)\"' manifest.json`,
    `          grep -Eq '\"version\": \"0\\.4\\.(41|42|43|44)\"' manifest.json`,
    'v0.4.41 descendant manifest gate');
workflow = replaceRequired(workflow,
    `          grep -Eq '\"version\": \"0\\.4\\.(42|43)\"' manifest.json`,
    `          grep -Eq '\"version\": \"0\\.4\\.(42|43|44)\"' manifest.json`,
    'v0.4.42 descendant manifest gate');
workflow = replaceRequired(workflow,
    `          grep -q '\"version\": \"0.4.43\"' manifest.json`,
    `          grep -Eq '\"version\": \"0\\.4\\.(43|44)\"' manifest.json`,
    'v0.4.43 descendant manifest gate');
if (!workflow.includes('# v0.4.44 durable Important Memories merge invariants.')) {
    workflow = workflow.replace(
        `          grep -Eq '\"version\": \"0\\.4\\.(43|44)\"' manifest.json\n\n      - name: Commit generated beta runtime`,
        `          grep -Eq '\"version\": \"0\\.4\\.(43|44)\"' manifest.json\n\n          # v0.4.44 durable Important Memories merge invariants.\n          grep -q \"PHASE90_DURABLE_IMPORTANT_MEMORY_MERGE\" v03/scanner.js\n          grep -q \"DURABLE IMPORTANT MEMORY MERGE\" v03/scanner.js\n          grep -q \"DURABLE IMPORTANT MEMORY MERGE\" v03/injection.js\n          grep -Fq \"normalizeMemoryEntries([...(next.memories || []), ...patch.memories]\" v03/scanner.js\n          grep -q '\"version\": \"0.4.44\"' manifest.json\n\n      - name: Commit generated beta runtime`,
    );
}
workflow = replaceRequired(workflow,
    '          git commit -m "NPC State v0.4.43: gate completeness and preserve peer-rendered blocks"',
    '          git commit -m "NPC State v0.4.44: preserve durable Important Memories"',
    'workflow generated commit message');
fs.writeFileSync(workflowPath, workflow);

console.log('Prepared NPC State Beta 0.4.44');
