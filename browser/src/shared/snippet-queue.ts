// WS-3 Phase 6 §10 — snippet offline queue.
//
// When the sidebar's POST /api/extension/snippet fails with a network error
// or a 5xx, the payload is serialised into `chrome.storage.local.snippetQueue`
// for later replay. The service worker drains the queue on:
//   (a) incoming WS `CAPTURE_CONFIRMED` / `PARSE_COMPLETE` events (proxies
//       for "server is reachable again"), AND
//   (b) a 30-second interval alarm (`SNIPPET_QUEUE_FLUSH_ALARM`).
//
// This module centralises the storage shape + enqueue/dequeue helpers so both
// the sidebar (producer) and the service worker (consumer) speak the same
// structure.

export interface QueuedSnippet {
  id: string;
  createdAt: string;
  /** Absolute path — always `/api/extension/snippet`. */
  path: string;
  body: unknown;
  retryCount: number;
  /** Last error message (truncated). Used for surfacing to the user. */
  lastError?: string;
}

export const SNIPPET_QUEUE_KEY = 'snippetQueue';
export const SNIPPET_QUEUE_MAX = 50;
export const SNIPPET_QUEUE_MAX_RETRIES = 5;
export const SNIPPET_QUEUE_FLUSH_ALARM = 'snippet-queue-flush';
/** 30 seconds per the spec's "30-second timer" trigger. */
export const SNIPPET_QUEUE_FLUSH_INTERVAL_MIN = 0.5;

export async function getSnippetQueue(): Promise<QueuedSnippet[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SNIPPET_QUEUE_KEY, (v) => {
      const list = (v[SNIPPET_QUEUE_KEY] as QueuedSnippet[] | undefined) ?? [];
      resolve(Array.isArray(list) ? list : []);
    });
  });
}

export async function getSnippetQueueDepth(): Promise<number> {
  const queue = await getSnippetQueue();
  return queue.length;
}

export async function enqueueSnippet(
  body: unknown,
  error?: string
): Promise<QueuedSnippet> {
  const queue = await getSnippetQueue();
  const item: QueuedSnippet = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    path: '/api/extension/snippet',
    body,
    retryCount: 0,
    lastError: error ? error.slice(0, 400) : undefined,
  };
  // Cap at SNIPPET_QUEUE_MAX — drop the oldest if we're at limit. Matches the
  // capture-queue behaviour in utils/storage.ts.
  while (queue.length >= SNIPPET_QUEUE_MAX) queue.shift();
  queue.push(item);
  await chrome.storage.local.set({ [SNIPPET_QUEUE_KEY]: queue });
  return item;
}

export async function removeSnippetFromQueue(id: string): Promise<void> {
  const queue = await getSnippetQueue();
  const next = queue.filter((q) => q.id !== id);
  await chrome.storage.local.set({ [SNIPPET_QUEUE_KEY]: next });
}

export async function updateSnippetQueueItem(
  id: string,
  patch: Partial<QueuedSnippet>
): Promise<void> {
  const queue = await getSnippetQueue();
  const idx = queue.findIndex((q) => q.id === id);
  if (idx === -1) return;
  queue[idx] = { ...queue[idx], ...patch };
  await chrome.storage.local.set({ [SNIPPET_QUEUE_KEY]: queue });
}

export async function clearSnippetQueue(): Promise<void> {
  await chrome.storage.local.set({ [SNIPPET_QUEUE_KEY]: [] });
}

/**
 * Replay queued snippets against the app. Returns the count of successfully
 * flushed items + the updated queue length. Errors are captured and stored
 * against each item so subsequent retries can reason about them; items that
 * exceed `SNIPPET_QUEUE_MAX_RETRIES` are dropped.
 *
 * This is invoked from the service worker on the flush alarm and on WS
 * `CAPTURE_CONFIRMED`/`PARSE_COMPLETE` (proxies for connectivity returning).
 */
export async function flushSnippetQueue(options: {
  appUrl: string;
  extensionToken: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ processed: number; remaining: number }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const queue = await getSnippetQueue();
  if (queue.length === 0) return { processed: 0, remaining: 0 };

  // Preserve order-of-insertion — matches the original enqueue ordering.
  let processed = 0;
  for (const item of [...queue]) {
    if (item.retryCount >= SNIPPET_QUEUE_MAX_RETRIES) {
      await removeSnippetFromQueue(item.id);
      continue;
    }
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (options.extensionToken) {
        headers['X-Extension-Token'] = options.extensionToken;
      }
      const res = await fetchImpl(`${options.appUrl}${item.path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(item.body),
      });
      if (res.ok) {
        await removeSnippetFromQueue(item.id);
        processed += 1;
        continue;
      }
      // 4xx: validation-level, not retryable — drop.
      if (res.status >= 400 && res.status < 500) {
        await removeSnippetFromQueue(item.id);
        continue;
      }
      // 5xx: bump the retry count and leave the item for next pass.
      await updateSnippetQueueItem(item.id, {
        retryCount: item.retryCount + 1,
        lastError: `HTTP ${res.status}`,
      });
      // Stop iterating on a 5xx — preserves FIFO order and avoids hammering
      // a server that's struggling.
      break;
    } catch (err) {
      await updateSnippetQueueItem(item.id, {
        retryCount: item.retryCount + 1,
        lastError: (err as Error).message ?? 'network error',
      });
      break;
    }
  }

  const after = await getSnippetQueue();
  return { processed, remaining: after.length };
}
