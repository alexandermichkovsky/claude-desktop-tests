import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { keyboard, mouse, screen, Key } from '@nut-tree-fork/nut-js';

// nut-js Konfiguration
keyboard.config.autoDelayMs = 50;
mouse.config.autoDelayMs = 50;
mouse.config.mouseSpeed = 1500;

export const CLAUDE_AUMID = 'Claude_pzs8sxrjxfjjc!Claude';

// ─── Dynamische Paket-Erkennung via Get-AppxPackage ───────────────────────

function detectClaudePackage(): { version: string; exePath: string } {
  try {
    const result = runTempScript(`
$pkg = Get-AppxPackage -Name '*Claude*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pkg) { Write-Output "$($pkg.Version)|$($pkg.InstallLocation)" }
`);

    if (result) {
      const [version, installLocation] = result.split('|');
      // Version z.B. "1.1.6679.0" → "1.1.6679"
      const shortVersion = version.split('.').slice(0, 3).join('.');
      return {
        version: shortVersion,
        exePath: installLocation.replace(/\\/g, '/') + '/app/Claude.exe',
      };
    }
  } catch { /* fallback */ }

  // Fallback auf bekannte Werte falls Get-AppxPackage nicht verfügbar
  return {
    version: '1.1.6679',
    exePath: 'C:/Program Files/WindowsApps/Claude_1.1.6679.0_x64__pzs8sxrjxfjjc/app/Claude.exe',
  };
}

const _pkg = detectClaudePackage();
export const CLAUDE_VERSION = _pkg.version;
export const CLAUDE_EXE = _pkg.exePath;

// ─── Hilfsfunktion für PowerShell Temp-Scripts ────────────────────────────

