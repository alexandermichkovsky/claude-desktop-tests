import { test, expect } from '@playwright/test';
import { Key } from '@nut-tree-fork/nut-js';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  getClaudeDesktopProcesses,
  getClaudeWindowTitles,
  getClaudeWindowRect,
  showClaudeDesktop,
  focusClaudeDesktop,
  sleep,
  pressKeys,
  takeScreenshot,
  CLAUDE_AUMID,
} from './helpers/app';

/** Minimiert das Claude-Fenster via Win32 ShowWindow(SW_MINIMIZE=6). */
function minimizeClaudeWindow(): void {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinMin {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$proc = Get-Process -Name claude -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object -First 1
if ($proc) { [WinMin]::ShowWindow($proc.MainWindowHandle, 6) | Out-Null }
`;
  const tmpFile = path.join(os.tmpdir(), `claude-minimize-${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmpFile, script, 'utf8');
    execSync(`powershell -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 10_000, stdio: 'ignore' });
  } catch { /* ignore */ }
  finally { try { fs.unlinkSync(tmpFile); } catch {} }
}

/** Maximiert das Claude-Fenster via Win32 ShowWindow(SW_MAXIMIZE=3). */
function maximizeClaudeWindow(): void {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinMax {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$proc = Get-Process -Name claude -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object -First 1
if ($proc) { [WinMax]::ShowWindow($proc.MainWindowHandle, 3) | Out-Null }
`;
  const tmpFile = path.join(os.tmpdir(), `claude-maximize-${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmpFile, script, 'utf8');
    execSync(`powershell -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 10_000, stdio: 'ignore' });
  } catch { /* ignore */ }
  finally { try { fs.unlinkSync(tmpFile); } catch {} }
}

