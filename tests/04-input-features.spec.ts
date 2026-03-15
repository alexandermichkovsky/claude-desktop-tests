import { test, expect } from '@playwright/test';
import { Key } from '@nut-tree-fork/nut-js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getClaudeDesktopProcesses,
  showClaudeDesktop,
  focusClaudeDesktop,
  sleep,
  typeText,
  pressKeys,
  takeScreenshot,
} from './helpers/app';

/** Setzt den Windows-Clipboard auf einen Text. */
function setClipboard(text: string): void {
  try {
    execSync(`powershell -Command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`, {
      stdio: 'ignore',
    });
  } catch { /* ignore */ }
}

/** Liest den Windows-Clipboard. */
function getClipboard(): string {
  try {
    return execSync('powershell -Command "Get-Clipboard"').toString().trim();
  } catch {
    return '';
  }
}

test.describe('Eingabe-Features', () => {
  test.beforeAll(async () => {
    await showClaudeDesktop(20_000);
    await sleep(1000);
    focusClaudeDesktop();
    await sleep(500);
  });

  test.beforeEach(async () => {
    // Frische Konversation vor jedem Test
    focusClaudeDesktop();
    await sleep(200);
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(800);
  });

  test('4.1 Mehrzeilige Eingabe via Shift+Enter', async () => {
    await typeText('Erste Zeile');
    await pressKeys(Key.LeftShift, Key.Return);
    await typeText('Zweite Zeile');
    await sleep(500);

    const screenshot = await takeScreenshot('4.1-multiline');
    expect(require('fs').existsSync(screenshot)).toBe(true);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);

    // Eingabe verwerfen
    await pressKeys(Key.Escape);
  });

  test('4.2 Eingabe leeren mit Ctrl+A und Delete', async () => {
    await typeText('Text der gelöscht wird');
    await sleep(300);

    const before = await takeScreenshot('4.2-before-clear');

    // Alles markieren und löschen
    await pressKeys(Key.LeftControl, Key.A);
    await sleep(200);
    await pressKeys(Key.Delete);
    await sleep(300);

    const after = await takeScreenshot('4.2-after-clear');

    expect(require('fs').existsSync(before)).toBe(true);
    expect(require('fs').existsSync(after)).toBe(true);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);
  });

  test('4.3 Copy/Paste via Ctrl+C und Ctrl+V', async () => {
    const testText = 'Kopier-Test-Text-' + Date.now();

    // Text einfügen via Clipboard (zuverlässiger als typeText für Sonderzeichen)
    setClipboard(testText);
    await pressKeys(Key.LeftControl, Key.V);
    await sleep(500);

    const afterPaste = await takeScreenshot('4.3-after-paste');
    expect(require('fs').existsSync(afterPaste)).toBe(true);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);

    // Alles markieren und kopieren
    await pressKeys(Key.LeftControl, Key.A);
    await sleep(200);
    await pressKeys(Key.LeftControl, Key.C);
    await sleep(300);

    // Clipboard-Inhalt prüfen (sollte den eingefügten Text enthalten)
    const copied = getClipboard();
    expect(copied).toContain(testText);

    await pressKeys(Key.Escape);
  });

  test('4.4 Ctrl+Z Undo im Eingabefeld', async () => {
    await typeText('Undo-Test');
    await sleep(300);

    const before = await takeScreenshot('4.4-before-undo');

    await pressKeys(Key.LeftControl, Key.Z);
    await sleep(300);

    const after = await takeScreenshot('4.4-after-undo');

    expect(require('fs').existsSync(before)).toBe(true);
    expect(require('fs').existsSync(after)).toBe(true);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);
  });

  test('4.5 Lange Eingabe tippt ohne Absturz', async () => {
    // 200 Zeichen tippen
    const longText = 'a'.repeat(200);
    await typeText(longText);
    await sleep(500);

    const screenshot = await takeScreenshot('4.5-long-input');
    expect(require('fs').existsSync(screenshot)).toBe(true);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);

    await pressKeys(Key.Escape);
  });

  test('4.6 Ctrl+Enter als alternativer Sende-Shortcut', async () => {
    await typeText('Test per Ctrl+Enter senden');
    await sleep(300);

    const before = await takeScreenshot('4.6-before-send');

    // Ctrl+Enter – einige Electron-Apps nutzen das zum Senden
    await pressKeys(Key.LeftControl, Key.Return);
    await sleep(2000);

    const after = await takeScreenshot('4.6-after-ctrl-enter');

    expect(require('fs').existsSync(before)).toBe(true);
    expect(require('fs').existsSync(after)).toBe(true);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);
  });
});
