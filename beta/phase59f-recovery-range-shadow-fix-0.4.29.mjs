import fs from 'node:fs';

const path = 'v03/engine.js';
let source = fs.readFileSync(path, 'utf8');

const legacy = `    function recoveryRange() {
        const chat = getContext().chat || [];
        const range = recoveryRangeForChat(chat, null, null);
        return {
            firstAssistantMessageId: range.firstAssistantMessageId,
            latestAssistantMessageId: range.latestAssistantMessageId,
            assistantExchangeCount: range.messageIds.length,
        };
    }

`;

if (source.includes(legacy)) {
    source = source.replace(legacy, '');
} else if (!source.includes('function recoveryRange({ startMessageId = null, endMessageId = null } = {})')) {
    throw new Error('Missing v0.4.29 strict recoveryRange helper while removing legacy shadow');
}

const declarationCount = (source.match(/function recoveryRange\s*\(/g) || []).length;
if (declarationCount !== 1) throw new Error('Expected exactly one recoveryRange declaration after v0.4.29 shadow repair, found ' + declarationCount);
fs.writeFileSync(path, source);
console.log('Removed v0.4.28 recoveryRange shadow so v0.4.29 strict custom ranges are authoritative');
