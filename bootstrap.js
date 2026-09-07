/* NPC State 0.5.5 - authoritative checked-in runtime bootstrap */
if (!document.getElementById('npc_state_v3_editor_flex_fix')) {
    const style = document.createElement('style');
    style.id = 'npc_state_v3_editor_flex_fix';
    style.textContent = `
.npc-state-v3-editor-grid{min-height:0}
.npc-state-v3-editor-overlay[popover]{
  margin:0!important;
  border:0!important;
  width:auto!important;
  height:auto!important;
  max-width:none!important;
  max-height:none!important;
}
@media(max-width:1180px),(hover:none) and (pointer:coarse){
  .npc-state-v3-editor-overlay{
    align-items:flex-start!important;
    overflow-y:auto!important;
    overscroll-behavior:contain;
    -webkit-overflow-scrolling:touch;
    padding:12px 2vw 16px!important;
  }
  .npc-state-v3-editor-shell{
    height:auto!important;
    max-height:none!important;
    min-height:0;
  }
  .npc-state-v3-editor-grid{
    flex:0 0 auto!important;
    overflow:visible!important;
  }
}`;
    document.head.appendChild(style);
}
const settingsResponsiveHref = new URL('./src/settings-responsive.css', import.meta.url).href;
if (!document.querySelector('link[data-npc-state-settings-responsive]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = settingsResponsiveHref;
    link.dataset.npcStateSettingsResponsive = '1';
    document.head.appendChild(link);
}
await import('./src/index.js');
const { startSettingsLayoutCoordinator } = await import('./src/settings-layout.js');
startSettingsLayoutCoordinator();
const { startRelationshipHistoryUi } = await import('./src/relationship-history-ui.js');
startRelationshipHistoryUi();
const { startBranchRecoveryUi } = await import('./src/branch-recovery-ui.js');
startBranchRecoveryUi();
const { startManualOperationFeedback } = await import('./src/manual-operation-feedback.js');
startManualOperationFeedback();
const { startEditorTopLayerBridge } = await import('./src/editor-top-layer.js');
startEditorTopLayerBridge();
const { startPortraitAttachmentBridge } = await import('./src/portrait-attachment.js');
startPortraitAttachmentBridge();
