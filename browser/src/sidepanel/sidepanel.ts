// LinkedIn Network Intelligence - Side Panel UI
// Full goal/task display, current page info, activity stats

import type { ExtensionMessage, ExtensionTask, Goal, OutreachTemplate } from '../types';
import { logger } from '../utils/logger';
import { getDailyCaptureCount, getCaptureLimit } from '../utils/storage';

// ============================================================
// DOM References
// ============================================================

const connectionStatus = document.getElementById('sp-connection-status')!;
const pageTypeBadge = document.getElementById('sp-page-type')!;
const scrollDepthEl = document.getElementById('sp-scroll-depth')!;
const captureBtn = document.getElementById('sp-capture-btn')!;
const goalsList = document.getElementById('sp-goals-list')!;
const captureCount = document.getElementById('sp-capture-count')!;
const queueDepthEl = document.getElementById('sp-queue-depth')!;

// Target Panel DOM (Task #10)
const targetLockSource = document.getElementById('sp-target-lock-source')!;
const targetPanel = document.getElementById('sp-target-panel')!;
const targetKind = document.getElementById('sp-target-kind')!;
const targetName = document.getElementById('sp-target-name')!;
const targetHeadline = document.getElementById('sp-target-headline')!;
const targetMeta = document.getElementById('sp-target-meta')!;
const targetReason = document.getElementById('sp-target-reason')!;
const targetEmpty = document.getElementById('sp-target-empty')!;
const targetClearBtn = document.getElementById('sp-target-clear')!;

// Template DOM References (Phase 5)
const templatesList = document.getElementById('sp-templates-list')!;
const templatePreviewPanel = document.getElementById('sp-template-preview-panel')!;
const previewTemplateName = document.getElementById('sp-preview-template-name')!;
const closePreviewBtn = document.getElementById('sp-close-preview-btn')!;
const templateFullPreview = document.getElementById('sp-template-full-preview')!;
const spCopyTemplateBtn = document.getElementById('sp-copy-template-btn')!;
const spPersonalizeBtn = document.getElementById('sp-personalize-btn')!;
const spPersonalizeContactName = document.getElementById('sp-personalize-contact-name')!;
const spTemplateStatus = document.getElementById('sp-template-status')!;

// ============================================================
// Status Update
// ============================================================

function updateConnectionStatus(state: string): void {
  connectionStatus.className = `status-indicator ${state}`;
  connectionStatus.textContent =
    state === 'connected'
      ? 'Connected'
      : state === 'connecting'
        ? 'Connecting...'
        : state === 'error'
          ? 'Error'
          : 'Disconnected';
}

async function updateStatus(): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_STATUS' } satisfies ExtensionMessage,
      (response) => {
        if (response?.data) {
          updateConnectionStatus(response.data.connectionState ?? 'disconnected');
          captureCount.textContent = String(response.data.dailyCaptureCount ?? 0);
          queueDepthEl.textContent = String(response.data.queueDepth ?? 0);
        }
        resolve();
      }
    );
  });
}

async function updatePageInfo(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    try {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: 'GET_STATUS' } satisfies ExtensionMessage,
        (response) => {
          void chrome.runtime.lastError;
          if (response?.payload) {
            const info = response.payload as {
              pageType?: string;
              scrollDepth?: number;
              url?: string;
            };
            pageTypeBadge.textContent = info.pageType ?? '--';
            scrollDepthEl.textContent = `${Math.round((info.scrollDepth ?? 0) * 100)}%`;
            (captureBtn as HTMLButtonElement).disabled = info.pageType === 'OTHER' || !info.pageType;
          } else {
            pageTypeBadge.textContent = '--';
            (captureBtn as HTMLButtonElement).disabled = true;
          }
        }
      );
    } catch {
      pageTypeBadge.textContent = '--';
      (captureBtn as HTMLButtonElement).disabled = true;
    }
  }
}

