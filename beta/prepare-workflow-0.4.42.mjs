import fs from 'node:fs';

const path = '.github/workflows/seed-beta.yml';
let source = fs.readFileSync(path, 'utf8');
function replaceRequired(from, to, label) {
    if (source.includes(to)) return;
    if (!source.includes(from)) throw new Error('Missing v0.4.42 workflow marker: ' + label);
    source = source.replace(from, to);
}

replaceRequired('name: Build NPC State 0.4.41 Beta', 'name: Build NPC State 0.4.42 Beta', 'workflow title');
replaceRequired(
`      # Once CI has committed the regenerated v0.4.41 runtime, test that exact checkout
      # before replacing v03 from the pinned stable baseline. During the one-time transition
      # from the checked-in v0.4.40 runtime, the cold build generates v0.4.41 first.`,
`      # Once CI has committed the regenerated v0.4.42 runtime, test that exact checkout
      # before replacing v03 from the pinned stable baseline. During the one-time transition
      # from the checked-in v0.4.41 runtime, the cold build generates v0.4.42 first.`, 'checkout comments');
replaceRequired(`          if grep -q '"version": "0.4.41"' manifest.json; then`, `          if grep -q '"version": "0.4.42"' manifest.json; then`, 'source gate');
replaceRequired('            echo "Checked-in runtime predates v0.4.41; cold build will generate v0.4.41 first."', '            echo "Checked-in runtime predates v0.4.42; cold build will generate v0.4.42 first."', 'transition message');
replaceRequired('      - name: Apply 0.4.41 transformation in ordered phases', '      - name: Apply 0.4.42 transformation in ordered phases', 'transform step');
replaceRequired('          for patch in $(seq 2 41); do', '          for patch in $(seq 2 42); do', 'patch loop');
replaceRequired(
`          # node beta/bump-0.4.41.mjs ; -name 'phase*-0.4.41.mjs'`,
`          # node beta/bump-0.4.41.mjs ; -name 'phase*-0.4.41.mjs'
          # node beta/bump-0.4.42.mjs ; -name 'phase*-0.4.42.mjs'`, 'source marker');
replaceRequired(
`          grep -q '"version": "0.4.41"' manifest.json

      - name: Commit generated beta runtime`,
`          grep -q '"version": "0.4.41"' manifest.json

          # v0.4.42 alternate scan connection and same-exchange completeness invariants.
          grep -q "PHASE86_ALTERNATE_SCAN_PROFILE_COMPLETENESS" v03/scanner.js
          grep -q "ConnectionManagerRequestService" v03/scan-connection.js
          grep -q "service.sendRequest" v03/scan-connection.js
          grep -q "scanConnectionProfileId: ''" v03/index.js
          grep -q "scanAfterEachResponse: false" v03/index.js
          grep -q "processCompletedAssistantResponse(messageId)" v03/index.js
          grep -q "npc_state_beta_completion_v1" v03/index.js
          grep -q "buildCompletenessPrompt" v03/scanner.js
          grep -q "async function completenessScan" v03/engine.js
          grep -q "supplementalPass: true" v03/engine.js
          grep -q "invalidateCompleteness" v03/engine.js
          grep -q "resolveGenerationRoute" v03/engine.js
          grep -q "npc_state_v3_scan_profile" v03/ui.js
          grep -q "npc_state_v3_scan_after_response" v03/ui.js
          ! grep -q "apiKey" v03/scan-connection.js
          grep -q '"version": "0.4.42"' manifest.json

      - name: Commit generated beta runtime`, 'architecture gate');
replaceRequired('          git commit -m "NPC State v0.4.41: stop settings observer loop and recovery full-state reads"', '          git commit -m "NPC State v0.4.42: add scan profiles and safe completeness pass"', 'generated commit message');
fs.writeFileSync(path, source);
console.log('Prepared v0.4.42 release workflow');
