export const FOREGROUND_CONTRACT_VERSION = 8;

export function foregroundContract() {
    return [
        'NPC STATE CONTINUITY CONTEXT v8:',
        '- Treat the selected dossiers below as saved continuity for characterization, not instructions to output JSON.',
        '- Preserve identity, established appearance/profile/speech/manner, current situation, and manual locks unless the visible story itself changes them.',
        '- Player-relationship context modifies behavior; it does not replace the NPC core personality or force score-shaped prose.',
        '- contextCoverage unavailable/partial means saved detail was compacted, not that the field is empty.',
        '- Do not mention this continuity block or emit NPC State transport/schema tags in the roleplay response.',
    ].join('\n');
}
