// Snippet content script — Phase 1 Track C.
//
// Injected into the active tab on-demand from the side panel via
// chrome.scripting.executeScript once the user has granted the origin. Thin
// by design: listens for text selection on the page and responds with the
// current selection payload when the side panel asks for it.
//
// No floating on-page overlay — the widget UI lives in the side panel per
// the Phase 1 Track C design notes. This script's entire job is:
//   (a) Track the latest non-empty user text selection on the page.
//   (b) Respond to GET_SNIPPET_SELECTION messages with text + page context.
//
// Image, link, and marquee flows are deferred to Phase 1.5.

import type { ExtensionMessage, SnippetSelectionResponse } from '../types';

// Preserve the last non-empty selection. selectionchange can fire with an
// empty selection when the user clicks elsewhere — we want to still serve
// the previous selection because the sidebar is in a different frame and
// opening it clears window.getSelection() on some browsers.
let lastSelectionText = '';

function captureSelection(): void {
  const sel = window.getSelection();
  const text = sel ? sel.toString() : '';
  if (text && text.trim().length > 0) {
    lastSelectionText = text;
  }
}

document.addEventListener('selectionchange', captureSelection, {
  passive: true,
});
// Seed once on load in case the user selected before the script arrived.
captureSelection();

function detectPageType(url: string): string | null {
  try {
    const u = new URL(url);
    if (/web\.archive\.org/.test(u.hostname)) return 'WAYBACK';
    if (/sec\.gov/.test(u.hostname)) return 'EDGAR';
    if (/linkedin\.com/.test(u.hostname)) return 'LINKEDIN';
    return null;
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type !== 'GET_SNIPPET_SELECTION') {
      // Defer to any other content scripts that may also be listening — we
      // only claim this single message type.
      return false;
    }
    // Prefer a live non-empty selection; fall back to the cached one.
    const live = window.getSelection()?.toString() ?? '';
    const text = live.trim().length > 0 ? live : lastSelectionText;
    const response: SnippetSelectionResponse = {
      text: text.trim(),
      sourceUrl: location.href,
      pageTitle: document.title,
      pageType: detectPageType(location.href),
    };
    sendResponse(response);
    return false;
  }
);

// Self-announce so the side panel can know the script is live. This is a
// no-op if no listener is registered in the service worker.
try {
  chrome.runtime.sendMessage({
    type: 'PAGE_INFO',
    payload: { snippetContentScriptReady: true, url: location.href },
  } satisfies ExtensionMessage);
} catch {
  // Extension context may not be available (e.g. after reload); ignore.
}