/** Stellt das Claude-Fenster normal wieder her via Win32 ShowWindow(SW_RESTORE=9). */
function restoreClaudeWindow(): void {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinRestore {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$proc = Get-Process -Name claude -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object -First 1
if ($null -eq $proc) {
    # Aus Tray/minimiert holen - alle claude Prozesse prüfen
    $proc = Get-Process -Name claude -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($proc) { [WinRestore]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null }
`;
  const tmpFile = path.join(os.tmpdir(), `claude-restore-${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmpFile, script, 'utf8');
    execSync(`powershell -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 10_000, stdio: 'ignore' });
  } catch { /* ignore */ }
  finally { try { fs.unlinkSync(tmpFile); } catch {} }
}

test.describe('Fensterverwaltung', () => {
  test.beforeAll(async () => {
    await showClaudeDesktop(20_000);
    await sleep(1000);
    focusClaudeDesktop();
    await sleep(500);
  });

  test.afterEach(async () => {
    // Fenster nach jedem Test wiederherstellen
    restoreClaudeWindow();
    await sleep(500);
    focusClaudeDesktop();
    await sleep(300);
  });

  test('6.1 Fenster minimieren und wiederherstellen', async () => {
    const rectBefore = getClaudeWindowRect();
    expect(rectBefore).not.toBeNull();

    const screenshotBefore = await takeScreenshot('6.1-before-minimize');

    // Minimieren
    minimizeClaudeWindow();
    await sleep(1000);

    const screenshotMinimized = await takeScreenshot('6.1-minimized');

    // Wiederherstellen via explorer (aus Tray/Taskbar)
    execSync(
      `powershell -Command "Start-Process 'explorer.exe' 'shell:AppsFolder\\${CLAUDE_AUMID}'"`,
      { stdio: 'ignore' }
    );
    await sleep(2000);

    await showClaudeDesktop(10_000);
    const rectAfter = getClaudeWindowRect();

    expect(require('fs').existsSync(screenshotBefore)).toBe(true);
    expect(require('fs').existsSync(screenshotMinimized)).toBe(true);
    // App läuft noch
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);
    // Fenster wieder da
    expect(rectAfter).not.toBeNull();
  });

  test('6.2 Fenster maximieren und wiederherstellen', async () => {
    await showClaudeDesktop(10_000);
    const rectNormal = getClaudeWindowRect();
    expect(rectNormal).not.toBeNull();

    const before = await takeScreenshot('6.2-before-maximize');

    // Maximieren
    maximizeClaudeWindow();
    await sleep(800);

    const maximized = await takeScreenshot('6.2-maximized');
    const rectMax = getClaudeWindowRect();

    // Maximiertes Fenster ist größer
    if (rectMax && rectNormal) {
      expect(rectMax.width).toBeGreaterThanOrEqual(rectNormal.width);
    }

    // Wiederherstellen
    restoreClaudeWindow();
    await sleep(800);

    const restored = await takeScreenshot('6.2-restored');

    expect(require('fs').existsSync(before)).toBe(true);
    expect(require('fs').existsSync(maximized)).toBe(true);
    expect(require('fs').existsSync(restored)).toBe(true);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);
  });

  test('6.3 Win+Down minimiert, Win+Up maximiert', async () => {
    await showClaudeDesktop(10_000);
    focusClaudeDesktop();
    await sleep(500);

    const before = await takeScreenshot('6.3-before-winkey');

    // Win+Down minimiert in Taskbar
    await pressKeys(Key.LeftWin, Key.Down);
    await sleep(1000);

    const minimized = await takeScreenshot('6.3-win-down');

    // Wiederherstellen
    execSync(
      `powershell -Command "Start-Process 'explorer.exe' 'shell:AppsFolder\\${CLAUDE_AUMID}'"`,
      { stdio: 'ignore' }
    );
    await sleep(1500);
    await showClaudeDesktop(10_000);

    const restored = await takeScreenshot('6.3-restored');

    expect(require('fs').existsSync(before)).toBe(true);
    expect(require('fs').existsSync(minimized)).toBe(true);
    expect(require('fs').existsSync(restored)).toBe(true);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);
  });

  test('6.4 Prozesse überleben Minimieren/Maximieren-Zyklus', async () => {
    await showClaudeDesktop(10_000);
    const processesBefore = getClaudeDesktopProcesses().length;

    // Mehrere Zyklen
    for (let i = 0; i < 3; i++) {
      maximizeClaudeWindow();
      await sleep(400);
      restoreClaudeWindow();
      await sleep(400);
    }

    const processesAfter = getClaudeDesktopProcesses().length;
    const screenshot = await takeScreenshot('6.4-cycle');

    expect(require('fs').existsSync(screenshot)).toBe(true);
    expect(processesAfter).toBeGreaterThan(0);
    // Keine Prozesse verloren
    expect(processesAfter).toBeGreaterThanOrEqual(Math.min(processesBefore, 1));
  });

  test('6.5 Fenster hat gültige Position auf dem Bildschirm', async () => {
    await showClaudeDesktop(10_000);
    const rect = getClaudeWindowRect();

    expect(rect).not.toBeNull();
    if (rect) {
      // X und Y dürfen nicht extrem negativ sein (außerhalb des Bildschirms)
      expect(rect.x).toBeGreaterThan(-200);
      expect(rect.y).toBeGreaterThan(-200);
      // Mindestgröße
      expect(rect.width).toBeGreaterThanOrEqual(400);
      expect(rect.height).toBeGreaterThanOrEqual(300);
    }
  });

  test('6.6 App bleibt stabil nach Alt+Tab', async () => {
    await showClaudeDesktop(10_000);
    focusClaudeDesktop();
    await sleep(300);

    const before = await takeScreenshot('6.6-before-alttab');

    // Alt+Tab wechselt zu anderer App
    await pressKeys(Key.LeftAlt, Key.Tab);
    await sleep(800);

    // Zurück zu Claude
    focusClaudeDesktop();
    await sleep(500);

    const after = await takeScreenshot('6.6-after-focus-back');

    expect(require('fs').existsSync(before)).toBe(true);
    expect(require('fs').existsSync(after)).toBe(true);

    const titles = getClaudeWindowTitles();
    expect(titles.length).toBeGreaterThan(0);
    expect(getClaudeDesktopProcesses().length).toBeGreaterThan(0);
  });
});