function runTempScript(scriptBody: string): string {
  const tmpFile = path.join(os.tmpdir(), `claude-test-${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmpFile, scriptBody, 'utf8');
    return execSync(`powershell -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 15_000 })
      .toString()
      .trim();
  } catch {
    return '';
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ─── Win32 GetWindowRect/SetForegroundWindow ───────────────────────────────

const WIN32_TYPE_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ClaudeWin32 {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
`;

// ─── Prozess-Funktionen ────────────────────────────────────────────────────

/** Liefert alle laufenden Claude Desktop Prozesse (nicht Claude Code CLI). */
export function getClaudeDesktopProcesses(): { id: number; workingSet: number }[] {
  const result = execSync(
    'powershell -Command "Get-Process -Name claude -ErrorAction SilentlyContinue | ' +
      "Where-Object { $_.Path -like '*WindowsApps*' } | " +
      'Select-Object Id,WorkingSet | ConvertTo-Json"'
  ).toString().trim();

  if (!result) return [];
  try {
    const parsed = JSON.parse(result);
    const items: { Id: number; WorkingSet: number }[] = Array.isArray(parsed) ? parsed : [parsed];
    // PowerShell gibt PascalCase-Keys zurück (Id, WorkingSet) → auf camelCase mappen
    return items.map((p) => ({ id: p.Id, workingSet: p.WorkingSet }));
  } catch {
    return [];
  }
}

/** Beendet alle Claude Desktop Prozesse. */
export function killClaudeDesktop(): void {
  try {
    execSync(
      'powershell -Command "Get-Process -Name claude -ErrorAction SilentlyContinue | ' +
        "Where-Object { $_.Path -like '*WindowsApps*' } | Stop-Process -Force" +
        '"',
      { stdio: 'ignore' }
    );
  } catch { /* Ignorieren */ }
}

// ─── Fenster-Funktionen (Get-Process.MainWindowTitle) ─────────────────────

/**
 * Findet den Claude Desktop Prozess mit Hauptfenster-Titel.
 * WICHTIG: Funktioniert via .NET Process.MainWindowTitle (nicht user32 EnumWindows,
 * welches in non-interactive Prozessen keine Fenster sieht).
 */
function getClaudeProcessWithWindow(): { pid: number; title: string; hwnd: number } | null {
  const result = runTempScript(`
$proc = Get-Process -Name claude -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object -First 1
if ($null -eq $proc) { Write-Output 'null'; exit }
Write-Output "$($proc.Id)|$($proc.MainWindowTitle)|$($proc.MainWindowHandle)"
`);

  if (!result || result === 'null') return null;
  const parts = result.split('|');
  if (parts.length < 3) return null;
  return { pid: parseInt(parts[0]), title: parts[1], hwnd: parseInt(parts[2]) };
}

/** Gibt Fenstertitel des Claude Desktop Fensters zurück. */
export function getClaudeWindowTitles(): string[] {
  const win = getClaudeProcessWithWindow();
  return win ? [win.title] : [];
}

/** Gibt Größe und Position des Claude Desktop Hauptfensters zurück. */
export function getClaudeWindowRect(): { width: number; height: number; x: number; y: number } | null {
  const win = getClaudeProcessWithWindow();
  if (!win || win.hwnd === 0) return null;

  const result = runTempScript(`
${WIN32_TYPE_SCRIPT}
$rect = New-Object ClaudeWin32+RECT
[ClaudeWin32]::GetWindowRect([IntPtr]${win.hwnd}, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
Write-Output "$($rect.Left),$($rect.Top),$w,$h"
`);

  if (!result) return null;
  const parts = result.split(',').map(Number);
  if (parts.length < 4) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/** Bringt das Claude Desktop Fenster in den Vordergrund. */
export function focusClaudeDesktop(): void {
  const win = getClaudeProcessWithWindow();
  if (!win || win.hwnd === 0) return;

  runTempScript(`
${WIN32_TYPE_SCRIPT}
[ClaudeWin32]::ShowWindow([IntPtr]${win.hwnd}, 9) | Out-Null
[ClaudeWin32]::SetForegroundWindow([IntPtr]${win.hwnd}) | Out-Null
`);
}

/** Wartet, bis Claude Desktop das Hauptfenster zeigt. */
export async function waitForClaudeWindow(timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const titles = getClaudeWindowTitles();
    if (titles.length > 0) return titles[0];
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error('Claude Desktop Fenster nicht gefunden');
}

/** Bringt Claude Desktop aus dem System Tray / startet es falls nötig. */
export async function showClaudeDesktop(timeoutMs = 20_000): Promise<string> {
  // Prüfe ob Fenster schon sichtbar
  const titles = getClaudeWindowTitles();
  if (titles.length > 0) {
    focusClaudeDesktop();
    return titles[0];
  }

  // App aktivieren (aus Tray holen oder neu starten)
  execSync(
    `powershell -Command "Start-Process 'explorer.exe' 'shell:AppsFolder\\${CLAUDE_AUMID}'"`,
    { stdio: 'ignore' }
  );

  const title = await waitForClaudeWindow(timeoutMs);
  focusClaudeDesktop();
  return title;
}

// ─── App-Start/Stop ────────────────────────────────────────────────────────

/** Startet Claude Desktop und wartet bis das Fenster sichtbar ist. */
export async function launchClaudeDesktop(timeoutMs = 30_000): Promise<void> {
  execSync(
    `powershell -Command "Start-Process 'explorer.exe' 'shell:AppsFolder\\${CLAUDE_AUMID}'"`,
    { stdio: 'ignore' }
  );
  await waitForClaudeWindow(timeoutMs);
}

// ─── Interaktions-Helfer ───────────────────────────────────────────────────

/** Kurze Pause in Millisekunden. */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tippt Text via nut-js Keyboard. */
export async function typeText(text: string): Promise<void> {
  await keyboard.type(text);
}

/** Drückt eine Tastenkombination. */
export async function pressKeys(...keys: Key[]): Promise<void> {
  await keyboard.pressKey(...keys);
  await keyboard.releaseKey(...keys);
}

/** Nimmt einen Screenshot des gesamten Bildschirms auf. */
export async function takeScreenshot(name: string): Promise<string> {
  const screenshotDir = path.join(process.cwd(), 'test-screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const fileName = `${name}-${Date.now()}`;
  return await screen.capture(fileName, undefined, screenshotDir);
}

/** Klickt an eine absolute Bildschirmposition. */
export async function clickAt(x: number, y: number): Promise<void> {
  await mouse.move([{ x, y }]);
  await mouse.leftClick();
}

/** Gibt Version einer EXE via FileVersionInfo zurück. */
export function getExeVersion(exePath: string): string {
  return execSync(
    `powershell -Command "(Get-Item '${exePath}').VersionInfo.ProductVersion"`
  ).toString().trim();
}
