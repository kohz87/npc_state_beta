import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.29 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.28', '0.4.29'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.28', '0.4.29');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.28', '0.4.29'].includes(manifest.version)) throw new Error('Expected the complete 0.4.28 baseline');
manifest.version = '0.4.29';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.28', '# NPC State Beta 0.4.29', 'README title');
if (!readme.includes('## Recovery interruption and concurrency hardening')) {
    readme = readme.replace(
        '## Recovery and chronological rebuild',
        `## Recovery interruption and concurrency hardening\n\n- Historical recovery is now bound to the chat that started it before planning, generation, suffix validation, and completion. Switching chats pauses the original reconstruction without replanning it against another conversation, and an in-flight result from the old chat is discarded rather than reused.\n- A persisted recovery owner session and expiring lease prevent a second tab from treating an active reconstruction as an abandoned reload. Another tab observes the active owner; only an expired lease becomes resumable.\n- Cancellation has precedence over generation failures. If cancel is requested while a model call is pending, rejection of that call still ends recovery as cancelled and preserves only already committed progress.\n- Custom recovery message ranges are validated instead of clamped. Out-of-range selections are rejected before a replacement sidecar is created, and the UI previews the actual number of assistant exchanges selected.\n- Relationship duplicate protection is event-scoped. Reapplying the same source event is still blocked, but identical quotation text in a different exchange no longer suppresses a genuinely separate LLM-judged relationship event.\n\n## Recovery and chronological rebuild`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.29')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.29\n\n- Binds historical reconstruction to its originating chat before planning, generation, suffix validation, and completion; switching chats pauses the original run without consuming or replanning against the other chat.\n- Adds persisted recovery session ownership with an expiring lease so a second tab observes an active run instead of immediately pausing it as an interrupted reload.\n- Makes cancellation outrank pending-generation failures and releases recovery ownership on pause, failure, cancellation, stale history, and completion.\n- Rejects invalid custom message ranges before sidecar replacement and previews the exact selected assistant-exchange count in the recovery UI.\n- Replaces quotation-text-wide relationship duplicate suppression with source-event identity, preserving same-event replay protection while allowing identical wording in distinct exchanges.\n- Adds multi-chat, multi-instance, cancellation-failure, range-validation, and relationship-event regression coverage while preserving milestones, inertia, caps, and LLM semantic judgment.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.29');
