import { chromium, FullConfig } from '@playwright/test';
import { execSync, spawn } from 'child_process';

export const DEBUG_PORT = 9222;
export const CDP_URL = `http://127.0.0.1:${DEBUG_PORT}`;

/** Beendet alle Claude Desktop Prozesse (nicht Claude Code CLI). */
function killClaudeDesktop(): void {
  try {
    execSync(
      'powershell -Command "' +
        "Get-Process -Name claude -ErrorAction SilentlyContinue | " +
        "Where-Object { $_.Path -like '*WindowsApps*' } | " +
        'Stop-Process -Force"',
      { stdio: 'ignore' }
    );
  } catch {
    // Ignorieren wenn keine Prozesse gefunden
  }
}

/** Wartet bis der CDP-Endpunkt erreichbar ist (max. timeoutMs). */
async function waitForCDP(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 2000 });
      await browser.close();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`CDP endpoint ${CDP_URL} not reachable after ${timeoutMs}ms`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // 1. Bestehende Instanzen beenden
  killClaudeDesktop();
  await new Promise((r) => setTimeout(r, 2000));

  // 2. Claude Desktop via AppX Activation mit Debug-Port starten
  //    ApplicationActivationManager erlaubt das Übergeben von CLI-Argumenten an FullTrustApplication
  const psCommand = `
    Add-Type @"
      using System;
      using System.Runtime.InteropServices;

      [ComImport]
      [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
      [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
      interface IApplicationActivationManager {
        int ActivateApplication(string appUserModelId, string arguments, uint options, out uint processId);
        int ActivateForFile(string appUserModelId, object /*IShellItemArray*/ itemArray, string verb, out uint processId);
        int ActivateForProtocol(string appUserModelId, object itemArray, out uint processId);
      }

      [ComImport]
      [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
      [ClassInterface(ClassInterfaceType.None)]
      class ApplicationActivationManager : IApplicationActivationManager { }
"@

    \$mgr = New-Object ApplicationActivationManager
    \$pid = 0
    \$mgr.ActivateApplication("Claude_pzs8sxrjxfjjc!Claude", "--remote-debugging-port=${DEBUG_PORT}", 0, [ref]\$pid)
    Write-Host "Launched PID: \$pid"
  `;

  spawn('powershell', ['-Command', psCommand], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  // 3. Warten bis CDP-Endpunkt verfügbar ist
  await waitForCDP(30_000);
  console.log(`✓ Claude Desktop gestartet, CDP erreichbar auf ${CDP_URL}`);
}
