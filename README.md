# Claude Desktop E2E Tests

Automatisierte End-to-End-Tests für die **Claude Desktop App** (Electron, Windows Store Package) mit Playwright und nut-js.

## Voraussetzungen

- **Windows 10/11** mit installierter Claude Desktop App (beliebige Version)
- **Node.js** ≥ 18

## Installation

```bash
npm install
```

## Tests ausführen

```bash
# Alle Tests (46 Tests)
npm test

# Einzelne Test-Suite
npx playwright test tests/01-startup.spec.ts

# Nur Visual Regression
npm run test:visual

# Nur Performance
npm run test:performance

# Baselines für Visual Regression zurücksetzen
npm run update-snapshots

# Mit HTML-Report (zwei Schritte in PowerShell)
npm test
npm run report
```

## Projektstruktur

```
.
├── playwright.config.ts              # Playwright-Konfiguration
├── tests/
│   ├── helpers/
│   │   ├── app.ts                    # Kern-Helper: App-Start, Fenster, Input
│   │   ├── visual.ts                 # Snapshot-Vergleich (pixelmatch)
│   │   └── performance.ts            # Performance-Proxy-Metriken
│   ├── 01-startup.spec.ts            # Startup & Initialisierung (5 Tests)
│   ├── 02-conversation.spec.ts       # Konversationsmanagement (6 Tests)
│   ├── 03-ui-navigation.spec.ts      # UI-Navigation & Shortcuts (4 Tests)
│   ├── 04-input-features.spec.ts     # Eingabe-Features (6 Tests)
│   ├── 05-settings.spec.ts           # Einstellungen (4 Tests)
│   ├── 06-window-management.spec.ts  # Fensterverwaltung (6 Tests)
│   ├── 07-visual-regression.spec.ts  # Visual Regression / Snapshot-Vergleich (4 Tests)
│   └── 08-performance.spec.ts        # Performance-Proxy (4 Tests)
├── test-screenshots/
│   ├── baseline/                     # Referenz-Snapshots (Visual Regression)
│   └── diff/                         # Diff-Bilder bei Abweichungen
└── playwright-report/                # HTML-Testreport
```

## Testsuiten (39 Tests gesamt)

| Suite | Beschreibung | Tests |
|-------|-------------|-------|
| 01 Startup | App startet, Fenster erscheint, Version korrekt | 5 |
| 02 Konversation | Ctrl+N, Text senden, Shift+Enter, Escape | 6 |
| 03 Navigation | Sidebar, Suche (Ctrl+K), Tab, Shortcuts | 4 |
| 04 Eingabe | Multiline, Löschen, Copy/Paste, Undo, Ctrl+Enter | 6 |
| 05 Einstellungen | Ctrl+Comma öffnet Settings, Escape schließt | 4 |
| 06 Fenster | Minimieren, Maximieren, Alt+Tab, Positionscheck | 6 |
| 07 Visual Regression | Pixel-Vergleich mit Baseline (1 % Toleranz) | 4 |
| 08 Performance | Startzeit, Speicher, Memory Leak, Reaktionszeit | 4 |
| 09 Accessibility | Windows UIA: Struktur, Tastaturnavigation, Fokus, Shortcuts | 7 |

## Visual Regression

Suite 07 vergleicht Screenshots gegen gespeicherte Baselines mit `pixelmatch` (1 % Pixel-Toleranz).

- **Erster Lauf:** Baselines werden automatisch angelegt (`test-screenshots/baseline/`)
- **Folgeläufe:** Pixel-Diff wird berechnet — Test schlägt fehl wenn > 1 %
- **Diff-Bilder** zeigen exakt welche Bereiche sich verändert haben (`test-screenshots/diff/`)
- **Nach Claude-Update:** `npm run update-snapshots` → Baselines neu anlegen

> Suite 07 startet die App immer frisch (kill + relaunch), um zustandsunabhängige Snapshots zu gewährleisten.

## Performance-Referenzwerte (gemessen)

| Metrik | Gemessen | Limit |
|--------|----------|-------|
| Kaltstart bis Fenster | ~1.7 Sek | 15 Sek |
| WorkingSet gesamt (11 Prozesse) | ~1.55 GB | 2.5 GB |
| Größter Einzelprozess | ~485 MB | 600 MB |
| Speicherwachstum (10 Konversationen) | < 1 % | 50 % |
| Ctrl+N Reaktionszeit (Median) | ~233 ms | 2.000 ms |

## Architektur & technische Besonderheiten

### Warum kein `electron.launch()`?

Claude Desktop ist als **Windows App Package (AppX/MSIX)** installiert. Dies verhindert den direkten Start via `electron.launch()`:
- Die App erfordert einen Aktivierungskontext
- Sie kann nicht direkt als `.exe` mit zusätzlichen Flags gestartet werden

**Lösung:** App wird über `explorer.exe shell:AppsFolder\Claude_pzs8sxrjxfjjc!Claude` gestartet.

### Warum kein Playwright CDP?

Das Durchreichen von `--remote-debugging-port` an AppX-Apps ist nicht zuverlässig möglich. Daher wird auf DOM-Inspektion verzichtet.

### Window-Erkennung aus Node.js

`user32.dll EnumWindows` und `FindWindow` funktionieren **nicht** aus Node.js-Subprozessen (Window Station Isolation). Stattdessen wird `.NET Process.MainWindowTitle` genutzt, das prozessübergreifend funktioniert:

```powershell
Get-Process -Name claude | Where-Object { $_.MainWindowTitle -ne '' }
```

## Konfiguration

`CLAUDE_VERSION` und `CLAUDE_EXE` werden automatisch via `Get-AppxPackage` aus dem installierten Paket ermittelt — kein manuelles Update nach einem Claude Desktop Upgrade nötig.

Einzige Konstante in `tests/helpers/app.ts`:

```typescript
export const CLAUDE_AUMID = 'Claude_pzs8sxrjxfjjc!Claude';
```

Der Publisher-Suffix `pzs8sxrjxfjjc` ist an den Anthropic-Signaturschlüssel gebunden und ändert sich nicht.

## CI / GitHub Actions

Tests laufen automatisch bei jedem Push und Pull Request auf einem GitHub Actions `windows-2022`-Runner.

Nach jedem Run stehen unter dem **Actions**-Tab als Artifacts bereit:
- `playwright-report` — HTML-Testreport
- `test-screenshots` — Baselines und Diff-Bilder (Visual Regression)

Workflow-Datei: `.github/workflows/e2e.yml`

---

## Abhängigkeiten

| Paket | Zweck |
|-------|-------|
| `@playwright/test` | Test-Framework, Assertions, Reporter |
| `@nut-tree-fork/nut-js` | Tastatur/Maus-Automation, Screenshots |
| `pixelmatch` | Pixel-basierter Bildvergleich (Visual Regression) |
| `pngjs` | PNG-Datei lesen/schreiben für Snapshot-Vergleich |
| `UIAutomationClient` (.NET) | Windows Accessibility-Baum via PowerShell (Suite 09) |
