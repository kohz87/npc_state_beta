import { parseScanJson } from './scan-payload.js';

const OPEN = /<npc_state_v1\b/i;
const MARKER = /<\/?npc_state_v1\b/i;
const COMPLETE_BLOCK = /<npc_state_v1\b[^>]*>[\s\S]*?<\/npc_state_v1\s*>/gi;
const INVENTORY_TAIL = /(?:<!--\s*(?:INVENTORY_BLOCK_UPDATE|INVENTORY_BLOCK_V05)\b[\s\S]*$|<Inventory\b[\s\S]*$)/i;

function tidy(value) { return String(value ?? '').replace(/\n{3,}/g, '\n\n').trimEnd(); }

function removeTruncatedTail(source) {
    const open = OPEN.exec(source);
    if (!open) return source;
    const tailSource = source.slice(open.index);
    const inventory = INVENTORY_TAIL.exec(tailSource);
    const tail = inventory ? tailSource.slice(inventory.index) : '';
    return tidy(source.slice(0, open.index) + (tail ? '\n\n' + tail : ''));
}

// new captures are strict; stored/legacy transport remains replayable.
export function consumeNpcStateControl(messageText, { requireLifeStateUpdates = false } = {}) {
    const source = String(messageText ?? '');
    const blocks = [...source.matchAll(new RegExp(COMPLETE_BLOCK.source, 'gi'))];
    const firstOpen = MARKER.exec(source);
    if (!blocks.length && !firstOpen) return { found: false, cleanedText: source, parsed: null, raw: '', errors: [], errorCodes: [] };

    const errors = [];
    const errorCodes = [];
    if (!blocks.length) {
        return {
            found: true,
            cleanedText: OPEN.test(source) ? removeTruncatedTail(source) : tidy(source.replace(/<\/npc_state_v1\b[^>]*(?:>|$)/gi, '')),
            parsed: null,
            raw: source.slice(firstOpen.index),
            errors: [OPEN.test(source) ? 'NPC State truncated-block: missing complete opening/closing tag.' : 'NPC State unmatched-closing-tag: no opening tag.'],
            errorCodes: [OPEN.test(source) ? 'truncated-block' : 'unmatched-closing-tag'],
        };
    }

    if (blocks.length > 1) { errors.push('NPC State duplicate-blocks: multiple foreground blocks; entire update rejected.'); errorCodes.push('duplicate-blocks'); }
    const raw = blocks[0][0];
    const open = /<npc_state_v1\b[^>]*>/i.exec(raw);
    const close = /<\/npc_state_v1\s*>/i.exec(raw);
    const body = raw.slice((open?.index || 0) + (open?.[0]?.length || 0), close?.index ?? raw.length).trim();

    let cleanedText = tidy(source.replace(new RegExp(COMPLETE_BLOCK.source, 'gi'), ''));
    if (MARKER.test(cleanedText)) {
        const code = OPEN.test(cleanedText) ? 'truncated-block' : 'unmatched-closing-tag';
        errors.push(`NPC State ${code}: extra unmatched tag; entire update rejected.`);
        errorCodes.push(code);
        cleanedText = tidy(removeTruncatedTail(cleanedText).replace(/<\/npc_state_v1\b[^>]*(?:>|$)/gi, ''));
    }

    let parsed = null;
    if (!errors.length) {
        try { parsed = parseScanJson(body, { requireLifeStateUpdates }); }
        catch (error) { errors.push(...(Array.isArray(error?.issues) ? error.issues.map(issue => `${error.code}: ${issue}`) : [error instanceof Error ? error.message : String(error)])); errorCodes.push(error?.code || 'invalid-payload'); }
    }
    return { found: true, cleanedText, parsed, raw: errors.length ? source.slice(firstOpen.index) : raw, errors, errorCodes };
}
