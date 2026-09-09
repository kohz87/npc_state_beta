import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScanResult } from '../src/scanner.js';
import { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText } from '../src/evidence-adapter.js';
import { createEmptyState } from '../src/schema.js';

const PLAYER = 'Lucien Noctis';
const ID = 'Linnea Rost did not look up from her ledger to inspect the conjured rod. A woman with dark hair fastened tightly behind her ears by a bone bodkin, she wore the grey woolen vest and rolled linen sleeves of a frontier clerk.';
const PEN = '"Right hand, take the pen. Third line from the bottom. Don\'t let the nib drip on the sheepskin."';
const TAP = 'Linnea tapped a blunt fingernail against the coarse woodblock print of the boar on the parchment.';
const SUPPLY = '"The provisional token grants access to the supply shed, the water butt out back, space in the common straw for eight Gold a week."';
const ZERO = { evaluated:true, impact:'none', delta:{trust:0,affection:0,desire:0,tension:0}, axisEvidence:{}, reason:'Routine professional interaction.' };

function state(key) { const s=createEmptyState(key); s.branchSafety={status:'safe'}; return s; }
function exchange(text) { return { user:{id:0,is_user:true,name:PLAYER,mes:'I present myself for registration.'}, assistant:{id:1,is_user:false,name:'Narrator',mes:text,swipe_id:0} }; }
function opts(ex) { return { sourceMessageId:1, turn:1, playerName:PLAYER, currentAdmissionText:[profileEvidenceText(ex.user.mes),profileEvidenceText(ex.assistant.mes)].join('\n'), profileContext:[profileEvidenceText(ex.user.mes),profileEvidenceText(ex.assistant.mes)].join('\n'), semanticEvidenceContext:[profileEvidenceText(ex.user.mes),profileEvidenceText(ex.assistant.mes)].join('\n'), relationshipContext:[relationshipEvidenceText(ex.user.mes),relationshipEvidenceText(ex.assistant.mes)].join('\n'), evidencePolicy:buildExchangeEvidencePolicy(ex), applyReturnedNpcPatches:true, applyRelationship:true, preservePresence:true, preserveObservation:true }; }
function patch(extra={}) { return { id:'',name:'Linnea Rost',identityKind:'named',identityEvidence:{anchor:'Linnea Rost',excerpts:[ID],explanation:'Visible identity.'},activityEvidence:{exchangeActive:{excerpts:[PEN,TAP],explanation:'Current intake and bounty explanation.'},inChat:{excerpts:[TAP],explanation:'Current scene.'}},relationshipChange:structuredClone(ZERO),...extra}; }
function payload(p) { return {exchangeActiveNpcIds:['Linnea Rost'],inChatNpcIds:['Linnea Rost'],worldActiveNpcIds:[],npcs:[p],socialEdges:[],familyFacts:[],lifeStateUpdates:[],candidateAccounting:{}}; }

test('Linnea original zero-delta Current Dynamic evidence persists through real application path',()=>{
 const ex=exchange([ID,PEN,TAP,SUPPLY].join('\n'));
 const summary="Strictly transactional frontier clerk processing Lucien's intake and offering him an urgent local hunting bounty.";
 const r=applyScanResult(state('chat:v0534-linnea'),payload(patch({relationshipSummary:summary,relationshipSummaryEvidence:{excerpts:[PEN,SUPPLY],explanation:'Routine brisk frontier efficiency.'}})),opts(ex));
 const npc=r.state.npcs.find(n=>n.name==='Linnea Rost');
 assert.equal(npc.relationshipSummary,summary);
 assert.deepEqual(npc.relationship,{trust:0,affection:0,desire:0,tension:0});
 assert.equal(npc.relationshipHistory.length,0);
});

