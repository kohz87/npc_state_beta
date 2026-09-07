const settingsResponsiveHref = new URL('./src/settings-responsive.css', import.meta.url).href;
if (!document.querySelector('link[data-npc-state-settings-responsive]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = settingsResponsiveHref;
    link.dataset.npcStateSettingsResponsive = '1';
    document.head.appendChild(link);
}
// Load the authoritative runtime and independent UI integrations once.
await import('./src/index.js');
const { startSettingsLayoutCoordinator } = await import('./src/settings-layout.js');
startSettingsLayoutCoordinator();
const { startRelationshipHistoryUi } = await import('./src/relationship-history-ui.js');
startRelationshipHistoryUi();
const { startBranchRecoveryUi } = await import('./src/branch-recovery-ui.js');
startBranchRecoveryUi();
const { startManualOperationFeedback } = await import('./src/manual-operation-feedback.js');
startManualOperationFeedback();
const { startPortraitAttachmentBridge } = await import('./src/portrait-attachment.js');
startPortraitAttachmentBridge();
