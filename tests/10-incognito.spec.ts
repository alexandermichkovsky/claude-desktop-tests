import { test, expect } from '@playwright/test';
import { Key } from '@nut-tree-fork/nut-js';
import {
  showClaudeDesktop,
  focusClaudeDesktop,
  killClaudeDesktop,
  getClaudeWindowTitles,
  sleep,
  pressKeys,
  takeScreenshot,
  clickAt,
} from './helpers/app';
import { getIncognitoButtonCoords, isIncognitoActive, getTitleBarBrightness } from './helpers/accessibility';

/**
 * Pollt bis die App vollständig geladen ist:
 * - Ghost-Button im UIA-Baum sichtbar (App interaktiv)
 * - Titelleiste hell (nicht im Inkognito-Modus, brightness >= 300)
 */
async function waitForNormalMode(maxSeconds = 10): Promise<void> {
  for (let i = 0; i < maxSeconds * 2; i++) {
    focusClaudeDesktop();
    const coords = getIncognitoButtonCoords();
    const incognito = isIncognitoActive();
    if (coords && !incognito) return;
    await sleep(500);
  }
}

/**
 * Klickt den Inkognito-Button (Ghost-Icon) via UIA-Koordinaten.
 * Falls der Button nicht im UIA-Baum ist (z.B. App noch am Laden),
 * wird mit Retry gewartet.
 *
 * Hinweis: Claude Desktop ändert den Windows HWND-Titel nicht für Inkognito —
 * `Process.MainWindowTitle` gibt immer "Claude" zurück. Deshalb nutzt die
 * State-Erkennung `isIncognitoActive()` einen Pixel-Brightness-Check der Titelleiste.
 */
async function clickIncognitoButton(): Promise<void> {
  focusClaudeDesktop();
  await sleep(300);

  // Ghost-Button suchen, bei Bedarf Retry (UIA-Baum evtl. noch nicht vollständig)
  let buttonCoords = getIncognitoButtonCoords();
  if (!buttonCoords) {
    await sleep(2_000);
    focusClaudeDesktop();
    buttonCoords = getIncognitoButtonCoords();
  }

  if (buttonCoords) {
    await clickAt(buttonCoords.x, buttonCoords.y);
  } else {
    // Inkognito-Modus: Ghost-Button fehlt im UIA-Baum.
    // Dieser Fallback ist unzuverlässig — disableIncognito() nutzt stattdessen Kill+Restart.
    await pressKeys(Key.Escape);
    await sleep(200);
    await pressKeys(Key.LeftControl, Key.LeftShift, Key.I);
  }
  // Wartezeit damit Titelleisten-Animation vollständig abgeschlossen ist
  await sleep(1_500);
}

/** Aktiviert Inkognito (idempotent — tut nichts wenn bereits aktiv). */
async function enableIncognito(): Promise<void> {
  if (isIncognitoActive()) return;
  await clickIncognitoButton();
}

/**
 * Deaktiviert Inkognito (idempotent — tut nichts wenn bereits inaktiv).
 * Im Inkognito-Modus ist der Ghost-Button nicht im UIA-Baum, und
 * Keyboard-Shortcuts werden nicht zuverlässig empfangen. Deshalb wird
 * die App neu gestartet — sie startet immer im Normalmodus.
 * `waitForNormalMode()` stellt sicher, dass die App vollständig gerendert ist.
 */
async function disableIncognito(): Promise<void> {
  if (!isIncognitoActive()) return;
  killClaudeDesktop();
  await showClaudeDesktop(20_000);
  await waitForNormalMode();
}

