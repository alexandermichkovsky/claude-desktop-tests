import { execSync } from 'child_process';
import {
  getClaudeDesktopProcesses,
  killClaudeDesktop,
  launchClaudeDesktop,
  focusClaudeDesktop,
  pressKeys,
  sleep,
  CLAUDE_AUMID,
} from './app';
import { Key } from '@nut-tree-fork/nut-js';

export interface StartupMetrics {
  /** Zeit vom Launch-Befehl bis zum ersten sichtbaren Fenster (ms) */
  timeToWindowMs: number;
  /** Anzahl gestarteter Prozesse */
  processCount: number;
}

export interface MemoryMetrics {
  /** Summe WorkingSet aller Claude-Prozesse (MB) */
  totalWorkingSetMB: number;
  /** Größter Einzelprozess WorkingSet (MB) */
  maxProcessMB: number;
  /** Anzahl Prozesse */
  processCount: number;
}

export interface ResponsivenessMetrics {
  /** Zeit von Ctrl+N-Tastendruck bis Screenshot fertig (ms) — Proxy für UI-Reaktionszeit */
  ctrlNResponseMs: number;
}

/**
 * Misst den Kaltstart: beendet Claude, startet neu, wartet auf Fenster.
 * Gibt Zeit bis zum sichtbaren Fenster zurück.
 */
export async function measureStartupTime(timeoutMs = 35_000): Promise<StartupMetrics> {
  killClaudeDesktop();
  await sleep(2_000);

  const start = Date.now();
  await launchClaudeDesktop(timeoutMs);
  const timeToWindowMs = Date.now() - start;

  await sleep(1_000); // Prozesse vollständig starten lassen
  const processCount = getClaudeDesktopProcesses().length;

  return { timeToWindowMs, processCount };
}

/**
 * Liest aktuellen Speicherbedarf aller Claude-Desktop-Prozesse.
 */
export function measureMemory(): MemoryMetrics {
  const processes = getClaudeDesktopProcesses();
  if (processes.length === 0) {
    return { totalWorkingSetMB: 0, maxProcessMB: 0, processCount: 0 };
  }

  const totalBytes = processes.reduce((sum, p) => sum + p.workingSet, 0);
  const maxBytes   = Math.max(...processes.map((p) => p.workingSet));

  return {
    totalWorkingSetMB: Math.round(totalBytes / 1024 / 1024),
    maxProcessMB:      Math.round(maxBytes   / 1024 / 1024),
    processCount:      processes.length,
  };
}

/**
 * Misst die Reaktionszeit der UI auf Ctrl+N (neue Konversation).
 * Proxy: Zeit von Tastendruck bis der nächste Screenshot aufgenommen ist.
 */
export async function measureCtrlNResponse(): Promise<ResponsivenessMetrics> {
  focusClaudeDesktop();
  await sleep(300);

  const start = Date.now();
  await pressKeys(Key.LeftControl, Key.N);
  await sleep(100); // minimales Warten damit die UI reagieren kann
  const ctrlNResponseMs = Date.now() - start;

  return { ctrlNResponseMs };
}