// ============================================================
// Goals and Tasks Rendering
// ============================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderGoals(goals: Goal[]): void {
  if (goals.length === 0) {
    goalsList.innerHTML = '<p class="placeholder-text">No active goals</p>';
    return;
  }

  goalsList.innerHTML = goals
    .map(
      (goal) => `
    <div class="goal-card">
      <div class="goal-title">${escapeHtml(goal.title)}</div>
      <div class="goal-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${goal.progress * 100}%"></div>
        </div>
        <span class="progress-text">${goal.completedTasks}/${goal.totalTasks}</span>
      </div>
      <ul class="goal-tasks">
        ${goal.tasks
          .slice(0, 10)
          .map(
            (task) => `
          <li class="task-item" data-task-id="${task.id}">
            <span class="task-check ${task.status === 'completed' ? 'completed' : ''}"
                  data-task-id="${task.id}"></span>
            <span class="task-priority ${task.priority}"></span>
            <span class="task-title ${task.status === 'completed' ? 'completed' : ''} ${task.targetUrl ? 'task-navigable' : ''}"
                  ${task.targetUrl ? `data-url="${escapeHtml(task.targetUrl)}"` : ''}>${escapeHtml(task.title)}</span>
          </li>
        `
          )
          .join('')}
      </ul>
    </div>
  `
    )
    .join('');

  // Attach click handlers for task completion
  goalsList.querySelectorAll('.task-check').forEach((el) => {
    el.addEventListener('click', async () => {
      const taskId = (el as HTMLElement).dataset.taskId;
      if (!taskId) return;
      const isCompleted = el.classList.contains('completed');
      const newStatus = isCompleted ? 'pending' : 'completed';

      // Optimistic update
      el.classList.toggle('completed');
      const titleEl = el.parentElement?.querySelector('.task-title');
      if (titleEl) titleEl.classList.toggle('completed');

      // Send to service worker (which will call API)
      chrome.runtime.sendMessage({
        type: 'TASKS_UPDATE' as ExtensionMessage['type'],
        payload: { taskId, status: newStatus },
      });
    });
  });

  // Attach click-to-navigate handlers on task titles
  goalsList.querySelectorAll('.task-navigable').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = (el as HTMLElement).dataset.url;
      if (!url) return;

      // Side panel shares the window with the active tab -- navigate it directly
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.tabs.update(activeTab.id, { url });
      }
    });
  });
}

// ============================================================
// Templates (Phase 5)
// ============================================================

let spLoadedTemplates: OutreachTemplate[] = [];
let spSelectedTemplate: OutreachTemplate | null = null;
let spCurrentContactName: string = 'contact';
let spCurrentContactUrl: string = '';

const SP_DEFAULT_TEMPLATES: OutreachTemplate[] = [
  {
    id: 'initial_outreach',
    name: 'Initial Outreach',
    category: 'initial_outreach',
    body: 'Hi {{first_name}},\n\nI came across your profile and was impressed by your work in {{industry}}. I would love to connect and learn more about what you are working on.\n\nBest regards',
    variables: ['first_name', 'industry'],
  },
  {
    id: 'follow_up',
    name: 'Follow-up',
    category: 'follow_up',
    body: 'Hi {{first_name}},\n\nI wanted to follow up on my previous message. I think there could be great synergy between our work in {{industry}}. Would you be open to a brief conversation?\n\nBest regards',
    variables: ['first_name', 'industry'],
  },
  {
    id: 'meeting_request',
    name: 'Meeting Request',
    category: 'meeting_request',
    body: 'Hi {{first_name}},\n\nI have been following your work at {{company}} and would love to schedule a brief call to discuss potential collaboration. Would you have 15 minutes this week?\n\nLooking forward to hearing from you.',
    variables: ['first_name', 'company'],
  },
];

function highlightVariables(body: string): string {
  return escapeHtml(body).replace(
    /\{\{(\w+)\}\}/g,
    '<span class="template-variable">{{$1}}</span>'
  );
}