test('same-message unrelated quoted dialogue is not rescued by accepted identity/activity binding',()=>{
 const unrelated='Varner said, "Take the east road."';
 const ex=exchange([ID,PEN,TAP,unrelated].join('\n'));
 const r=applyScanResult(state('chat:v0534-unrelated'),payload(patch({relationshipSummary:'Linnea directs Lucien toward the east road.',relationshipSummaryEvidence:{excerpts:[unrelated],explanation:'Wrong speaker.'}})),opts(ex));
 assert.equal(r.state.npcs.find(n=>n.name==='Linnea Rost').relationshipSummary,'');
 assert.equal(r.semanticDiagnostics.find(d=>d.field==='relationshipSummary')?.reason,'wrong-summary-target');
});

test('isolated gesture stays observation-only without model recurrence basis; retry deduplicates it',()=>{
 const ex=exchange([ID,PEN,TAP].join('\n'));
 const p=patch({semanticUpdates:[{field:'mannerisms',operation:'establish',value:['Taps a blunt fingernail against contract broadsheets while explaining bounty terms.'],sources:[{messageId:1,excerpt:TAP}]}],profileObservations:[{field:'mannerisms',observation:'Tapped a blunt fingernail against the boar print once.',concept:'contract tapping',sources:[{messageId:1,excerpt:TAP}],explanation:'One grounded occurrence.'}]});
 const first=applyScanResult(state('chat:v0534-observation'),payload(p),opts(ex));
 const npc=first.state.npcs.find(n=>n.name==='Linnea Rost');
 assert.deepEqual(npc.mannerisms,[]);
 assert.equal(npc.profileEvolutionEvidence.filter(e=>e.kind==='observation').length,1);
 assert.equal(first.semanticDiagnostics.some(d=>d.field==='mannerisms'&&d.reason==='profile-establishment-basis-required'),true);
 const retry=applyScanResult(first.state,payload({...p,id:npc.id}),opts(ex));
 assert.equal(retry.state.npcs.find(n=>n.id===npc.id).profileEvolutionEvidence.filter(e=>e.kind==='observation').length,1);
});

test('model-led reinforced basis keeps first-scene mannerism eligible without quote thresholds',()=>{
 const recurring='Linnea taps the relevant contract margin, then taps the signature line when the next rule is explained.';
 const ex=exchange([ID,PEN,TAP,recurring].join('\n'));
 const r=applyScanResult(state('chat:v0534-reinforced'),payload(patch({semanticUpdates:[{field:'mannerisms',operation:'establish',value:['Taps relevant contract lines while explaining terms.'],establishment:'reinforced',sources:[{messageId:1,excerpt:recurring}]}]})),opts(ex));
 assert.deepEqual(r.state.npcs.find(n=>n.name==='Linnea Rost').mannerisms,['Taps relevant contract lines while explaining terms.']);
});

test('structured-only appearance detail is rejected while separately visible registration memory survives',()=>{
 const reg="Linnea seals Lucien Noctis's completed provisional registration and hands the form back.";
 const raw=[ID,PEN,TAP,reg,'<Blocks><World_State>NPCs Present: Linnea Rost | bleached linen sleeves | G1</World_State><Inventory>Guild Token | G1</Inventory></Blocks>'].join('\n');
 const ex=exchange(raw);
 const r=applyScanResult(state('chat:v0534-structured'),payload(patch({semanticUpdates:[{field:'appearance',operation:'establish',value:'Dark hair, grey wool vest, and bleached linen sleeves.',sources:[{messageId:1,excerpt:'NPCs Present: Linnea Rost | bleached linen sleeves | G1'}]},{field:'memories',operation:'establish',value:["Processed Lucien Noctis's completed provisional registration."],sources:[{messageId:1,excerpt:reg}]}]})),opts(ex));
 const npc=r.state.npcs.find(n=>n.name==='Linnea Rost');
 assert.equal(npc.appearance,'');
 assert.deepEqual(npc.memories,["Processed Lucien Noctis's completed provisional registration."]);
 assert.equal(r.semanticDiagnostics.some(d=>d.field==='appearance'&&d.reason==='out-of-scope-source'),true);
});
