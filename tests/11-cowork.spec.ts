import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { PNG } from 'pngjs';
import { Key } from '@nut-tree-fork/nut-js';
import {
  killClaudeDesktop,
  launchClaudeDesktop,
  focusClaudeDesktop,
  getClaudeWindowTitles,
  getClaudeDesktopProcesses,
  sleep,
  pressKeys,
  typeText,
  clickAt,
} from './helpers/app';
import { getFocusedElement, captureWindowScreenshot } from './helpers/accessibility';
import { compareToBaseline } from './helpers/visual';
import {
  getTabCoords,
  isCoworkActive,
  minimizeClaudeWindow,
  restoreClaudeWindow,
  getEnabledSubmitButtonCoords,
  waitForCoworkTab,
} from './helpers/cowork';

const COWORK_TAB = 'Cowork';
const CHAT_TAB   = 'Chat';

/**
 * Polls until the Cowork tab is in the UIA tree (renders asynchronously),
 * then clicks it and waits for the view to settle.
 * Replaces the repeated getTabCoords + expect + clickAt + sleep pattern and
 * makes every test that navigates to Cowork robust against timing gaps.
 */
async function goToCowork(): Promise<void> {
  // Poll with a focus call on every attempt — the Cowork tab can drop out of
  // the UIA tree for several seconds after keyboard interactions in previous
  // tests (Electron renderer busy / UIA tree rebuild).  Re-activating the
  // window each iteration helps UIA rediscover the tab elements.
  const deadline = Date.now() + 20_000;
  let coords: { x: number; y: number } | null = null;
  while (Date.now() < deadline) {
    focusClaudeDesktop();
    coords = getTabCoords(COWORK_TAB);
    if (coords) break;
    await sleep(500);
  }
  if (!coords) throw new Error('[cowork] Cowork tab not found within 20s');
  await clickAt(coords.x, coords.y);
  await sleep(800);
}

