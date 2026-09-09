import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScanPrompt } from '../src/scanner.js';
import { createEmptyState } from '../src/schema.js';

test('routine scan requests source-cited semanticUpdates for NEW ordinary dossier fields', () => {
    const state = createEmptyState('chat:v0535-prompt');
    const chat = [
        { is_user: true, name: 'Ari', mes: 'I enter the registry.' },
        { is_user: false, name: 'Narrator', mes: 'Nia says, "Registry first," and hands Ari a form.' },
    ];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1, playerName: 'Ari' });

    assert.match(prompt, /NEW ordinary dossier fields use semanticUpdates with exact permitted sources/i);
    assert.match(prompt, /NEW and EXISTING dossiers have ONE ordinary mutation channel: semanticUpdates/i);
    assert.match(prompt, /ordinary NEW\/EXISTING dossier fields apply through semanticUpdates once/i);
    assert.doesNotMatch(prompt, /NEW ordinary fields are flat;/i);
    assert.doesNotMatch(prompt, /EXISTING dossiers have ONE ordinary mutation channel: semanticUpdates/i);
});
