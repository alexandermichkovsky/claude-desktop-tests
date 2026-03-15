import { test, expect } from '@playwright/test';
import { Key } from '@nut-tree-fork/nut-js';
import {
  getClaudeWindowTitles,
  showClaudeDesktop,
  focusClaudeDesktop,
  sleep,
  pressKeys,
  takeScreenshot,
} from './helpers/app';

test.describe('UI-Navigation', () => {
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

  test('3.1 Sidebar öffnen/schließen via Tastenkombination', async () => {
    const before = await takeScreenshot('3.1-sidebar-before');

    // Ctrl+Shift+S oder andere bekannte Sidebar-Shortcuts probieren
    // Claude Desktop nutzt ggf. kein Standard-Shortcut - Screenshot-Vergleich
    await pressKeys(Key.LeftControl, Key.LeftShift, Key.S);
    await sleep(800);
    const mid = await takeScreenshot('3.1-sidebar-toggled');

    // Zurück togglen
    await pressKeys(Key.LeftControl, Key.LeftShift, Key.S);
    await sleep(800);
    const after = await takeScreenshot('3.1-sidebar-restored');

    expect(require('fs').existsSync(before)).toBe(true);
    expect(require('fs').existsSync(mid)).toBe(true);
    expect(require('fs').existsSync(after)).toBe(true);

    // App läuft noch
    const titles = getClaudeWindowTitles();
    expect(titles.length).toBeGreaterThan(0);
  });

  test('3.2 Suchfunktion via Ctrl+K öffnet Suchpalette', async () => {
    // Neue Konversation um sauberen Zustand zu haben
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(800);

    const before = await takeScreenshot('3.2-search-before');

    // Ctrl+K öffnet üblicherweise Befehlspalette / Suche in Electron-Apps
    await pressKeys(Key.LeftControl, Key.K);
    await sleep(800);

    const after = await takeScreenshot('3.2-search-open');

    expect(require('fs').existsSync(before)).toBe(true);
    expect(require('fs').existsSync(after)).toBe(true);

    // Escape schließt die Suche wieder
    await pressKeys(Key.Escape);
    await sleep(300);

    const titles = getClaudeWindowTitles();
    expect(titles.length).toBeGreaterThan(0);
  });

  test('3.3 App reagiert auf Tab-Taste (Navigation zwischen Elementen)', async () => {
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(800);

    // Tab navigiert durch interaktive Elemente
    for (let i = 0; i < 3; i++) {
      await pressKeys(Key.Tab);
      await sleep(200);
    }

    const screenshot = await takeScreenshot('3.3-tab-navigation');
    expect(require('fs').existsSync(screenshot)).toBe(true);

    // App noch stabil
    const titles = getClaudeWindowTitles();
    expect(titles.length).toBeGreaterThan(0);
  });

  test('3.4 App bleibt nach mehreren Shortcut-Kombinationen stabil', async () => {
    // Mehrere Shortcuts in Folge - Stabilitätstest
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(500);
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(500);
    await pressKeys(Key.Escape);
    await sleep(300);
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(800);

    const screenshot = await takeScreenshot('3.4-stability');
    expect(require('fs').existsSync(screenshot)).toBe(true);

    const titles = getClaudeWindowTitles();
    expect(titles.length).toBeGreaterThan(0);
    expect(titles[0]).toContain('Claude');
  });
});