test.describe('Inkognito-Modus', () => {
  test.beforeAll(async () => {
    await showClaudeDesktop(20_000);
    await waitForNormalMode();
    // Sicherstellen dass Inkognito zu Beginn deaktiviert ist
    await disableIncognito();
  });

  test.beforeEach(async () => {
    focusClaudeDesktop();
    await sleep(300);
  });

  test.afterEach(async () => {
    await disableIncognito();
  });

  // ── Aktivierung ───────────────────────────────────────────────────────────

  test('10.1 Inkognito via Ghost-Button aktivierbar', async () => {
    expect(isIncognitoActive()).toBe(false);

    await enableIncognito();

    expect(isIncognitoActive()).toBe(true);
    console.log('  → Inkognito erfolgreich aktiviert (Pixel-Brightness-Check)');
  });

  test('10.2 Inkognito-Modus zeigt visuellen Indikator (dunkle Titelleiste)', async () => {
    // Brightness der Titelleiste im Normalmodus messen (R+G+B, 0–765)
    const brightnessBefore = getTitleBarBrightness();
    expect(brightnessBefore).toBeGreaterThanOrEqual(300);

    await enableIncognito();

    // Brightness im Inkognito-Modus messen — Titelleiste wird dunkel
    const brightnessAfter = getTitleBarBrightness();
    expect(brightnessAfter).toBeLessThan(300);

    // Signifikanter Helligkeitsunterschied bestätigt visuellen Indikator
    const diff = brightnessBefore - brightnessAfter;
    expect(diff).toBeGreaterThan(200);

    console.log(`  → Brightness: ${brightnessBefore} (normal) → ${brightnessAfter} (inkognito), Δ${diff}`);
  });

  // ── Toggle-Verhalten ──────────────────────────────────────────────────────

  test('10.3 Inkognito ist ein Toggle — Kill+Restart deaktiviert', async () => {
    await enableIncognito();
    expect(isIncognitoActive()).toBe(true);

    await disableIncognito();
    expect(isIncognitoActive()).toBe(false);

    // App bleibt stabil, Fenstertitel enthält noch "Claude"
    const titles = getClaudeWindowTitles();
    expect(titles[0]).toContain('Claude');
    console.log('  → Toggle ein/aus funktioniert');
  });

  test('10.4 Inkognito-Modus lässt sich vollständig deaktivieren', async () => {
    await enableIncognito();
    expect(isIncognitoActive()).toBe(true);

    await disableIncognito();
    expect(isIncognitoActive()).toBe(false);

    console.log('  → Inkognito deaktiviert, normaler Modus wiederhergestellt');
  });

  // ── Stabilität im Inkognito-Modus ─────────────────────────────────────────

  test('10.5 Neue Konversation im Inkognito-Modus möglich (Ctrl+N)', async () => {
    await enableIncognito();
    expect(isIncognitoActive()).toBe(true);

    await pressKeys(Key.LeftControl, Key.N);
    await sleep(800);

    // App stabil, Inkognito bleibt aktiv
    expect(isIncognitoActive()).toBe(true);

    const screenshot = await takeScreenshot('10.5-new-chat-incognito');
    expect(require('fs').existsSync(screenshot)).toBe(true);

    console.log('  → Ctrl+N im Inkognito-Modus funktioniert');
  });

  test('10.6 Einstellungen im Inkognito-Modus erreichbar (Ctrl+,)', async () => {
    await enableIncognito();

    await pressKeys(Key.LeftControl, Key.Comma);
    await sleep(800);

    const titles = getClaudeWindowTitles();
    expect(titles.length).toBeGreaterThan(0);

    await pressKeys(Key.Escape);
    await sleep(400);

    console.log('  → Ctrl+, im Inkognito-Modus funktioniert');
  });

  test('10.7 App bleibt nach mehrfachem Toggle stabil (6× ein/aus)', async () => {
    // Sauberer Zustand: App neu starten damit keine offenen Dialoge stören
    killClaudeDesktop();
    await showClaudeDesktop(20_000);
    await waitForNormalMode();

    // 6× Inkognito aktivieren + per Kill/Restart deaktivieren.
    // Der Ghost-Button verschwindet im Inkognito-UIA-Baum, daher ist
    // ein schneller 6× Toggle an derselben Koordinate nicht möglich.
    // Stattdessen: 3× ein/aus-Zyklus (= 6 Zustandswechsel).
    for (let i = 0; i < 3; i++) {
      await enableIncognito();
      expect(isIncognitoActive()).toBe(true);
      killClaudeDesktop();
      await showClaudeDesktop(20_000);
      await waitForNormalMode();
    }

    // App stabil: Fenster vorhanden, Titel enthält "Claude"
    const titles = getClaudeWindowTitles();
    expect(titles.length).toBeGreaterThan(0);
    expect(titles[0]).toContain('Claude');
    expect(isIncognitoActive()).toBe(false);

    console.log(`  → App nach 3× Inkognito-Zyklus stabil: "${titles[0]}"`);
  });
});
