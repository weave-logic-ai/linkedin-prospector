import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { resolve } from "path";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "fs";

const PROJECT_ROOT = resolve(process.cwd(), "../../../");
const DATA_DIR = resolve(PROJECT_ROOT, ".linkedin-prospector/data");
const SCRIPTS_DIR = resolve(
  PROJECT_ROOT,
  ".claude/linkedin-prospector/skills/linkedin-prospector/scripts"
);

export interface ProcessRecord {
  id: string;
  script: string;
  args: string[];
  pid: number | null;
  startedAt: string;
  status: "running" | "completed" | "failed" | "cancelled" | "queued" | "blocked";
  exitCode: number | null;
  duration: number | null;
  output: string[];
}

interface ManagedProcess {
  process: ChildProcess | null;
  record: ProcessRecord;
  listeners: Set<(event: string, data: unknown) => void>;
}

const OVERRIDE_FILE = resolve(DATA_DIR, "linkedin-override.json");
const OPS_LOG_FILE = resolve(DATA_DIR, "operations-log.jsonl");

interface OverrideState {
  enabled: boolean;
  setAt: string;
  reason?: string;
}

interface OpsLogEntry {
  id: string;
  scriptId?: string;
  script: string;
  args: string[];
  isPlaywright: boolean;
  startedAt: string;
  completedAt?: string;
  status: string;
  exitCode?: number | null;
  duration?: number | null;
  outputSummary?: string;
  blockedReason?: string;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function isLinkedInOverrideActive(): boolean {
  try {
    const raw = readFileSync(OVERRIDE_FILE, "utf-8");
    const state: OverrideState = JSON.parse(raw);
    return state.enabled === true;
  } catch {
    return false;
  }
}

export function setLinkedInOverride(enabled: boolean, reason?: string): OverrideState {
  ensureDataDir();
  const state: OverrideState = {
    enabled,
    setAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };
  writeFileSync(OVERRIDE_FILE, JSON.stringify(state, null, 2));
  return state;
}

export function getLinkedInOverrideStatus(): OverrideState {
  try {
    const raw = readFileSync(OVERRIDE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { enabled: false, setAt: new Date().toISOString() };
  }
}

function appendToLog(entry: OpsLogEntry): void {
  try {
    ensureDataDir();
    appendFileSync(OPS_LOG_FILE, JSON.stringify(entry) + "\n");
  } catch {
    // Non-fatal: logging errors don't break script execution
  }
}

export interface OpsLogFilter {
  status?: string;
  playwright?: boolean;
  limit?: number;
  offset?: number;
}

export function readOperationsLog(filters?: OpsLogFilter): { entries: OpsLogEntry[]; total: number; hasMore: boolean } {
  try {
    if (!existsSync(OPS_LOG_FILE)) {
      return { entries: [], total: 0, hasMore: false };
    }
    const raw = readFileSync(OPS_LOG_FILE, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    let entries: OpsLogEntry[] = lines.map((line) => JSON.parse(line));

    // Sort newest first
    entries.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    if (filters?.status) {
      entries = entries.filter((e) => e.status === filters.status);
    }
    if (filters?.playwright !== undefined) {
      entries = entries.filter((e) => e.isPlaywright === filters.playwright);
    }

    const total = entries.length;
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 100;
    const sliced = entries.slice(offset, offset + limit);

    return { entries: sliced, total, hasMore: offset + limit < total };
  } catch {
    return { entries: [], total: 0, hasMore: false };
  }
}

const MAX_NON_PLAYWRIGHT = 4;
let processCounter = 0;

class ProcessManager extends EventEmitter {
  private processes = new Map<string, ManagedProcess>();
  private queue: Array<{
    id: string;
    script: string;
    args: string[];
  }> = [];
  private playwrightRunning = false;
  private nonPlaywrightRunning = 0;

  private playwrightScripts = new Set([
    "deep-scan.mjs",
    "batch-deep-scan.mjs",
    "enrich.mjs",
    "enrich-graph.mjs",
    "search.mjs",
    "activity-scanner.mjs",
  ]);

  run(script: string, args: string[] = []): { id: string; status: "running" | "queued" | "blocked"; reason?: string } {
    processCounter += 1;
    const id = `proc-${Date.now()}-${processCounter}`;
    const isPlaywright = this.playwrightScripts.has(script);

    const record: ProcessRecord = {
      id,
      script,
      args,
      pid: null,
      startedAt: new Date().toISOString(),
      status: "queued",
      exitCode: null,
      duration: null,
      output: [],
    };

    const managed: ManagedProcess = {
      process: null,
      record,
      listeners: new Set(),
    };

    this.processes.set(id, managed);

    // Check LinkedIn override BEFORE queueing
    if (isPlaywright && isLinkedInOverrideActive()) {
      record.status = "blocked";
      const overrideState = getLinkedInOverrideStatus();
      const reason = `LinkedIn override active${overrideState.reason ? `: ${overrideState.reason}` : ""}`;

      appendToLog({
        id,
        script,
        args,
        isPlaywright: true,
        startedAt: record.startedAt,
        completedAt: record.startedAt,
        status: "blocked",
        blockedReason: reason,
      });

      this.emit("blocked", { id, script, reason });
      return { id, status: "blocked", reason };
    }

    if (isPlaywright && this.playwrightRunning) {
      this.queue.push({ id, script, args });
      this.emit("queued", { id, script });
      return { id, status: "queued" };
    }

    if (!isPlaywright && this.nonPlaywrightRunning >= MAX_NON_PLAYWRIGHT) {
      this.queue.push({ id, script, args });
      this.emit("queued", { id, script });
      return { id, status: "queued" };
    }

    this.startProcess(id, script, args);
    return { id, status: "running" };
  }

  private startProcess(id: string, script: string, args: string[]): void {
    const managed = this.processes.get(id);
    if (!managed) return;

    const isPlaywright = this.playwrightScripts.has(script);
    if (isPlaywright) {
      this.playwrightRunning = true;
    } else {
      this.nonPlaywrightRunning += 1;
    }

    managed.record.status = "running";
    managed.record.startedAt = new Date().toISOString();

    appendToLog({
      id,
      script,
      args,
      isPlaywright,
      startedAt: managed.record.startedAt,
      status: "running",
    });

    const child = spawn("node", [script, ...args], {
      cwd: SCRIPTS_DIR,
      env: {
        ...process.env,
        PROSPECTOR_DATA_DIR: DATA_DIR,
        BROWSER_DATA_DIR: resolve(PROJECT_ROOT, ".browser-data"),
        NODE_NO_WARNINGS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    managed.process = child;
    managed.record.pid = child.pid ?? null;

    child.stdout?.on("data", (data: Buffer) => {
      const line = data.toString();
      managed.record.output.push(line);
      // Keep only last 500 lines in memory
      if (managed.record.output.length > 500) {
        managed.record.output = managed.record.output.slice(-500);
      }
      this.notifyListeners(id, "stdout", line);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const line = data.toString();
      managed.record.output.push(`[stderr] ${line}`);
      if (managed.record.output.length > 500) {
        managed.record.output = managed.record.output.slice(-500);
      }
      this.notifyListeners(id, "stderr", line);
    });

    child.on("close", (code: number | null) => {
      const startTime = new Date(managed.record.startedAt).getTime();
      managed.record.exitCode = code;
      managed.record.duration = Date.now() - startTime;
      managed.record.status = code === 0 ? "completed" : "failed";

      appendToLog({
        id,
        script,
        args,
        isPlaywright,
        startedAt: managed.record.startedAt,
        completedAt: new Date().toISOString(),
        status: managed.record.status,
        exitCode: code,
        duration: managed.record.duration,
        outputSummary: managed.record.output.slice(-50).join(""),
      });

      if (isPlaywright) {
        this.playwrightRunning = false;
      } else {
        this.nonPlaywrightRunning = Math.max(0, this.nonPlaywrightRunning - 1);
      }

      this.notifyListeners(id, "exit", {
        code,
        duration: managed.record.duration,
        status: managed.record.status,
      });

      this.processQueue();
    });

    child.on("error", (err: Error) => {
      managed.record.status = "failed";

      appendToLog({
        id,
        script,
        args,
        isPlaywright,
        startedAt: managed.record.startedAt,
        completedAt: new Date().toISOString(),
        status: "failed",
        outputSummary: err.message,
      });

      this.notifyListeners(id, "error", err.message);

      if (isPlaywright) {
        this.playwrightRunning = false;
      } else {
        this.nonPlaywrightRunning = Math.max(0, this.nonPlaywrightRunning - 1);
      }

      this.processQueue();
    });
  }

  private processQueue(): void {
    const nextIndex = this.queue.findIndex((item) => {
      const isPlaywright = this.playwrightScripts.has(item.script);
      if (isPlaywright) return !this.playwrightRunning;
      return this.nonPlaywrightRunning < MAX_NON_PLAYWRIGHT;
    });

    if (nextIndex === -1) return;

    const next = this.queue.splice(nextIndex, 1)[0];
    this.startProcess(next.id, next.script, next.args);
  }

  private notifyListeners(
    processId: string,
    event: string,
    data: unknown
  ): void {
    const managed = this.processes.get(processId);
    if (!managed) return;
    for (const listener of managed.listeners) {
      listener(event, data);
    }
    this.emit(event, { processId, data });
  }

  addListener_sse(
    processId: string,
    listener: (event: string, data: unknown) => void
  ): () => void {
    const managed = this.processes.get(processId);
    if (!managed) return () => {};
    managed.listeners.add(listener);
    return () => {
      managed.listeners.delete(listener);
    };
  }

  cancel(processId: string): boolean {
    const managed = this.processes.get(processId);
    if (!managed) return false;

    // If queued, just remove from queue
    const queueIndex = this.queue.findIndex((q) => q.id === processId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
      managed.record.status = "cancelled";

      appendToLog({
        id: processId,
        script: managed.record.script,
        args: managed.record.args,
        isPlaywright: this.playwrightScripts.has(managed.record.script),
        startedAt: managed.record.startedAt,
        completedAt: new Date().toISOString(),
        status: "cancelled",
      });

      this.notifyListeners(processId, "exit", {
        code: null,
        status: "cancelled",
      });
      return true;
    }

    // If running, kill the process
    if (managed.process && managed.record.status === "running") {
      managed.process.kill("SIGTERM");
      // Force kill after 5 seconds
      setTimeout(() => {
        if (managed.record.status === "running" && managed.process) {
          managed.process.kill("SIGKILL");
        }
      }, 5000);
      managed.record.status = "cancelled";

      appendToLog({
        id: processId,
        script: managed.record.script,
        args: managed.record.args,
        isPlaywright: this.playwrightScripts.has(managed.record.script),
        startedAt: managed.record.startedAt,
        completedAt: new Date().toISOString(),
        status: "cancelled",
        duration: managed.record.duration,
      });

      return true;
    }

    return false;
  }

  getActive(): ProcessRecord[] {
    const active: ProcessRecord[] = [];
    for (const [, managed] of this.processes) {
      if (
        managed.record.status === "running" ||
        managed.record.status === "queued"
      ) {
        active.push({ ...managed.record, output: [] });
      }
    }
    return active;
  }

  getHistory(): ProcessRecord[] {
    const completed: ProcessRecord[] = [];
    for (const [, managed] of this.processes) {
      if (
        managed.record.status === "completed" ||
        managed.record.status === "failed" ||
        managed.record.status === "cancelled" ||
        managed.record.status === "blocked"
      ) {
        completed.push({ ...managed.record, output: [] });
      }
    }
    return completed
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )
      .slice(0, 20);
  }

  getProcess(processId: string): ProcessRecord | null {
    const managed = this.processes.get(processId);
    if (!managed) return null;
    return { ...managed.record };
  }
}

// Singleton
export const processManager = new ProcessManager();
