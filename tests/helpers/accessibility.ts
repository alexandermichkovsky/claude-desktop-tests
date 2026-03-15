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
