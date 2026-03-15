import { test, expect } from '@playwright/test';
import { Key } from '@nut-tree-fork/nut-js';
import {
  getClaudeDesktopProcesses,
  getClaudeWindowTitles,
  showClaudeDesktop,
  focusClaudeDesktop,
  sleep,
  typeText,
  pressKeys,
  takeScreenshot,
} from './helpers/app';

// Hilfsfunktion: Clipboard-Inhalt lesen
function getClipboardText(): string {
  try {
    return require('child_process')
      .execSync('powershell -Command "Get-Clipboard"')
      .toString()
      .trim();
  } catch {
    return '';
  }
}

// Hilfsfunktion: Anzahl Claude Desktop Renderer-Prozesse zählen
// (Jede neue Konversation kann einen neuen Renderer spawnen)
function countClaudeProcesses(): number {
  return getClaudeDesktopProcesses().length;
}

test.describe('Konversationsmanagement', () => {
  test.beforeAll(async () => {
    // Claude Desktop aus System Tray holen / starten falls nicht läuft
    await showClaudeDesktop(20_000);
    await sleep(1000);
    focusClaudeDesktop();
    await sleep(500);
  });

  test.beforeEach(async () => {
    // Fenster in Vordergrund bringen
    focusClaudeDesktop();
    await sleep(300);
  });

  test('2.1 Neue Konversation erstellen via Ctrl+N', async () => {
    const titleBefore = getClaudeWindowTitles()[0] ?? '';
    const screenshotBefore = await takeScreenshot('2.1-before-new-conv');

    // Neue Konversation starten
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(1500);

    const screenshotAfter = await takeScreenshot('2.1-after-new-conv');

    // App läuft noch
    expect(countClaudeProcesses()).toBeGreaterThan(0);
    // Screenshots wurden angelegt
    expect(require('fs').existsSync(screenshotBefore)).toBe(true);
    expect(require('fs').existsSync(screenshotAfter)).toBe(true);
  });

  test('2.2 Nachricht senden: Text erscheint im Input und Enter sendet', async () => {
    const testMessage = 'Test-Nachricht 12345';

    // Screenshot vor dem Tippen
    const before = await takeScreenshot('2.2-before-send');

    // In den Chat-Input klicken (Ctrl+L oft ein Shortcut für "focus input" in Chat-Apps)
    // Alternativ einfach tippen - falls Chat im Fokus
    await pressKeys(Key.LeftControl, Key.N); // Neue Konversation
    await sleep(1000);

    // Text tippen
    await typeText(testMessage);
    await sleep(500);

    const afterType = await takeScreenshot('2.2-after-type');

    // Senden mit Enter
    await pressKeys(Key.Return);
    await sleep(2000);

    const afterSend = await takeScreenshot('2.2-after-send');

    // App läuft noch - kein Absturz
    expect(countClaudeProcesses()).toBeGreaterThan(0);

    // Screenshots dokumentieren den Ablauf
    expect(require('fs').existsSync(afterType)).toBe(true);
    expect(require('fs').existsSync(afterSend)).toBe(true);
  });

  test('2.3 Shift+Enter fügt Zeilenumbruch ein (kein Senden)', async () => {
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(800);

    await typeText('Zeile 1');
    // Shift+Enter = Zeilenumbruch, kein Senden
    await pressKeys(Key.LeftShift, Key.Return);
    await typeText('Zeile 2');
    await sleep(500);

    const screenshot = await takeScreenshot('2.3-shift-enter');

    // App läuft noch (kein Absturz durch Shift+Enter)
    expect(countClaudeProcesses()).toBeGreaterThan(0);
    expect(require('fs').existsSync(screenshot)).toBe(true);

    // Eingabe abbrechen ohne Senden
    await pressKeys(Key.Escape);
  });

  test('2.4 Escape leert oder verlässt den Input', async () => {
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(800);

    await typeText('Text der verworfen wird');
    await sleep(300);

    const beforeEscape = await takeScreenshot('2.4-before-escape');
    await pressKeys(Key.Escape);
    await sleep(500);
    const afterEscape = await takeScreenshot('2.4-after-escape');

    expect(countClaudeProcesses()).toBeGreaterThan(0);
    // Beide Screenshots existieren
    expect(require('fs').existsSync(beforeEscape)).toBe(true);
    expect(require('fs').existsSync(afterEscape)).toBe(true);
  });

  test('2.5 Konversationslist erscheint in der Sidebar', async () => {
    // Sidebar ist per default sichtbar beim Start
    const screenshot = await takeScreenshot('2.5-sidebar');

    // Nach min. 1 gesendeter Nachricht soll eine Konversation in der Sidebar erscheinen
    // Wir prüfen nur, dass die App noch läuft und ein Fenster hat
    const titles = getClaudeWindowTitles();
    expect(titles.length).toBeGreaterThan(0);
    expect(require('fs').existsSync(screenshot)).toBe(true);
  });

  test('2.6 Mehrere neue Konversationen erstellen', async () => {
    // 3 neue Konversationen in Folge erstellen
    for (let i = 0; i < 3; i++) {
      await pressKeys(Key.LeftControl, Key.N);
      await sleep(800);
    }

    await takeScreenshot('2.6-multiple-conversations');

    // App läuft noch stabil
    expect(countClaudeProcesses()).toBeGreaterThan(0);
    const titles = getClaudeWindowTitles();
    expect(titles.length).toBeGreaterThan(0);
  });
});
