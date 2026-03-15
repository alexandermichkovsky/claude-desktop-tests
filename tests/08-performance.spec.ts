import { test, expect } from '@playwright/test';
import { showClaudeDesktop, focusClaudeDesktop, sleep } from './helpers/app';
import {
  measureStartupTime,
  measureMemory,
  measureCtrlNResponse,
} from './helpers/performance';

// ─── Schwellwerte ──────────────────────────────────────────────────────────
// Großzügig dimensioniert für Entwickler-Maschinen mit Hintergrundlast.
// Werte können nach mehreren Messläufen verfeinert werden.
const LIMITS = {
  startupMs:        15_000,  // Kaltstart bis Fenster sichtbar
  totalMemoryMB:     2_500,  // Summe WorkingSet aller Prozesse (Electron: ~1.5 GB gemessen)
  maxProcessMB:        600,  // Größter Einzelprozess (~480 MB gemessen)
  minProcessCount:       5,  // Mindestanzahl Electron-Subprozesse
  ctrlNResponseMs:   2_000,  // UI-Reaktion auf Ctrl+N (Proxy)
};

test.describe('Performance (Proxy-Metriken)', () => {
  test('8.1 Kaltstart: Fenster erscheint innerhalb des Zeitlimits', async () => {
    const metrics = await measureStartupTime(35_000);

    console.log(`  → Startzeit:   ${metrics.timeToWindowMs} ms (Limit: ${LIMITS.startupMs} ms)`);
    console.log(`  → Prozesse:    ${metrics.processCount}`);

    expect(metrics.timeToWindowMs).toBeLessThanOrEqual(LIMITS.startupMs);
    expect(metrics.processCount).toBeGreaterThanOrEqual(LIMITS.minProcessCount);
  });

  test('8.2 Speicher im Ruhezustand', async () => {
    // App läuft bereits nach Test 8.1
    await showClaudeDesktop(15_000);
    await sleep(2_000); // kurz einpendeln lassen

    const metrics = measureMemory();

    console.log(`  → WorkingSet gesamt: ${metrics.totalWorkingSetMB} MB (Limit: ${LIMITS.totalMemoryMB} MB)`);
    console.log(`  → Größter Prozess:   ${metrics.maxProcessMB} MB (Limit: ${LIMITS.maxProcessMB} MB)`);
    console.log(`  → Prozessanzahl:     ${metrics.processCount}`);

    expect(metrics.totalWorkingSetMB).toBeGreaterThan(0);
    expect(metrics.totalWorkingSetMB).toBeLessThanOrEqual(LIMITS.totalMemoryMB);
    expect(metrics.maxProcessMB).toBeLessThanOrEqual(LIMITS.maxProcessMB);
  });

  test('8.3 Speicher wächst nach 10 neuen Konversationen nicht unbegrenzt', async () => {
    await showClaudeDesktop(15_000);
    focusClaudeDesktop();
    await sleep(500);

    const { pressKeys } = await import('./helpers/app');
    const { Key } = await import('@nut-tree-fork/nut-js');

    const before = measureMemory();

    // 10 neue Konversationen erstellen
    for (let i = 0; i < 10; i++) {
      await pressKeys(Key.LeftControl, Key.N);
      await sleep(400);
    }
    await sleep(1_000);

    const after = measureMemory();
    const growthMB = after.totalWorkingSetMB - before.totalWorkingSetMB;
    const growthPercent = before.totalWorkingSetMB > 0
      ? (growthMB / before.totalWorkingSetMB) * 100
      : 0;

    console.log(`  → Vorher: ${before.totalWorkingSetMB} MB`);
    console.log(`  → Nachher: ${after.totalWorkingSetMB} MB`);
    console.log(`  → Wachstum: +${growthMB} MB (${growthPercent.toFixed(1)} %)`);

    // Wachstum soll unter 50 % bleiben (kein Memory Leak)
    expect(growthPercent).toBeLessThan(50);
  });

  test('8.4 UI-Reaktionszeit auf Ctrl+N', async () => {
    await showClaudeDesktop(15_000);

    // 5 Messungen → Median
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const m = await measureCtrlNResponse();
      times.push(m.ctrlNResponseMs);
      await sleep(500);
    }

    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const min    = times[0];
    const max    = times[times.length - 1];

    console.log(`  → Ctrl+N Reaktionszeit (5 Messungen):`);
    console.log(`     Min: ${min} ms | Median: ${median} ms | Max: ${max} ms`);
    console.log(`     Limit: ${LIMITS.ctrlNResponseMs} ms`);

    expect(median).toBeLessThanOrEqual(LIMITS.ctrlNResponseMs);
  });
});