function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function loadSidepanelTemplates(): Promise<void> {
  try {
    const appUrl = await new Promise<string>((resolve) => {
      chrome.storage.local.get('appUrl', (result) => {
        resolve((result.appUrl as string) || 'http://localhost:3750');
      });
    });

    const response = await fetch(`${appUrl}/api/outreach/templates`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.templates && data.templates.length > 0) {
        spLoadedTemplates = data.templates;
        renderTemplateCards();
        return;
      }
    }
  } catch {
    // API unavailable, use defaults
  }

  spLoadedTemplates = SP_DEFAULT_TEMPLATES;
  renderTemplateCards();
}

function renderTemplateCards(): void {
  if (spLoadedTemplates.length === 0) {
    templatesList.innerHTML = '<p class="placeholder-text">No templates available</p>';
    return;
  }

  templatesList.innerHTML = spLoadedTemplates
    .map(
      (tpl) => `
    <div class="template-card" data-template-id="${escapeHtml(tpl.id)}">
      <div class="template-card-header">
        <span class="template-card-name">${escapeHtml(tpl.name)}</span>
        <span class="template-card-category">${formatCategoryLabel(tpl.category)}</span>
      </div>
      <div class="template-card-snippet">${escapeHtml(tpl.body.substring(0, 80))}${tpl.body.length > 80 ? '...' : ''}</div>
      <div class="template-card-actions">
        <button class="template-card-btn template-copy-btn" data-template-id="${escapeHtml(tpl.id)}">Copy</button>
        <button class="template-card-btn template-view-btn" data-template-id="${escapeHtml(tpl.id)}">Preview</button>
      </div>
    </div>
  `
    )
    .join('');

  // Attach copy handlers
  templatesList.querySelectorAll('.template-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tplId = (btn as HTMLElement).dataset.templateId;
      const tpl = spLoadedTemplates.find((t) => t.id === tplId);
      if (!tpl) return;
      try {
        await navigator.clipboard.writeText(tpl.body);
        (btn as HTMLElement).textContent = 'Copied!';
        (btn as HTMLElement).classList.add('copied');
        setTimeout(() => {
          (btn as HTMLElement).textContent = 'Copy';
          (btn as HTMLElement).classList.remove('copied');
        }, 1500);
      } catch {
        // Clipboard write failed
      }
    });
  });

  // Attach preview/view handlers
  templatesList.querySelectorAll('.template-view-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tplId = (btn as HTMLElement).dataset.templateId;
      if (tplId) openTemplatePreview(tplId);
    });
  });

  // Attach card click handler (also opens preview)
  templatesList.querySelectorAll('.template-card').forEach((card) => {
    card.addEventListener('click', () => {
      const tplId = (card as HTMLElement).dataset.templateId;
      if (tplId) openTemplatePreview(tplId);
    });
  });
}

function openTemplatePreview(templateId: string): void {
  const tpl = spLoadedTemplates.find((t) => t.id === templateId);
  if (!tpl) return;

  spSelectedTemplate = tpl;

  // Highlight active card
  templatesList.querySelectorAll('.template-card').forEach((card) => {
    card.classList.toggle('active', (card as HTMLElement).dataset.templateId === templateId);
  });

  previewTemplateName.textContent = tpl.name;
  templateFullPreview.innerHTML = highlightVariables(tpl.body);
  spPersonalizeContactName.textContent = spCurrentContactName;
  templatePreviewPanel.style.display = 'block';
}

function showSpTemplateStatus(message: string, type: 'success' | 'error' | 'info'): void {
  spTemplateStatus.textContent = message;
  spTemplateStatus.className = `template-status ${type}`;
  spTemplateStatus.style.display = 'block';
  setTimeout(() => { spTemplateStatus.style.display = 'none'; }, 3000);
}

