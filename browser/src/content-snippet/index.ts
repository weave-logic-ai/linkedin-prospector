// Snippet content script — Phase 1 Track C + Phase 1.5 image round-trip.
//
// Injected into the active tab on-demand from the side panel via
// chrome.scripting.executeScript once the user has granted the origin. Its
// jobs are:
//   (a) Track the latest non-empty user text selection on the page.
//   (b) Respond to GET_SNIPPET_SELECTION messages with text + page context.
//   (c) (Phase 1.5) Respond to GET_SNIPPET_IMAGE_FROM_URL messages by
//       fetching the image bytes from the host page — this is necessary
//       because the LinkedIn image CDN returns different CORS headers when
//       a fetch originates from the extension's chrome-extension:// origin
//       vs. the host page. Running the fetch in the content script's world
//       preserves page credentials and respects same-origin rules.
//
// No on-page overlay is injected — the widget UI lives entirely in the side
// panel per the Phase 1 Track C design notes. Marquee region-select is
// deferred to later phases.

import type {
  ExtensionMessage,
  SnippetSelectionResponse,
  SnippetImageFromUrlResponse,
} from '../types';

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

// ============================================================
// Phase 1.5 — image fetch helpers
// ============================================================

const IMAGE_MIME_WHITELIST = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

// 5 MB cap, mirrored server-side (see MAX_IMAGE_BYTES in blob-store.ts).
const IMAGE_BYTE_LIMIT = 5 * 1024 * 1024;

/**
 * Arrayify a buffer into base64 without blowing the stack on large images.
 * btoa() on a String built via String.fromCharCode(...large-array) hits
 * "Maximum call stack size exceeded". Instead, build a binary-string in
 * 8-KB chunks and btoa at the end.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, Array.from(slice) as number[]);
  }
  return btoa(binary);
}

/**
 * Measure an image's natural dimensions by loading it into an HTMLImageElement.
 * Returns null dimensions if the image is not decodable (e.g. HEAD-only
 * response with no bytes). This is best-effort metadata; the server records
 * whatever the client sends.
 */
function measureImageDimensions(
  blobUrl: string
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(blobUrl);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(blobUrl);
    };
    img.src = blobUrl;
  });
}

/**
 * Fetch an image URL from the host page context and return the bytes as
 * base64 + its measured metadata. The fetch runs here (not in the side
 * panel) so image CDNs that gate on referer/same-origin permit the request.
 */
async function fetchImageFromUrl(
  imageUrl: string
): Promise<SnippetImageFromUrlResponse> {
  try {
    const res = await fetch(imageUrl, { credentials: 'include' });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!IMAGE_MIME_WHITELIST.has(contentType)) {
      return {
        ok: false,
        error: `unsupported content-type: ${contentType || 'unknown'}`,
      };
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) {
      return { ok: false, error: 'empty response body' };
    }
    if (buffer.byteLength > IMAGE_BYTE_LIMIT) {
      return {
        ok: false,
        error: `image exceeds 5 MB (got ${buffer.byteLength})`,
      };
    }
    const bytes = new Uint8Array(buffer);
    const blobUrl = URL.createObjectURL(
      new Blob([bytes], { type: contentType })
    );
    const dims = await measureImageDimensions(blobUrl);
    return {
      ok: true,
      imageBytes: bytesToBase64(bytes),
      mimeType: contentType,
      width: dims?.width,
      height: dims?.height,
      sourceUrl: imageUrl,
      pageUrl: location.href,
      pageTitle: document.title,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'fetch failed' };
  }
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === 'GET_SNIPPET_SELECTION') {
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

    if (message.type === 'GET_SNIPPET_IMAGE_FROM_URL') {
      const payload = (message.payload as { imageUrl?: string }) ?? {};
      const url = payload.imageUrl;
      if (!url) {
        const response: SnippetImageFromUrlResponse = {
          ok: false,
          error: 'imageUrl missing',
        };
        sendResponse(response);
        return false;
      }
      // Tell Chrome we'll respond asynchronously by returning true; the
      // promise resolution calls sendResponse.
      void fetchImageFromUrl(url).then(sendResponse);
      return true;
    }

    // Other content scripts may handle other messages.
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
