/**
 * The editor's own markup, injected into the mount root. Every lookup in the
 * engine goes through the root's own querySelector, so the ids below are
 * per-instance.
 */

import { RO } from './copy';

export const TEMPLATE = `
<div id="app">
  <main id="stage" data-testid="stage">
    <svg id="roomSvg" data-testid="editor-svg" preserveAspectRatio="xMidYMid meet" viewBox="-200 -200 400 400"></svg>
    <div id="ctrlLayer"></div>
    <div class="fp-plate fp-tools" id="toolPlate"></div>
    <div class="fp-hint" id="hintLine" data-testid="hint"></div>
    <div class="fp-plate fp-hist" id="histPlate"></div>
    <div class="fp-plate fp-view" id="viewPlate"></div>
  </main>
</div>

<div id="confirmDialog" class="fp-off" data-testid="confirm-dialog">
  <div class="fp-confirm">
    <p id="confirmDialogText"></p>
    <div class="fp-row">
      <button type="button" class="fp-primary" id="confirmYesBtn" data-testid="confirm-yes"></button>
      <button type="button" id="confirmNoBtn" data-testid="confirm-no">${RO.letMeFix}</button>
    </div>
  </div>
</div>
`;
