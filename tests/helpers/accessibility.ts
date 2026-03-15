import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function runTempScript(scriptBody: string): string {
  const tmpFile = path.join(os.tmpdir(), `claude-a11y-${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmpFile, scriptBody, 'utf8');
    return execSync(`powershell -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 20_000 })
      .toString()
      .trim();
  } catch {
    return '';
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

export interface UIAElement {
  name: string;
  controlType: string;
  isKeyboardFocusable: boolean;
  isEnabled: boolean;
}

export interface UIAWindowInfo {
  found: boolean;
  windowName: string;
  elementCount: number;
  focusableCount: number;
  buttons: UIAElement[];
  unnamedButtons: UIAElement[];
}

/**
 * Queries the Windows UI Automation tree of the Claude Desktop main window.
 * Uses UIAutomationClient (.NET) — the same API used by screen readers (NVDA, Narrator).
 */
export function getUIAWindowInfo(): UIAWindowInfo {
  const empty: UIAWindowInfo = {
    found: false, windowName: '', elementCount: 0,
    focusableCount: 0, buttons: [], unnamedButtons: [],
  };

  const result = runTempScript(`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$claudeProc = Get-Process -Name claude -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object -First 1
if (-not $claudeProc) { Write-Output '{"found":false}'; exit }

$root   = [System.Windows.Automation.AutomationElement]::RootElement
$cond   = New-Object System.Windows.Automation.PropertyCondition(
              [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
              [int]$claudeProc.Id)
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
if (-not $window) { Write-Output '{"found":false}'; exit }

$allEls = $window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition)

$focusableCount = 0
$buttons        = [System.Collections.Generic.List[hashtable]]::new()
$unnamedButtons = [System.Collections.Generic.List[hashtable]]::new()

foreach ($el in $allEls) {
    $ct   = $el.Current.ControlType.ProgrammaticName
    $name = $el.Current.Name
    if ($el.Current.IsKeyboardFocusable) { $focusableCount++ }
    if ($ct -eq 'ControlType.Button') {
        $rect     = $el.Current.BoundingRectangle
        $automId  = $el.Current.AutomationId
        $helpText = $el.Current.HelpText
        # Walk up one level to get parent name for context
        $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
        $parent = $walker.GetParent($el)
        $parentName = if ($parent) { $parent.Current.Name } else { '' }
        $obj = @{ name = $name; controlType = $ct;
                  isKeyboardFocusable = $el.Current.IsKeyboardFocusable;
                  isEnabled = $el.Current.IsEnabled;
                  automationId = $automId;
                  helpText = $helpText;
                  parentName = $parentName;
                  x = [int]$rect.X; y = [int]$rect.Y;
                  width = [int]$rect.Width; height = [int]$rect.Height }
        $buttons.Add($obj)
        if ([string]::IsNullOrWhiteSpace($name)) { $unnamedButtons.Add($obj) }
    }
}

@{
    found           = $true
    windowName      = $window.Current.Name
    elementCount    = $allEls.Count
    focusableCount  = $focusableCount
    buttons         = $buttons.ToArray()
    unnamedButtons  = $unnamedButtons.ToArray()
} | ConvertTo-Json -Depth 3 -Compress
`);

  if (!result) return empty;
  try {
    const p = JSON.parse(result);
    return {
      found:          p.found          ?? false,
      windowName:     p.windowName     ?? '',
      elementCount:   p.elementCount   ?? 0,
      focusableCount: p.focusableCount ?? 0,
      buttons:        Array.isArray(p.buttons)        ? p.buttons        : [],
      unnamedButtons: Array.isArray(p.unnamedButtons) ? p.unnamedButtons : [],
    };
  } catch {
    return empty;
  }
}

/**
 * Returns the name and control type of the currently focused UIA element.
 * Useful for verifying that Tab moves focus to a named, interactive element.
 */
export function getFocusedElement(): { name: string; controlType: string } | null {
  const result = runTempScript(`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$focused = [System.Windows.Automation.AutomationElement]::FocusedElement
if (-not $focused) { Write-Output 'null'; exit }

@{ name = $focused.Current.Name
   controlType = $focused.Current.ControlType.ProgrammaticName
} | ConvertTo-Json -Compress
`);

  if (!result || result === 'null') return null;
  try {
    const p = JSON.parse(result);
    return { name: p.name ?? '', controlType: p.controlType ?? '' };
  } catch {
    return null;
  }
}

/**
 * Sends a keyboard shortcut directly to the Claude Desktop window using
 * PowerShell AppActivate + SendKeys — both in the same process, so there is
 * no race condition between "focus window" and "send keys".
 *
 * shortcut: SendKeys notation — e.g. "^+i" = Ctrl+Shift+I
 */
export function pressShortcutViaPS(shortcut: string): void {
  runTempScript(`
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type -AssemblyName System.Windows.Forms

$proc = Get-Process -Name claude -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object -First 1
if (-not $proc) { exit }

[Microsoft.VisualBasic.Interaction]::AppActivate([int]$proc.Id)
Start-Sleep -Milliseconds 400
[System.Windows.Forms.SendKeys]::SendWait("${shortcut}")
Start-Sleep -Milliseconds 200
`);
}

/**
 * Captures a screenshot of the Claude Desktop window using PowerShell CopyFromScreen.
 * Unlike nut-js screen.capture() which has known issues returning identical images,
 * this uses the Windows GDI+ compositor directly and reliably captures the current state.
 * Returns the absolute file path of the saved PNG.
 */
export function captureWindowScreenshot(name: string): string {
  const screenshotDir = path.join(process.cwd(), 'test-screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const filePath = path.join(screenshotDir, `${name}-${Date.now()}.png`).replace(/\\/g, '/');

  runTempScript(`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

$claudeProc = Get-Process -Name claude -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object -First 1
if (-not $claudeProc) { exit }

$root   = [System.Windows.Automation.AutomationElement]::RootElement
$cond   = New-Object System.Windows.Automation.PropertyCondition(
              [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
              [int]$claudeProc.Id)
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
if (-not $window) { exit }

$rect = $window.Current.BoundingRectangle
$w = [int]$rect.Width;  $h = [int]$rect.Height
$x = [int]$rect.X;      $y = [int]$rect.Y

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$g.Dispose()
$bmp.Save("${filePath}", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
`);

  return filePath;
}

/**
 * Returns the screen center coordinates of the Incognito button (ghost icon).
 * Claude Desktop's Incognito button has no UIA name — it's the only unnamed button.
 */
export function getIncognitoButtonCoords(): { x: number; y: number } | null {
  const result = runTempScript(`
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

$btnCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
$buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)

foreach ($btn in $buttons) {
    if ([string]::IsNullOrWhiteSpace($btn.Current.Name)) {
        $rect = $btn.Current.BoundingRectangle
        $cx = [int]($rect.X + $rect.Width / 2)
        $cy = [int]($rect.Y + $rect.Height / 2)
        Write-Output "$cx,$cy"
        exit
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
 * Returns the R+G+B brightness sum (0–765) of a pixel near the centre of the
 * Claude Desktop title bar.  Normal mode ≈ 700, incognito mode ≈ 42.
 * Returns -1 if the window cannot be found.
 *
 * Used by `isIncognitoActive()` and directly by test 10.2 to verify the
 * visual indicator (dark title bar in incognito mode).
 */
export function getTitleBarBrightness(): number {
  const result = runTempScript(`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

$claudeProc = Get-Process -Name claude -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object -First 1
if (-not $claudeProc) { Write-Output '-1'; exit }

$root   = [System.Windows.Automation.AutomationElement]::RootElement
$cond   = New-Object System.Windows.Automation.PropertyCondition(
              [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
              [int]$claudeProc.Id)
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
if (-not $window) { Write-Output '-1'; exit }

$rect = $window.Current.BoundingRectangle
# Sample a pixel near the centre of the title bar (~20px from top)
$sampleX = [int]($rect.X + $rect.Width / 2)
$sampleY = [int]($rect.Y + 20)

$bmp = New-Object System.Drawing.Bitmap(1, 1)
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($sampleX, $sampleY, 0, 0, (New-Object System.Drawing.Size(1, 1)))
$col = $bmp.GetPixel(0, 0)
$g.Dispose()
$bmp.Dispose()

$brightness = [int]$col.R + [int]$col.G + [int]$col.B
Write-Output $brightness
`);

  const brightness = parseInt(result.trim(), 10);
  return isNaN(brightness) ? -1 : brightness;
}

/**
 * Checks whether Incognito mode is active by sampling the title bar pixel color.
 * In incognito mode Claude Desktop renders a dark title bar; in normal mode it is light.
 * Threshold: sum of R+G+B < 300 → dark → incognito active.
 *
 * Note: UIA text search is NOT reliable here because the sidebar always shows
 * previous incognito chat titles (e.g. "Inkognito-Chat"), causing false positives.
 * The HWND title (Process.MainWindowTitle) also never changes — it stays "Claude".
 */
export function isIncognitoActive(): boolean {
  const brightness = getTitleBarBrightness();
  if (brightness < 0) return false;
  return brightness < 300;
}
