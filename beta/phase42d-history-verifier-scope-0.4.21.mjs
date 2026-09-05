import fs from 'node:fs';

const path = 'beta/verify-phase42-relationship-history-remarks-0.4.21.mjs';
let source = fs.readFileSync(path, 'utf8');

const rejectedOld = `    const html = dossierHtml(npc);\n    assert(html.includes('<b>Trust:</b> The kept promise increased Elspeth’s trust in Lucien.'), 'Valid applied-axis explanation disappeared');\n    assert(!html.includes('This rejected affection proposal must not appear as an applied remark.'), 'Rejected axis explanation was displayed as an applied history remark');`;
const rejectedNew = `    const html = dossierHtml(npc);\n    const historyHtml = html.slice(html.indexOf('Recent relationship changes'), html.indexOf('Relationship evaluation & scoring'));\n    assert(historyHtml.includes('<b>Trust:</b> The kept promise increased Elspeth’s trust in Lucien.'), 'Valid applied-axis explanation disappeared');\n    assert(!historyHtml.includes('This rejected affection proposal must not appear as an applied remark.'), 'Rejected axis explanation was displayed as an applied history remark');\n    assert(html.includes('This rejected affection proposal must not appear as an applied remark.'), 'Rejected-axis diagnostics were accidentally hidden instead of merely excluded from applied history');`;
if (source.includes(rejectedOld)) source = source.replace(rejectedOld, rejectedNew);
else if (!source.includes('Rejected-axis diagnostics were accidentally hidden')) throw new Error('Missing rejected-axis history-scope verifier marker');

const ambiguousOld = `    const html = dossierHtml(ambiguous);\n    assert(html.includes('No explanation recorded.'), 'Ambiguous historical explanation was guessed instead of left unresolved');\n    assert(!html.includes('First competing explanation.') && !html.includes('Second competing explanation.'), 'Ambiguous explanation leaked into display history');`;
const ambiguousNew = `    const html = dossierHtml(ambiguous);\n    const historyHtml = html.slice(html.indexOf('Recent relationship changes'), html.indexOf('Relationship evaluation & scoring'));\n    assert(historyHtml.includes('No explanation recorded.'), 'Ambiguous historical explanation was guessed instead of left unresolved');\n    assert(!historyHtml.includes('First competing explanation.') && !historyHtml.includes('Second competing explanation.'), 'Ambiguous explanation leaked into display history');\n    assert(html.includes('First competing explanation.') && html.includes('Second competing explanation.'), 'Ambiguous diagnostic evidence was removed from scoring diagnostics');`;
if (source.includes(ambiguousOld)) source = source.replace(ambiguousOld, ambiguousNew);
else if (!source.includes('Ambiguous diagnostic evidence was removed')) throw new Error('Missing ambiguous-history scope verifier marker');

fs.writeFileSync(path, source);
console.log('Scoped v0.4.21 relationship remark regressions to Recent relationship changes');
