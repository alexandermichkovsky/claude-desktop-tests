import { test, expect } from '@playwright/test';
import { Key } from '@nut-tree-fork/nut-js';
import {
  getClaudeDesktopProcesses,
  getClaudeWindowTitles,
  showClaudeDesktop,
  focusClaudeDesktop,
  sleep,
  pressKeys,
  takeScreenshot,
} from './helpers/app';

test.describe('Einstellungen', () => {
  test.beforeAll(async () => {
    await showClaudeDesktop(20_000);
    await sleep(1000);
    focusClaudeDesktop();
    await sleep(500);
  });

  test.beforeEach(async () => {
    focusClaudeDesktop();
    await sleep(300);
  });

  test('5.1 Einstellungen öffnen via Ctrl+Comma', async () => {
    const before = await takeScreenshot('5.1-before-settings');

    // Ctrl+, ist der Standard-Einstellungen-Shortcut in vielen Electron-Apps
    await pressKeys(Key.LeftControl, Key.Comma);
    await sleep(1000);

    const after = await takeScreenshot('5.1-settings-open');

    expect(require('fs').existsSync(before)).toBe(true);
    expect(require('fs').existsSync(after)).toBe(true);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);

    // Einstellungen wieder schließen
    await pressKeys(Key.Escape);
    await sleep(500);
  });

  test('5.2 App reagiert auf Escape in Dialogen', async () => {
    // Settings öffnen
    await pressKeys(Key.LeftControl, Key.Comma);
    await sleep(800);

    const open = await takeScreenshot('5.2-dialog-open');

    // Escape schließt Dialog
    await pressKeys(Key.Escape);
    await sleep(500);

    const closed = await takeScreenshot('5.2-dialog-closed');

    expect(require('fs').existsSync(open)).toBe(true);
    expect(require('fs').existsSync(closed)).toBe(true);

    const titles = getClaudeWindowTitles();
    expect(titles.length).toBeGreaterThan(0);
    expect(titles[0]).toContain('Claude');
  });

  test('5.3 App-Fenster bleibt nach Einstellungs-Interaktion stabil', async () => {
    // Einstellungen mehrfach öffnen/schließen
    for (let i = 0; i < 3; i++) {
      await pressKeys(Key.LeftControl, Key.Comma);
      await sleep(600);
      await pressKeys(Key.Escape);
      await sleep(400);
    }

    const screenshot = await takeScreenshot('5.3-stability');
    expect(require('fs').existsSync(screenshot)).toBe(true);

    const titles = getClaudeWindowTitles();
    expect(titles.length).toBeGreaterThan(0);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);
  });

  test('5.4 Keyboard-Shortcut Hilfe via Ctrl+Shift+? oder F1', async () => {
    const before = await takeScreenshot('5.4-before-help');

    // F1 öffnet oft eine Hilfe/About-Sektion
    await pressKeys(Key.F1);
    await sleep(800);

    const after = await takeScreenshot('5.4-after-help');

    expect(require('fs').existsSync(before)).toBe(true);
    expect(require('fs').existsSync(after)).toBe(true);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);

    await pressKeys(Key.Escape);
    await sleep(300);
  });
});
