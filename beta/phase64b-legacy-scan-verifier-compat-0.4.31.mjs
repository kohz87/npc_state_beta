import fs from 'node:fs';

function replaceRequired(path, from, to, label) {
    let source = fs.readFileSync(path, 'utf8');
    if (source.includes(to)) return;
    if (!source.includes(from)) throw new Error('Missing v0.4.31 legacy verifier marker: ' + label);
    source = source.replace(from, to);
    fs.writeFileSync(path, source);
}

const oldGate = "assert(engine.includes('applyRelationship: applyRelationship === null ? !alreadyScannedMessage : applyRelationship === true'), 'Repeated forced scan relationship gate lost its idempotent default');";
const newGate = "assert(engine.includes('const relationshipApplyRequested = applyRelationship === null ? !alreadyScannedMessage : applyRelationship === true'), 'Repeated forced scan relationship gate lost its idempotent default');\n    assert(engine.includes('applyRelationship: relationshipApplyRequested && !replayProtectedRelationship'), 'Accepted rebase replay boundary is not composed with the repeated-scan gate');";
replaceRequired('beta/verify-final-0.4.1.mjs', oldGate, newGate, 'final repeated-scan gate');

const oldPhase61 = "assert(engine.includes(\"applyRelationship: applyRelationship === null ? !alreadyScannedMessage : applyRelationship === true\"), 'Scan lacks explicit relationship-update override');";
const newPhase61 = "assert(engine.includes(\"const relationshipApplyRequested = applyRelationship === null ? !alreadyScannedMessage : applyRelationship === true\"), 'Scan lacks explicit relationship-update override');\nassert(engine.includes(\"applyRelationship: relationshipApplyRequested && !replayProtectedRelationship\"), 'Accepted preserve-rebase history can bypass the persisted replay boundary');";
replaceRequired('beta/verify-phase61-safe-rebase-relationship-modes-0.4.29.mjs', oldPhase61, newPhase61, 'phase61 explicit relationship override');

console.log('Aligned legacy forced-scan verifiers with the v0.4.31 accepted replay boundary');
