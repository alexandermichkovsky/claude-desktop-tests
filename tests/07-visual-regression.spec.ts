import { test, expect } from '@playwright/test';
import { Key } from '@nut-tree-fork/nut-js';
import {
  killClaudeDesktop,
  launchClaudeDesktop,
  focusClaudeDesktop,
  sleep,
  pressKeys,
} from './helpers/app';
import { compareToBaseline } from './helpers/visual';

// Erlaubte Abweichung: 1 % der Pixel (toleriert Anti-Aliasing, Cursor, Animationen)
const TOLERANCE = 1.0;

test.describe('Visual Regression', () => {
  test.beforeAll(async () => {
    // Frischer App-Start für reproduzierbare, zustandsunabhängige Snapshots
    killClaudeDesktop();
    await sleep(2_000);
    await launchClaudeDesktop(30_000);
    await sleep(1_000);
    focusClaudeDesktop();
    await sleep(500);
  });

  test.beforeEach(async () => {
    focusClaudeDesktop();
    await sleep(300);
  });

  test('7.1 Hauptfenster (Ruhezustand)', async () => {
    // Neuen leeren Chat öffnen für reproduzierbaren Zustand
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(1000);

    const result = await compareToBaseline('7.1-main-window', TOLERANCE);

    if (result.isNewBaseline) {
      console.log('  → Neue Baseline gespeichert:', result.baselinePath);
    } else {
      console.log(`  → Diff: ${result.diffPercent.toFixed(3)} % (${result.diffPixels} Pixel)`);
      expect(result.diffPercent).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  test('7.2 Einstellungsdialog geöffnet', async () => {
    await pressKeys(Key.LeftControl, Key.Comma);
    await sleep(1000);

    const result = await compareToBaseline('7.2-settings-dialog', TOLERANCE);

    if (result.isNewBaseline) {
      console.log('  → Neue Baseline gespeichert:', result.baselinePath);
    } else {
      console.log(`  → Diff: ${result.diffPercent.toFixed(3)} % (${result.diffPixels} Pixel)`);
      expect(result.diffPercent).toBeLessThanOrEqual(TOLERANCE);
    }

    await pressKeys(Key.Escape);
    await sleep(300);
  });

  test('7.3 Suchpalette (Ctrl+K)', async () => {
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(600);
    await pressKeys(Key.LeftControl, Key.K);
    await sleep(800);

    const result = await compareToBaseline('7.3-search-palette', TOLERANCE);

    if (result.isNewBaseline) {
      console.log('  → Neue Baseline gespeichert:', result.baselinePath);
    } else {
      console.log(`  → Diff: ${result.diffPercent.toFixed(3)} % (${result.diffPixels} Pixel)`);
      expect(result.diffPercent).toBeLessThanOrEqual(TOLERANCE);
    }

    await pressKeys(Key.Escape);
    await sleep(300);
  });

  test('7.4 Eingabefeld mit Text', async () => {
    await pressKeys(Key.LeftControl, Key.N);
    await sleep(600);

    // Fester Testtext für reproduzierbaren Screenshot
    const { typeText } = await import('./helpers/app');
    await typeText('Snapshot-Test: dieser Text sollte stabil sein.');
    await sleep(500);

    const result = await compareToBaseline('7.4-input-with-text', TOLERANCE);

    if (result.isNewBaseline) {
      console.log('  → Neue Baseline gespeichert:', result.baselinePath);
    } else {
      console.log(`  → Diff: ${result.diffPercent.toFixed(3)} % (${result.diffPixels} Pixel)`);
      expect(result.diffPercent).toBeLessThanOrEqual(TOLERANCE);
    }

    await pressKeys(Key.Escape);
  });
});
