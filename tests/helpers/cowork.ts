import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function runTempScript(scriptBody: string): string {
  const tmpFile = path.join(os.tmpdir(), `claude-cowork-${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmpFile, scriptBody, 'utf8');
    return execSync(`powershell -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 20_000 })
      .toString()
      .trim();
  } catch (e) {
    console.warn(`[cowork] PowerShell script failed: ${e instanceof Error ? e.message : String(e)}`);
    return '';
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// Shared UIA setup block — reused across all helper scripts.
// Note: PowerShell $variables are NOT TypeScript interpolations; only ${expr} is.
const UIA_HEADER = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$claudeProc = Get-Process -Name claude -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object -First 1
if (-not $claudeProc) { Write-Output 'null'; exit }

$root   = [System.Windows.Automation.AutomationElement]::RootElement
$cond   = New-Object System.Windows.Automation.PropertyCondition(
              [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
              [int]$claudeProc.Id)
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
if (-not $window) { Write-Output 'null'; exit }
`;

// Win32 ShowWindow helper — isolated class name to avoid clash with app.ts ClaudeWin32.
const WIN32_HEADER = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CoworkWin32 {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$proc = Get-Process -Name claude -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object -First 1
if (-not $proc) { exit }
$hwnd = $proc.MainWindowHandle
`;

/**
 * Finds any UIA element in the Claude Desktop window by exact name.
 * Returns screen centre coordinates of the first match, or null.
 * Used for tab navigation (Chat / Cowork / Code).
 */
export function getTabCoords(tabName: string): { x: number; y: number } | null {
  // Guard against PowerShell injection — tab names are short alphanumeric labels.
  if (!/^[\w\s-]{1,64}$/.test(tabName)) {
    throw new Error(`Invalid tabName (only word chars, spaces, hyphens allowed): "${tabName}"`);
  }
  const result = runTempScript(`
${UIA_HEADER}

$allEls = $window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition)

foreach ($el in $allEls) {
    if ($el.Current.Name -eq '${tabName}') {
        $rect = $el.Current.BoundingRectangle
        if ($rect.Width -gt 0 -and $rect.Height -gt 0) {
            $cx = [int]($rect.X + $rect.Width  / 2)
            $cy = [int]($rect.Y + $rect.Height / 2)
            Write-Output "$cx,$cy"
            exit
        }
    }
}
Write-Output 'null'
`);

  if (!result || result === 'null') return null;
  const parts = result.split(',').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return { x: parts[0], y: parts[1] };
}

/**
 * Returns true when the UIA element named "Cowork" reports IsSelected=true
 * via SelectionItemPattern.  Falls back to TogglePattern if SelectionItem is
 * not supported (custom tab rendering in Electron).
 * Returns false when neither pattern is available or the element is not found.
 */
export function isCoworkActive(): boolean {
  const result = runTempScript(`
${UIA_HEADER}

$allEls = $window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition)

foreach ($el in $allEls) {
    if ($el.Current.Name -eq 'Cowork') {
        try {
            $sip = $el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
            Write-Output $sip.Current.IsSelected.ToString().ToLower()
            exit
        } catch {}
        try {
            $tp = $el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
            $on = $tp.Current.ToggleState -ne [System.Windows.Automation.ToggleState]::Off
            Write-Output $on.ToString().ToLower()
            exit
        } catch {}
        Write-Output 'unknown'
        exit
    }
}
Write-Output 'false'
`);

  if (result === 'unknown') {
    console.warn('[cowork] isCoworkActive: neither SelectionItemPattern nor TogglePattern available — UIA tab structure may differ from expected');
  }
  return result === 'true';
}

/** Minimizes the Claude Desktop window (ShowWindow SW_MINIMIZE = 6). */
export function minimizeClaudeWindow(): void {
  runTempScript(`
${WIN32_HEADER}
[CoworkWin32]::ShowWindow([IntPtr]$hwnd, 6) | Out-Null
`);
}

/** Restores the Claude Desktop window from minimized state (ShowWindow SW_RESTORE = 9). */
export function restoreClaudeWindow(): void {
  runTempScript(`
${WIN32_HEADER}
[CoworkWin32]::ShowWindow([IntPtr]$hwnd, 9) | Out-Null
`);
}

/**
 * Scans UIA buttons in the Claude Desktop window and returns the screen centre
 * coordinates of the first *enabled* button whose name contains a common
 * submit/send keyword.
 *
 * Note: If the app renders the send button as an icon with no name, this will
 * return null.  Adjust the submitNames list after manual UIA exploration.
 */
export function getEnabledSubmitButtonCoords(): { x: number; y: number } | null {
  const result = runTempScript(`
${UIA_HEADER}

$btnCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
$buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)

$submitNames = @('Submit', 'Send', 'Run', 'Start', 'Execute', 'Go')

foreach ($btn in $buttons) {
    if (-not $btn.Current.IsEnabled) { continue }
    $name = $btn.Current.Name
    foreach ($sn in $submitNames) {
        if ($name -like "*$sn*") {
            $rect = $btn.Current.BoundingRectangle
            $cx   = [int]($rect.X + $rect.Width  / 2)
            $cy   = [int]($rect.Y + $rect.Height / 2)
            Write-Output "$cx,$cy"
            exit
        }
    }
}
Write-Output 'null'
`);

  if (!result || result === 'null') return null;
  const parts = result.split(',').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return { x: parts[0], y: parts[1] };
}
