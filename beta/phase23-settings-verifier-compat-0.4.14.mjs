import fs from 'node:fs';

function replaceCompatible(source, from, to, label) {
    if (source.includes(from)) return source.replace(from, to);
    if (source.includes(to)) return source;
    throw new Error('Missing 0.4.14 verifier marker: ' + label);
}

{
    const path = 'beta/verify-phase9-settings-categories-0.4.4.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceCompatible(
        source,
        "assert(layout.includes('categorized responsive settings layout coordinator'), 'Categorized settings coordinator missing');",
        "assert(layout.includes('settings hierarchy coordinator'), 'Settings hierarchy coordinator missing');",
        'settings coordinator assertion',
    );
    source = replaceCompatible(
        source,
`const categories = [
    ['npc_state_v04_tracking', 'Tracking'],
    ['npc_state_v04_continuity_injection', 'Continuity Injection'],
    ['npc_state_v04_birthday_continuity', 'Birthday Continuity'],
    ['npc_state_v04_recovery_branch', 'Recovery & Branch Safety'],
    ['npc_state_v3_scanner_rules', 'Advanced Rubrics'],
];`,
`const categories = [
    ['npc_state_v04_tracking', 'Scanning & Capture'],
    ['npc_state_v04_continuity_injection', 'Continuity Injection'],
    ['npc_state_v04_birthday_continuity', 'Birthday & Aging'],
    ['npc_state_v3_scanner_rules', 'Relationships'],
    ['npc_state_v04_recovery_branch', 'Recovery & Branch Safety'],
    ['npc_state_v0414_advanced', 'Advanced'],
];`,
        'settings categories',
    );
    source = replaceCompatible(
        source,
`// Tracking is the only newly created control category open by default.
assert(layout.includes("ensureParentDetails(drawer, TRACKING_GROUP_ID, 'Tracking', 'npc-state-v3-tracking-group', true"), 'Tracking is not open by default');
assert(layout.includes("ensureParentDetails(drawer, INJECTION_GROUP_ID, 'Continuity Injection', 'npc-state-v3-injection-group', false"), 'Continuity Injection should default collapsed');
assert(layout.includes("ensureParentDetails(drawer, BIRTHDAY_GROUP_ID, 'Birthday Continuity', 'npc-state-v3-birthday-group', false"), 'Birthday Continuity should default collapsed');
assert(layout.includes("ensureParentDetails(drawer, RECOVERY_GROUP_ID, 'Recovery & Branch Safety', 'npc-state-v3-recovery-group', false"), 'Recovery & Branch Safety should default collapsed');`,
`// Scanning & Capture is the only newly created control category open by default.
assert(layout.includes("ensureParentDetails(drawer, TRACKING_GROUP_ID, 'Scanning & Capture', 'npc-state-v3-tracking-group npc-state-v3-scanning-group', true"), 'Scanning & Capture is not open by default');
assert(layout.includes("ensureParentDetails(drawer, INJECTION_GROUP_ID, 'Continuity Injection', 'npc-state-v3-injection-group', false"), 'Continuity Injection should default collapsed');
assert(layout.includes("ensureParentDetails(drawer, BIRTHDAY_GROUP_ID, 'Birthday & Aging', 'npc-state-v3-birthday-group', false"), 'Birthday & Aging should default collapsed');
assert(layout.includes("ensureParentDetails(drawer, RECOVERY_GROUP_ID, 'Recovery & Branch Safety', 'npc-state-v3-recovery-group', false"), 'Recovery & Branch Safety should default collapsed');`,
        'settings defaults',
    );
    source = replaceCompatible(
        source,
        "    '#npc_state_v04_fallback', '#npc_state_v3_branch_rescan',",
        "    '#npc_state_v047_response_tokens', '#npc_state_v04_fallback', '#npc_state_v3_branch_rescan',",
        'settings control coverage',
    );
    source = replaceCompatible(
        source,
        "assert(layout.includes('[tracking, injection, birthday, evolution, recovery, scanner, maintenance, portrait, actions, cast]'), 'Settings category/action order drifted');",
        "assert(layout.includes('[scanning, injection, birthday, evolution, relationships, recovery, advanced, portrait, actions, cast]'), 'Settings category/action order drifted');",
        'settings order',
    );
    source = replaceCompatible(
        source,
        "assert(readme.includes('## Settings organization') && readme.includes('Tracking') && readme.includes('Birthday controls are progressive'), 'README settings organization documentation missing');",
        "assert(readme.includes('## Settings organization') && readme.includes('Scanning & Capture') && readme.includes('Birthday controls remain progressive'), 'README settings organization documentation missing');",
        'settings README assertion',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase15-force-rebase-0.4.10.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceCompatible(
        source,
        "assert(recoveryUi.includes('Force timeline rebase'), 'Recovery settings do not expose the force rebase action');",
        "assert(recoveryUi.includes('Force Timeline Rebase'), 'Recovery settings do not expose the force rebase action');",
        'force rebase heading assertion',
    );
    source = replaceCompatible(
        source,
        "assert(recoveryUi.includes('Force rebase to current chat'), 'Force rebase button label is missing');",
        "assert(recoveryUi.includes('Force Timeline Rebase...'), 'Force rebase button label is missing');",
        'force rebase button assertion',
    );
    source = replaceCompatible(
        source,
        "assert(recoveryUi.includes('ensureForceControl(host)'), 'Safe branch state does not render the force rebase action');",
        "assert(recoveryUi.includes('ensureForceControl(forceHost || host)'), 'Safe branch state does not render the force rebase action inside Advanced Recovery');",
        'force rebase placement assertion',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase20-semantic-isolation-0.4.13.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceCompatible(
        source,
        "assert.equal(manifest.version, '0.4.13');\nconsole.log('NPC State 0.4.13 semantic isolation verified');",
        "const manifestMatch = String(manifest.version || '').match(/^0\\.4\\.(\\d+)$/);\nassert(manifestMatch && Number(manifestMatch[1]) >= 13, 'Manifest regressed below v0.4.13');\nconsole.log('NPC State 0.4.13+ semantic isolation verified');",
        'v0.4.13 semantic verifier version',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase21-release-source-parity-0.4.13.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceCompatible(
        source,
        "assert.equal(manifest.version, '0.4.13');\n\nconsole.log('NPC State 0.4.13 release source parity verified');",
        "const manifestMatch = String(manifest.version || '').match(/^0\\.4\\.(\\d+)$/);\nassert(manifestMatch && Number(manifestMatch[1]) >= 13, 'Manifest regressed below v0.4.13');\n\nconsole.log('NPC State 0.4.13+ release source parity verified');",
        'v0.4.13 parity verifier version',
    );
    fs.writeFileSync(path, source);
}

console.log('Made historical settings and v0.4.13 verifiers compatible with v0.4.14');
