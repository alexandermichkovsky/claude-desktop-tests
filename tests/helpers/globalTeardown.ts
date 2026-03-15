import { execSync } from 'child_process';

export default async function globalTeardown(): Promise<void> {
  try {
    execSync(
      'powershell -Command "' +
        "Get-Process -Name claude -ErrorAction SilentlyContinue | " +
        "Where-Object { $_.Path -like '*WindowsApps*' } | " +
        'Stop-Process -Force"',
      { stdio: 'ignore' }
    );
  } catch {
    // Ignorieren
  }
}
