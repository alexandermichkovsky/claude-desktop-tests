import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import {
  getClaudeDesktopProcesses,
  killClaudeDesktop,
  waitForClaudeWindow,
  showClaudeDesktop,
  focusClaudeDesktop,
  getClaudeWindowRect,
  getExeVersion,
  CLAUDE_VERSION,
  CLAUDE_EXE,
} from './helpers/app';

test.describe('Startup & Initialisierung', () => {
  test.beforeAll(async () => {
    // Claude Desktop frisch starten
    killClaudeDesktop();
    await new Promise((r) => setTimeout(r, 3000));
    // Neu starten
    execSync(
      "powershell -Command \"Start-Process 'explorer.exe' 'shell:AppsFolder\\Claude_pzs8sxrjxfjjc!Claude'\"",
      { stdio: 'ignore' }
    );
    // Auf sichtbares Fenster warten (max. 30s)
    await waitForClaudeWindow(30_000);
  });

  test.afterAll(() => {
    // Nach allen Tests Claude Desktop offen lassen (kein Kill)
  });

  test('1.1 App startet erfolgreich ohne Absturz', async () => {
    const processes = getClaudeDesktopProcesses();
    expect(processes.length).toBeGreaterThan(0);
  });

  test('1.2 Hauptfenster erscheint und Titel enthält "Claude"', async () => {
    // Fenster ggf. aus Tray holen
    const windowTitle = await showClaudeDesktop(20_000);
    expect(windowTitle).toContain('Claude');
  });

  test('1.3 Fenstergröße ist mindestens 800x600 px', async () => {
    await showClaudeDesktop(20_000);

    const rect = getClaudeWindowRect();
    expect(rect).not.toBeNull();
    expect(rect!.width).toBeGreaterThanOrEqual(800);
    expect(rect!.height).toBeGreaterThanOrEqual(600);
  });

  test('1.4 App startet vollständig (mindestens 5 Prozesse aktiv)', async () => {
    // Electron spawnt mehrere Subprozesse: main + GPU + renderer + network + crashpad
    // Warte bis alle Prozesse da sind
    let processes: { id: number; workingSet: number }[] = [];

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      processes = getClaudeDesktopProcesses();
      if (processes.length >= 5) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(processes.length).toBeGreaterThanOrEqual(5);
  });

  test('1.5 Korrekte App-Version ist abrufbar', async () => {
    const version = getExeVersion(CLAUDE_EXE);
    expect(version).toContain(CLAUDE_VERSION);
  });
});