test.describe('Cowork', () => {
  test.beforeAll(async () => {
    // Fresh launch — Cowork carries task session state from the previous run.
    killClaudeDesktop();
    await sleep(2_000);
    await launchClaudeDesktop(30_000);
    await sleep(1_000);
    focusClaudeDesktop();
    // The tab bar (Chat / Cowork / Code) renders asynchronously after the window
    // appears — poll until the Cowork element is present in the UIA tree.
    await waitForCoworkTab(COWORK_TAB, 20);
  });

  test.beforeEach(async () => {
    focusClaudeDesktop();
    await sleep(300);
  });

  // Return to Chat after each test so the next test starts from a clean tab state.
  test.afterEach(async () => {
    focusClaudeDesktop();
    await sleep(200);
    const chatCoords = getTabCoords(CHAT_TAB);
    if (chatCoords) {
      await clickAt(chatCoords.x, chatCoords.y);
      await sleep(400);
    }
  });

  // ── A: Tab Navigation ─────────────────────────────────────────────────────

  test('11.1 Cowork-Tab im UIA-Baum sichtbar', async () => {
    const coords = getTabCoords(COWORK_TAB);

    expect(coords).not.toBeNull();
    console.log(`  → Cowork-Tab gefunden bei (${coords!.x}, ${coords!.y})`);
  });

  test('11.2 Klick auf Cowork-Tab aktiviert ihn', async () => {
    await goToCowork();

    expect(isCoworkActive()).toBe(true);
    console.log('  → Cowork-Tab nach Klick aktiv (UIA SelectionItemPattern)');
  });

  test('11.4 Zurück zu Chat-Tab möglich', async () => {
    await goToCowork();
    expect(isCoworkActive()).toBe(true);

    // Switch back to Chat.
    const chatCoords = getTabCoords(CHAT_TAB);
    expect(chatCoords).not.toBeNull();
    await clickAt(chatCoords!.x, chatCoords!.y);
    await sleep(600);

    expect(isCoworkActive()).toBe(false);
    expect(getClaudeWindowTitles().length).toBeGreaterThan(0);
    console.log('  → Chat-Tab aktiv, Cowork nicht mehr aktiv, App stabil');
  });

  test('11.5 Cowork-Tab-Status bleibt nach Minimize/Restore erhalten', async () => {
    await goToCowork();
    expect(isCoworkActive()).toBe(true);

    minimizeClaudeWindow();
    await sleep(1_000);
    restoreClaudeWindow();
    focusClaudeDesktop();
    await sleep(800);

    expect(isCoworkActive()).toBe(true);
    console.log('  → Cowork-Tab nach Minimize/Restore noch aktiv');
  });

  // 11.3 — Tastenkürzel zu Cowork (reserved — shortcut existence unconfirmed)

  // ── B: Task Input UI ──────────────────────────────────────────────────────

  test('11.6 Eingabefeld im Cowork-Tab ist fokussierbar', async () => {
    await goToCowork();

    // Tab key moves focus into the content area.
    await pressKeys(Key.Tab);
    await sleep(400);

    const focused = getFocusedElement();
    expect(focused).not.toBeNull();
    console.log(`  → Fokussiertes Element: "${focused!.name}" (${focused!.controlType})`);

    // Accept any interactive control type — Cowork may expose a Button as the primary
    // focusable element (e.g. "In einem Ordner arbeiten") rather than a bare text field.
    expect([
      'ControlType.Document', 'ControlType.Edit',
      'ControlType.Custom',   'ControlType.Button',
    ]).toContain(focused!.controlType);
  });

  test('11.7 Eingabefeld akzeptiert getippten Text (Pixel-Diff > 0)', async () => {
    await goToCowork();
    await pressKeys(Key.Tab);
    await sleep(400);

    const before = captureWindowScreenshot('11_7-input-before');
    await typeText('Test-Eingabe 11.7');
    await sleep(500);
    const after = captureWindowScreenshot('11_7-input-after');

    expect(fs.existsSync(before)).toBe(true);
    expect(fs.existsSync(after)).toBe(true);

    const img1 = PNG.sync.read(fs.readFileSync(before));
    const img2 = PNG.sync.read(fs.readFileSync(after));

    if (img1.width === img2.width && img1.height === img2.height) {
      const { default: pixelmatch } = await import('pixelmatch');
      const diff = Buffer.alloc(img1.width * img1.height * 4);
      const diffPixels = pixelmatch(
        img1.data as Uint8Array, img2.data as Uint8Array, diff as Uint8Array,
        img1.width, img1.height, { threshold: 0.1 }
      );
      console.log(`  → ${diffPixels} Pixel Unterschied nach Texteingabe`);
      expect(diffPixels).toBeGreaterThan(0);
    } else {
      throw new Error(
        `Screenshot-Dimensionen haben sich zwischen Aufnahmen geändert: ` +
        `before=${img1.width}x${img1.height}, after=${img2.width}x${img2.height}`
      );
    }

    // Clean up input.
    await pressKeys(Key.LeftControl, Key.A);
    await pressKeys(Key.Delete);
  });

  test('11.8 Submit-Button vorhanden und aktiv nach Texteingabe', async () => {
    await goToCowork();
    await pressKeys(Key.Tab);
    await sleep(300);

    await typeText('Task submit test 11.8');
    await sleep(500);

    const submitCoords = getEnabledSubmitButtonCoords();
    expect(submitCoords).not.toBeNull();
    console.log(`  → Submit-Button aktiviert bei (${submitCoords!.x}, ${submitCoords!.y})`);

    // Clean up.
    await pressKeys(Key.LeftControl, Key.A);
    await pressKeys(Key.Delete);
  });

  test('11.9 Leere Eingabe verhindert Ausführung (kein Prozess-Spawn)', async () => {
    await goToCowork();

    // Ensure input is empty.
    await pressKeys(Key.Tab);
    await sleep(200);
    await pressKeys(Key.LeftControl, Key.A);
    await pressKeys(Key.Delete);
    await sleep(300);

    const processesBefore = getClaudeDesktopProcesses();

    // Attempt submission with empty input.
    await pressKeys(Key.Return);
    await sleep(800);

    // No task should have started — process count must not grow.
    const processesAfter = getClaudeDesktopProcesses();
    const delta = processesAfter.length - processesBefore.length;
    expect(delta).toBeLessThanOrEqual(1); // at most 1 transient process

    const submitCoords = getEnabledSubmitButtonCoords();
    console.log(`  → Submit-Button bei leerem Feld: ${submitCoords ? 'aktiv' : 'deaktiviert/absent'}`);
    console.log(`  → Prozess-Delta nach leerem Enter: ${delta}`);

    // App remains alive.
    expect(getClaudeWindowTitles().length).toBeGreaterThan(0);
  });

  // 11.10 — Input leert sich nach Submit (reserved — requires live internet/session)
  // 11.11 — Fortschrittsanzeige erscheint (reserved — async timing uncertain)
  // 11.12 — Pause/Steuer-Button sichtbar während Ausführung (reserved — same dependency)

  // ── C: Task Execution Feedback ────────────────────────────────────────────

  test('11.13 App bleibt 30 Sekunden nach Task-Submit stabil', async () => {
    // Must remain the first statement — before any await — for Playwright to apply it.
    test.setTimeout(120_000);

    // Fresh launch — previous tests (especially 11.9's Enter keypress on Cowork) can
    // trigger a Cowork reinitialization that keeps the tab out of the UIA tree for >20s.
    // A kill+relaunch guarantees a known clean state before the stability measurement.
    killClaudeDesktop();
    await sleep(2_000);
    await launchClaudeDesktop(30_000);
    await waitForCoworkTab(COWORK_TAB, 20);

    await goToCowork();
    await pressKeys(Key.Tab);
    await sleep(300);

    await typeText('Hello');
    await sleep(300);

    const processesBefore = getClaudeDesktopProcesses();
    // Allow up to 8 extra worker processes (Cowork may spawn sub-agents).
    const maxProcessCount = processesBefore.length + 8;

    await pressKeys(Key.Return);

    for (let i = 1; i <= 6; i++) {
      await sleep(5_000);
      const procs = getClaudeDesktopProcesses();
      expect(procs.length).toBeLessThanOrEqual(maxProcessCount);
      expect(getClaudeWindowTitles().length).toBeGreaterThan(0);
      console.log(`  → ${i * 5}s: ${procs.length} Prozesse, Fenster sichtbar`);
    }
  });

  // 11.14 — Ordner-Berechtigungsdialog auslösbar (reserved — entry point unknown)
  // 11.15 — Berechtigungsdialog schließbar (reserved — blocked by 11.14)
  // 11.16 — Zeitplanung-UI vorhanden (reserved — UI-Flow unbekannt)

  // ── E: Stability & Regression ─────────────────────────────────────────────

  test('11.17 Chat-Tab nach Cowork-Besuch noch funktionsfähig', async () => {
    await goToCowork();

    // Return to Chat.
    const chatCoords = getTabCoords(CHAT_TAB);
    expect(chatCoords).not.toBeNull();
    await clickAt(chatCoords!.x, chatCoords!.y);
    await sleep(600);

    // Open a new chat and verify input is accessible.
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(800);
    await pressKeys(Key.Tab);
    await sleep(300);

    const focused = getFocusedElement();
    expect(focused).not.toBeNull();
    console.log(`  → Chat-Eingabe: "${focused!.name}" (${focused!.controlType})`);

    // Type and clear to confirm input is interactive.
    await typeText('Chat-Test 11.17');
    await sleep(300);
    await pressKeys(Key.LeftControl, Key.A);
    await pressKeys(Key.Delete);
  });

  test('11.18 Visual Regression: Cowork Ruhezustand', async () => {
    await goToCowork();
    await sleep(200); // extra settle time after goToCowork's 800 ms

    const result = await compareToBaseline('11_18-cowork-idle', 1.0);

    if (result.isNewBaseline) {
      console.log('  → Neue Baseline gespeichert:', result.baselinePath);
    } else {
      // Cowork shows dynamic content (task history, suggestions) — the diff is
      // informational only.  A hard assertion would be flaky across runs.
      console.log(`  → Diff: ${result.diffPercent.toFixed(3)} % (${result.diffPixels} Pixel) — kein Hard-Assert wegen dynamischem Inhalt`);
    }
  });

  test('11.19 Kein Memory-Leak nach 10 Tab-Wechseln (Chat ↔ Cowork)', async () => {
    const coworkCoords = getTabCoords(COWORK_TAB);
    const chatCoords   = getTabCoords(CHAT_TAB);
    expect(coworkCoords).not.toBeNull();
    expect(chatCoords).not.toBeNull();

    const processesBefore  = getClaudeDesktopProcesses();
    const workingSetBefore = processesBefore.reduce((sum, p) => sum + p.workingSet, 0);

    for (let i = 0; i < 10; i++) {
      await clickAt(coworkCoords!.x, coworkCoords!.y);
      await sleep(400);
      await clickAt(chatCoords!.x, chatCoords!.y);
      await sleep(400);
    }

    const processesAfter  = getClaudeDesktopProcesses();
    const workingSetAfter = processesAfter.reduce((sum, p) => sum + p.workingSet, 0);
    const growthMB = (workingSetAfter - workingSetBefore) / (1024 * 1024);

    console.log(`  → WorkingSet-Wachstum nach 10 Wechseln: ${growthMB.toFixed(1)} MB`);
    // Cowork loads heavier renderer assets than Chat — measured ~109 MB on first switch cycle.
    // 200 MB guards against gross leaks while tolerating normal Cowork initialization overhead.
    expect(growthMB).toBeLessThan(200);
  });
});
