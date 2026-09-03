import { parseScanJson } from './scanner.js';

const OPEN = /<npc_state_v1\b[^>]*>/i;
const CLOSE = /<\/npc_state_v1\s*>/i;

export function consumeNpcStateControl(messageText) {
    const source = String(messageText ?? '');
    const open = OPEN.exec(source);
    if (!open) return { found: false, cleanedText: source, parsed: null, raw: '', errors: [] };
    const bodyStart = open.index + open[0].length;
    const closeMatch = CLOSE.exec(source.slice(bodyStart));
    if (!closeMatch) return { found: true, cleanedText: source.slice(0, open.index).trimEnd(), parsed: null, raw: source.slice(open.index), errors: ['NPC State foreground block was truncated or missing its closing tag.'] };
    const closeStart = bodyStart + closeMatch.index;
    const end = closeStart + closeMatch[0].length;
    const raw = source.slice(open.index, end);
    const body = source.slice(bodyStart, closeStart).trim();
    const duplicate = OPEN.test(source.slice(end));
    const cleanedText = (source.slice(0, open.index) + source.slice(end)).replace(/\n{3,}/g, '\n\n').trimEnd();
    const errors = [];
    if (duplicate) errors.push('Multiple NPC State foreground blocks were emitted; update rejected.');
    let parsed = null;
    if (!errors.length) try { parsed = parseScanJson(body); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    return { found: true, cleanedText, parsed, raw, errors };
}