closePreviewBtn.addEventListener('click', () => {
  templatePreviewPanel.style.display = 'none';
  spSelectedTemplate = null;
  templatesList.querySelectorAll('.template-card').forEach((card) => {
    card.classList.remove('active');
  });
});

spCopyTemplateBtn.addEventListener('click', async () => {
  if (!spSelectedTemplate) return;
  try {
    await navigator.clipboard.writeText(spSelectedTemplate.body);
    spCopyTemplateBtn.textContent = 'Copied!';
    setTimeout(() => { spCopyTemplateBtn.textContent = 'Copy'; }, 1500);
  } catch {
    showSpTemplateStatus('Failed to copy to clipboard', 'error');
  }
});

spPersonalizeBtn.addEventListener('click', async () => {
  if (!spSelectedTemplate) return;

  spPersonalizeBtn.setAttribute('disabled', 'true');
  spPersonalizeBtn.textContent = 'Personalizing...';

  try {
    const appUrl = await new Promise<string>((resolve) => {
      chrome.storage.local.get('appUrl', (result) => {
        resolve((result.appUrl as string) || 'http://localhost:3750');
      });
    });

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const contactUrl = tabs[0]?.url || spCurrentContactUrl;

    const response = await fetch(`${appUrl}/api/claude/personalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: spSelectedTemplate.id, contactUrl }),
    });

    if (!response.ok) throw new Error('Personalization failed');

    const data = await response.json();
    templateFullPreview.innerHTML = escapeHtml(data.personalizedText);
    showSpTemplateStatus('Template personalized', 'success');
  } catch {
    showSpTemplateStatus('Could not personalize. Check app connection.', 'error');
  } finally {
    spPersonalizeBtn.removeAttribute('disabled');
    spPersonalizeBtn.innerHTML = `Personalize for <span id="sp-personalize-contact-name">${escapeHtml(spCurrentContactName)}</span>`;
  }
});

// Update contact name when page info is available
async function updateContactContext(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.url) return;

  const url = tabs[0].url;
  spCurrentContactUrl = url;

  // Extract name from LinkedIn URL slug
  const profileMatch = url.match(/linkedin\.com\/in\/([^/?]+)/);
  if (profileMatch) {
    const slug = profileMatch[1];
    const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    spCurrentContactName = name;
    const nameEl = document.getElementById('sp-personalize-contact-name');
    if (nameEl) nameEl.textContent = name;
  }
}

// ============================================================
// Target Panel (Task #10)
// ============================================================

type LockSource = 'none' | 'page' | 'task' | 'pinned';

interface ContactTarget {
  kind: 'person';
  id: string;
  name: string;
  headline: string;
  tier: string;
  goldScore: number;
  tasksPending: number;
  lastCapturedAt: string | null;
  lastEnrichedAt: string | null;
  url: string;
}

interface CompanyTarget {
  kind: 'company';
  id: string;
  name: string;
  headline: string; // industry + sizeRange + headquarters, formatted
  contactCount: number;
  tasksPending: number;
  lastCapturedAt: string | null;
  url: string;
}

type Target = ContactTarget | CompanyTarget;

interface LockedTarget {
  target: Target;
  source: Exclude<LockSource, 'none'>;
  reason?: string;
}

// Cache of the currently rendered target to avoid redundant fetches
let lastRenderedLock: string = '';

async function getAppUrlBase(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('appUrl', (result) => {
      resolve((result.appUrl as string) || 'http://localhost:3750');
    });
  });
}

async function fetchWithAuth(path: string): Promise<Response | null> {
  try {
    const appUrl = await getAppUrlBase();
    const { extensionToken } = await new Promise<{ extensionToken?: string }>((r) =>
      chrome.storage.local.get('extensionToken', (v) => r(v)),
    );
    const res = await fetch(`${appUrl}${path}`, {
      headers: extensionToken
        ? { Authorization: `Bearer ${extensionToken}` }
        : {},
    });
    return res;
  } catch {
    return null;
  }
}

async function lookupContact(url: string): Promise<ContactTarget | null> {
  const stripped = url.replace(/^https?:\/\//, '');
  const res = await fetchWithAuth(`/api/extension/contact/${stripped}`);
  if (!res || !res.ok) return null;
  const json = await res.json();
  if (!json.found || !json.contact) return null;
  return {
    kind: 'person',
    id: json.contact.id,
    name: json.contact.name,
    headline: json.contact.headline ?? '',
    tier: json.contact.tier ?? 'unscored',
    goldScore: json.contact.goldScore ?? 0,
    tasksPending: json.contact.tasksPending ?? 0,
    lastCapturedAt: json.contact.lastCapturedAt ?? null,
    lastEnrichedAt: json.contact.lastEnrichedAt ?? null,
    url,
  };
}

async function lookupCompany(url: string): Promise<CompanyTarget | null> {
  const stripped = url.replace(/^https?:\/\//, '');
  const res = await fetchWithAuth(`/api/extension/company/${stripped}`);
  if (!res || !res.ok) return null;
  const json = await res.json();
  if (!json.found || !json.company) return null;
  const c = json.company;
  const headlineParts = [c.industry, c.sizeRange, c.headquarters].filter(Boolean);
  return {
    kind: 'company',
    id: c.id,
    name: c.name,
    headline: headlineParts.join(' · '),
    contactCount: c.contactCount ?? 0,
    tasksPending: c.tasksPending ?? 0,
    lastCapturedAt: c.lastCapturedAt ?? null,
    url,
  };
}

async function resolveCurrentTargetFromTasks(
  currentUrl: string,
): Promise<LockedTarget | null> {
  const tasks = await new Promise<ExtensionTask[]>((r) =>
    chrome.storage.local.get('pendingTasks', (v) =>
      r((v.pendingTasks as ExtensionTask[]) || []),
    ),
  );
  // Prefer an in_progress task whose targetUrl matches the current URL and has a contactId
  const normalized = currentUrl.replace(/\?.*$/, '').replace(/\/$/, '');
  const matched = tasks.find((t) => {
    if (!t.contactId || t.status === 'completed') return false;
    if (!t.targetUrl) return false;
    const tu = t.targetUrl.replace(/\?.*$/, '').replace(/\/$/, '');
    return tu === normalized || normalized.startsWith(tu);
  });
  if (!matched || !matched.targetUrl) return null;
  const contact = await lookupContact(matched.targetUrl);
  if (!contact) return null;
  return {
    target: contact,
    source: 'task',
    reason: `Locked from task: ${matched.title}`,
  };
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  if (diffMs < 0) return 'future';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function renderTarget(lock: LockedTarget | null): void {
  if (!lock) {
    targetPanel.style.display = 'none';
    targetEmpty.style.display = '';
    targetLockSource.setAttribute('data-source', 'none');
    targetLockSource.textContent = 'No target';
    return;
  }

  targetPanel.style.display = '';
  targetEmpty.style.display = 'none';
  targetLockSource.setAttribute('data-source', lock.source);
  targetLockSource.textContent =
    lock.source === 'page'
      ? 'Page lock'
      : lock.source === 'task'
        ? 'Task lock'
        : lock.source === 'pinned'
          ? 'Pinned'
          : 'No target';

  const t = lock.target;
  targetKind.textContent = t.kind;
  targetKind.setAttribute('data-kind', t.kind);
  targetName.textContent = t.name;
  targetHeadline.textContent = t.headline;

  // Meta grid
  const rows: Array<[string, string, string?]> = [];
  if (t.kind === 'person') {
    rows.push(['Tier', t.tier.toUpperCase(), `tier-${t.tier}`]);
    rows.push(['Score', t.goldScore ? t.goldScore.toFixed(1) : '—']);
    rows.push(['Pending tasks', String(t.tasksPending)]);
    rows.push(['Last captured', formatRelativeTime(t.lastCapturedAt)]);
  } else {
    rows.push(['Contacts here', String(t.contactCount)]);
    rows.push(['Pending tasks', String(t.tasksPending)]);
    rows.push(['Last captured', formatRelativeTime(t.lastCapturedAt)]);
  }
  targetMeta.innerHTML = rows
    .map(
      ([label, value, cls]) => `
        <div class="meta-row">
          <span class="meta-label">${label}</span>
          <span class="meta-value${cls ? ' ' + cls : ''}">${escapeHtml(value)}</span>
        </div>`,
    )
    .join('');

  if (lock.reason) {
    targetReason.textContent = lock.reason;
    targetReason.style.display = '';
  } else {
    targetReason.style.display = 'none';
  }

  // Show clear button only when lock is task (user can "break" the task lock
  // by navigating to a different page — page-locks auto-clear on nav).
  targetClearBtn.style.display = lock.source === 'task' ? '' : 'none';
}

let taskLockCleared = false;

async function updateTargetPanel(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url) {
    renderTarget(null);
    return;
  }

  const url = tab.url;
  const pageType = detectPageTypeFromUrl(url);

  let lock: LockedTarget | null = null;

  // 1. Task-lock takes priority unless user cleared it for this URL
  if (!taskLockCleared) {
    lock = await resolveCurrentTargetFromTasks(url);
  }

  // 2. Page auto-lock on PROFILE / COMPANY when no task-lock
  if (!lock) {
    if (pageType === 'PROFILE') {
      const contact = await lookupContact(url);
      if (contact) lock = { target: contact, source: 'page' };
    } else if (pageType === 'COMPANY') {
      const company = await lookupCompany(url);
      if (company) lock = { target: company, source: 'page' };
    }
  }

  const cacheKey = lock
    ? `${lock.source}:${lock.target.kind}:${lock.target.id}`
    : 'none';
  if (cacheKey === lastRenderedLock) return;
  lastRenderedLock = cacheKey;

  renderTarget(lock);

  // Feed downstream template personalization
  if (lock && lock.target.kind === 'person') {
    spCurrentContactName = lock.target.name;
    spCurrentContactUrl = lock.target.url;
    const nameEl = document.getElementById('sp-personalize-contact-name');
    if (nameEl) nameEl.textContent = lock.target.name;
  }
}

function detectPageTypeFromUrl(url: string): string {
  if (/linkedin\.com\/in\/[^/?]+/.test(url)) return 'PROFILE';
  if (/linkedin\.com\/company\/[^/?]+/.test(url)) return 'COMPANY';
  if (/linkedin\.com\/search\/results\/people/.test(url)) return 'SEARCH_PEOPLE';
  if (/linkedin\.com\/search\/results\/content/.test(url)) return 'SEARCH_CONTENT';
  if (/linkedin\.com\/mynetwork/.test(url)) return 'CONNECTIONS';
  if (/linkedin\.com\/messaging/.test(url)) return 'MESSAGES';
  if (/linkedin\.com\/feed/.test(url)) return 'FEED';
  return 'OTHER';
}

targetClearBtn.addEventListener('click', () => {
  taskLockCleared = true;
  lastRenderedLock = '';
  void updateTargetPanel();
});

// Reset task-lock clear when the tab URL changes (new page, fresh decision)
chrome.tabs.onActivated.addListener(() => {
  taskLockCleared = false;
  lastRenderedLock = '';
});
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === 'complete' || info.url) {
    taskLockCleared = false;
    lastRenderedLock = '';
  }
});

// ============================================================
// Capture Button
// ============================================================

captureBtn.addEventListener('click', () => {
  captureBtn.setAttribute('disabled', 'true');
  captureBtn.textContent = 'Capturing...';

  chrome.runtime.sendMessage(
    { type: 'CAPTURE_REQUEST' } satisfies ExtensionMessage,
    (_response) => {
      captureBtn.textContent = 'Captured!';
      setTimeout(() => {
        captureBtn.removeAttribute('disabled');
        captureBtn.textContent = 'Capture This Page';
        updateStatus();
      }, 1500);
    }
  );
});

// ============================================================
// Storage Change Listener
// ============================================================

chrome.storage.onChanged.addListener((changes) => {
  if (changes.connectionState) {
    updateConnectionStatus(changes.connectionState.newValue);
  }
  if (changes.pendingTasks) {
    // Re-resolve target lock when the task list changes — a new task may now match the current URL
    lastRenderedLock = '';
    void updateTargetPanel();
    const tasks = (changes.pendingTasks.newValue || []) as ExtensionTask[];
    // Group tasks into goals
    const goalsMap = new Map<string, Goal>();
    for (const task of tasks) {
      const goalId = task.goalId || 'ungrouped';
      if (!goalsMap.has(goalId)) {
        goalsMap.set(goalId, {
          id: goalId,
          title: task.goalTitle || 'Tasks',
          progress: 0,
          totalTasks: 0,
          completedTasks: 0,
          tasks: [],
        });
      }
      const goal = goalsMap.get(goalId)!;
      goal.tasks.push(task);
      goal.totalTasks++;
      if (task.status === 'completed') goal.completedTasks++;
    }
    for (const goal of goalsMap.values()) {
      goal.progress =
        goal.totalTasks > 0 ? goal.completedTasks / goal.totalTasks : 0;
    }
    renderGoals(Array.from(goalsMap.values()));
  }
  if (changes.dailyCaptureCount) {
    captureCount.textContent = String(changes.dailyCaptureCount.newValue ?? 0);
  }
});

// ============================================================
// Tab Change Listener
// ============================================================

chrome.tabs.onActivated.addListener(async () => {
  await updatePageInfo();
  await updateTargetPanel();
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    await updatePageInfo();
    await updateTargetPanel();
  }
});

// ============================================================
// Initialize
// ============================================================

async function init(): Promise<void> {
  await updateStatus();
  await updatePageInfo();

  // Load tasks from storage
  chrome.storage.local.get('pendingTasks', (result) => {
    const tasks = (result.pendingTasks || []) as ExtensionTask[];
    const goalsMap = new Map<string, Goal>();
    for (const task of tasks) {
      const goalId = task.goalId || 'ungrouped';
      if (!goalsMap.has(goalId)) {
        goalsMap.set(goalId, {
          id: goalId,
          title: task.goalTitle || 'Tasks',
          progress: 0,
          totalTasks: 0,
          completedTasks: 0,
          tasks: [],
        });
      }
      const goal = goalsMap.get(goalId)!;
      goal.tasks.push(task);
      goal.totalTasks++;
      if (task.status === 'completed') goal.completedTasks++;
    }
    for (const goal of goalsMap.values()) {
      goal.progress =
        goal.totalTasks > 0 ? goal.completedTasks / goal.totalTasks : 0;
    }
    renderGoals(Array.from(goalsMap.values()));
  });

  // Load templates (Phase 5)
  await loadSidepanelTemplates();
  await updateContactContext();
  await updateTargetPanel();

  // Check capture rate (Phase 6)
  const dailyCount = await getDailyCaptureCount();
  const limit = await getCaptureLimit();
  if (dailyCount >= limit) {
    (captureBtn as HTMLButtonElement).disabled = true;
    captureBtn.textContent = `Limit reached (${limit})`;
  } else if (dailyCount >= limit * 0.8) {
    captureBtn.textContent = `Capture (${Math.max(0, limit - dailyCount)} left)`;
  }

  // Refresh periodically
  setInterval(async () => {
    await updateStatus();
    await updatePageInfo();
    await updateContactContext();
    await updateTargetPanel();
  }, 15000);
}

init().catch((err) =>
  logger.error('Side panel init failed:', (err as Error).message)
);
