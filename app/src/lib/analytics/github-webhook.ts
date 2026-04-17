// WS-2 §14 — GitHub issue webhook dispatcher for parser-regression reports.
//
// When the regression endpoint (`/api/parser/flag-unmatched`) finishes a DB
// insert, it calls `dispatchRegressionToGithub` so a configured GitHub issue
// webhook can mirror the report into an issue tracker. The dispatch is
// always best-effort: a webhook failure must never fail the endpoint — we
// log-warn and swallow (see the acceptance item in §14).
//
// Env gating:
//   - Dispatch is a no-op when `GITHUB_REPORT_WEBHOOK_URL` is unset.
//   - `GITHUB_REPORT_WEBHOOK_TOKEN` is optional; if set, we include it as a
//     bearer token (works with both GitHub PAT + generic webhook receivers).
//
// Timeout + retry:
//   - Each attempt has a 5-second timeout via AbortController.
//   - Up to 2 retries on network errors / 5xx, with a 500ms linear backoff.
//   - 4xx responses are NOT retried (bad payload — more attempts won't fix).

export interface GithubRegressionPayload {
  title: string;
  body: string;
  labels: string[];
}

export interface GithubDispatchResult {
  dispatched: boolean;
  status?: number;
  attempts: number;
  error?: string;
  skippedReason?: 'no-webhook-url';
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 3;

interface DispatchOptions {
  webhookUrl?: string | null;
  webhookToken?: string | null;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Override `fetch` (used in tests). */
  fetchImpl?: typeof fetch;
  /** Await between retries. Default uses `setTimeout`. */
  sleepImpl?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveEnvUrl(): string | null {
  const v = process.env.GITHUB_REPORT_WEBHOOK_URL;
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function resolveEnvToken(): string | null {
  const v = process.env.GITHUB_REPORT_WEBHOOK_TOKEN;
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Format a `parser_selector_flags` row as a GitHub-issue-shaped payload.
 *
 * Title: `Parser regression: <pageType> · <short dom path>`
 * Labels: always includes `parser-regression` + the lower-cased pageType.
 * Body : human-readable markdown with the dom path, text preview, and the
 *        user note (when present). The full 4KB HTML excerpt is NOT
 *        embedded — it would bloat the issue and may contain residual
 *        fragments we'd rather reviewers pull on-demand from the DB.
 */
export function buildRegressionPayload(input: {
  captureId: string;
  pageType: string;
  domPath: string;
  textPreview?: string | null;
  userNote?: string | null;
  flagId?: string | null;
}): GithubRegressionPayload {
  const pageType = (input.pageType || 'OTHER').toString();
  const shortPath = (input.domPath || '').slice(0, 80);
  const titleSuffix = shortPath ? ` · ${shortPath}` : '';
  const title = `Parser regression: ${pageType}${titleSuffix}`.slice(0, 180);

  const bodyLines: string[] = [
    `**Page type**: \`${pageType}\``,
    `**Capture ID**: \`${input.captureId}\``,
    `**DOM path**: \`${input.domPath}\``,
  ];
  if (input.flagId) {
    bodyLines.push(`**Flag ID**: \`${input.flagId}\``);
  }
  if (input.textPreview && input.textPreview.trim().length > 0) {
    bodyLines.push('', '**Text preview**:', '```', input.textPreview, '```');
  }
  if (input.userNote && input.userNote.trim().length > 0) {
    bodyLines.push('', '**User note**:', '', input.userNote);
  }
  bodyLines.push(
    '',
    '_Auto-filed by the Network Navigator extension. The full HTML excerpt lives in `parser_selector_flags` — pull with `SELECT dom_html_excerpt FROM parser_selector_flags WHERE id = ...`._'
  );

  // Label normalisation — GitHub label names are case-insensitive but people
  // expect lower-kebab.
  const pageTypeLabel = pageType.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const labels = Array.from(
    new Set(
      ['parser-regression', pageTypeLabel].filter(
        (v) => typeof v === 'string' && v.length > 0
      )
    )
  );

  return { title, body: bodyLines.join('\n'), labels };
}

async function attemptPost(
  url: string,
  payload: GithubRegressionPayload,
  token: string | null,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<{ ok: boolean; status: number; retriable: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const retriable = res.status >= 500 && res.status < 600;
    return { ok: res.ok, status: res.status, retriable };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    // Treat network / abort errors as retriable.
    return { ok: false, status: 0, retriable: true, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dispatch a regression report to the GitHub webhook configured via
 * `GITHUB_REPORT_WEBHOOK_URL`. Never throws — callers can `await` and ignore
 * the promise rejection path.
 */
export async function dispatchRegressionToGithub(
  payload: GithubRegressionPayload,
  options: DispatchOptions = {}
): Promise<GithubDispatchResult> {
  const webhookUrl = options.webhookUrl ?? resolveEnvUrl();
  if (!webhookUrl) {
    return {
      dispatched: false,
      attempts: 0,
      skippedReason: 'no-webhook-url',
    };
  }

  const token = options.webhookToken ?? resolveEnvToken();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? defaultSleep;

  let attempts = 0;
  let lastError: string | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    const r = await attemptPost(webhookUrl, payload, token, timeoutMs, fetchImpl);
    lastStatus = r.status;
    if (r.ok) {
      return { dispatched: true, status: r.status, attempts };
    }
    lastError = r.error ?? `HTTP ${r.status}`;
    if (!r.retriable) break;
    if (attempt < maxAttempts) {
      await sleepImpl(500 * attempt); // linear backoff (500, 1000, ...)
    }
  }

  // Never throw — log and return a failure marker so callers can continue.
  if (process.env.NODE_ENV !== 'test') {
    console.warn(
      `[github-webhook] dispatch failed after ${attempts} attempts: ${lastError}`
    );
  }

  return {
    dispatched: false,
    status: lastStatus,
    attempts,
    error: lastError,
  };
}
