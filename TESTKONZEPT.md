# Testkonzept: Claude Desktop App

## 1. Testziel

Sicherstellung, dass die Claude Desktop App nach Installations- und Versions-Updates weiterhin korrekt startet, alle wesentlichen UI-Funktionen erreichbar sind, die App stabil läuft und sich visuell nicht unbeabsichtigt verändert. Der Fokus liegt auf **Regressionsschutz** — die KI-Antworten selbst sind nicht Gegenstand der Tests.

---

## 2. Testgegenstand

| Eigenschaft | Wert |
|-------------|------|
| Applikation | Claude Desktop |
| Plattform | Windows 10/11 (x64) |
| Installationstyp | Windows Store Package (AppX/MSIX) |
| App-Technologie | Electron |
| Version | Dynamisch ermittelt via `Get-AppxPackage` |

---

## 3. Teststrategie

### 3.1 Testebene: Black-Box E2E

Da Claude Desktop als Windows Store AppX installiert ist, gibt es **keinen direkten Zugriff auf den Electron-Renderer** (kein CDP, kein `electron.launch()`). Alle Tests sind Black-Box-Tests auf Betriebssystem-Ebene:

- **Eingabe:** Tastatur/Maus via `@nut-tree-fork/nut-js`
- **Beobachtung:** Prozessanzahl, Fensterstatus, Fenstergröße/-position, Pixel-Diff, Performance-Metriken
- **Keine DOM-Assertions** — kein Playwright-Locator, kein `page.getByText()`

### 3.2 Testart: Regressionstests

Jeder Test prüft eine definierte Kernfunktion. Bei einem neuen Claude-Release werden alle 53 Tests ausgeführt. Schlägt ein Test fehl, ist eine Regression in diesem Bereich wahrscheinlich.

### 3.3 Nicht abgedeckt

| Bereich | Begründung |
|---------|-----------|
| KI-Antwortqualität | Nicht deterministisch, nicht testbar |
| Netzwerk / API-Fehler | Kein Zugriff auf Netzwerkschicht |
| Login / Authentifizierung | Setzt persistente Session voraus |
| Dark/Light-Theme (Pixel-exakt) | Visual Regression prüft Abweichungen, nicht Theme-Korrektheit |
| Drag & Drop von Dateien | nut-js unterstützt kein natives DnD für Datei-Explorer |
| Multi-Monitor-Szenarien | Testumgebung ist Single-Monitor |

---

## 4. Testumgebung

```
Betriebssystem : Windows 10/11 (x64)  |  GitHub Actions: windows-2022
Node.js        : ≥ 18
Claude Desktop : Installiert via Microsoft Store  |  CI: automatisch via Installer
Ausführung     : Interaktive Desktop-Session  |  CI: .github/workflows/e2e.yml
Parallelität   : Sequenziell (workers: 1) — nur eine App-Instanz möglich
```

> **Wichtig:** Tests erfordern eine aktive Windows-Desktopsitzung. Windows Services oder SSH ohne GUI funktionieren nicht. GitHub Actions `windows-2022`-Runner stellen eine interaktive Session bereit und sind daher CI-kompatibel.

---

## 5. Testwerkzeuge

| Werkzeug | Zweck |
|----------|-------|
| `@playwright/test` | Test-Framework, Assertions, Reporting |
| `@nut-tree-fork/nut-js` | Tastatur- und Mausautomatisierung, Screenshots |
| `pixelmatch` + `pngjs` | Pixel-basierter Screenshot-Vergleich (Visual Regression) |
| PowerShell + Win32 P/Invoke | Fenstererkennung, Größe/Position, Fokus, Minimieren/Maximieren |
| `UIAutomationClient` (.NET) | Windows Accessibility-Baum (UIA) — Ersatz für axe-core ohne DOM-Zugriff |
| `Get-AppxPackage` | Dynamische Ermittlung von Version und Exe-Pfad |

---

## 6. Testfälle

### Suite 1 — Startup & Initialisierung (`01-startup.spec.ts`)

*Vorbedingung: Claude Desktop wird frisch gestartet (vorheriger Prozess wird beendet).*

| ID | Testfall | Prüfkriterium |
|----|----------|---------------|
| 1.1 | App startet ohne Absturz | ≥ 1 Claude-Prozess aktiv |
| 1.2 | Hauptfenster erscheint | Fenstertitel enthält „Claude" |
| 1.3 | Mindestfenstergröße | Breite ≥ 800 px, Höhe ≥ 600 px |
| 1.4 | Vollständiger Start | ≥ 5 Prozesse aktiv (Main + GPU + Renderer + Network + Crashpad) |
| 1.5 | Korrekte Version | `getExeVersion(CLAUDE_EXE)` enthält `CLAUDE_VERSION` |

### Suite 2 — Konversationsmanagement (`02-conversation.spec.ts`)

*Vorbedingung: App läuft, Fenster im Vordergrund.*

| ID | Testfall | Prüfkriterium |
|----|----------|---------------|
| 2.1 | Neue Konversation via Ctrl+N | App stabil, Screenshots existieren |
| 2.2 | Nachricht senden via Enter | App stabil nach Senden |
| 2.3 | Shift+Enter = Zeilenumbruch | Kein ungewolltes Senden, App stabil |
| 2.4 | Escape leert/verlässt Input | App stabil, Screenshots vorher/nachher |
| 2.5 | Sidebar zeigt Konversationsliste | Fenstertitel vorhanden |
| 2.6 | 3× Ctrl+N in Folge | App stabil, Fenster vorhanden |

### Suite 3 — UI-Navigation (`03-ui-navigation.spec.ts`)

| ID | Testfall | Prüfkriterium |
|----|----------|---------------|
| 3.1 | Sidebar-Toggle (Ctrl+Shift+S) | App stabil, Screenshots existieren |
| 3.2 | Suche via Ctrl+K | App stabil, Escape schließt |
| 3.3 | Tab-Navigation | App stabil nach 3× Tab |
| 3.4 | Mehrere Shortcuts hintereinander | Fenstertitel enthält „Claude" |

### Suite 4 — Eingabe-Features (`04-input-features.spec.ts`)

*Vorbedingung: Frische Konversation vor jedem Test.*

| ID | Testfall | Prüfkriterium |
|----|----------|---------------|
| 4.1 | Shift+Enter fügt Zeilenumbruch ein | App stabil |
| 4.2 | Ctrl+A + Delete leert Eingabe | Screenshots vorher/nachher |
| 4.3 | Copy/Paste via Ctrl+C/V | Clipboard enthält eingefügten Text |
| 4.4 | Ctrl+Z Undo | App stabil, Screenshots |
| 4.5 | 200 Zeichen tippen | Kein Absturz |
| 4.6 | Ctrl+Enter senden | App stabil nach Senden |

### Suite 5 — Einstellungen (`05-settings.spec.ts`)

| ID | Testfall | Prüfkriterium |
|----|----------|---------------|
| 5.1 | Settings via Ctrl+, öffnen | App stabil, Screenshots |
| 5.2 | Escape schließt Dialog | Fenstertitel enthält „Claude" |
| 5.3 | 3× Öffnen/Schließen-Zyklus | App stabil |
| 5.4 | F1 Hilfe/About | App stabil, kein Absturz |

### Suite 6 — Fensterverwaltung (`06-window-management.spec.ts`)

| ID | Testfall | Prüfkriterium |
|----|----------|---------------|
| 6.1 | Minimieren + Wiederherstellen | Prozesse aktiv, Fensterrect vorhanden |
| 6.2 | Maximieren + Wiederherstellen | Maximierte Breite ≥ Normalbreite |
| 6.3 | Win+Down + Wiederherstellen | App stabil |
| 6.4 | 3× Maximieren/Restore-Zyklus | Prozessanzahl nicht gesunken |
| 6.5 | Fensterposition auf Bildschirm | x > −200, y > −200, Breite ≥ 400 px |
| 6.6 | Alt+Tab + Fokus zurück | Fenstertitel vorhanden, Prozesse aktiv |

### Suite 7 — Visual Regression (`07-visual-regression.spec.ts`)

*Vorbedingung: Frischer App-Neustart (zustandsunabhängig). Erster Lauf legt Baselines an.*

| ID | Testfall | Prüfkriterium |
|----|----------|---------------|
| 7.1 | Hauptfenster (Ruhezustand) | Pixel-Diff ≤ 1 % |
| 7.2 | Einstellungsdialog geöffnet | Pixel-Diff ≤ 1 % |
| 7.3 | Suchpalette (Ctrl+K) | Pixel-Diff ≤ 1 % |
| 7.4 | Eingabefeld mit Text | Pixel-Diff ≤ 1 % |

### Suite 9 — Accessibility (`09-accessibility.spec.ts`)

*Vorbedingung: App läuft, Fenster im Vordergrund.*

| ID | Testfall | Prüfkriterium |
|----|----------|---------------|
| 9.1 | Hauptfenster via UIA erreichbar | `found = true`, `elementCount > 0` |
| 9.2 | Keyboard-fokussierbare Elemente | ≥ 3 fokussierbare Elemente im Fenster |
| 9.3 | Keine namenlosen Buttons | `unnamedButtons.length = 0` |
| 9.4 | Tab-Navigation ohne Falle | App nach 10× Tab stabil, Fenstertitel vorhanden |
| 9.5 | Tab verschiebt Fokus | `getFocusedElement()` ≠ null, ControlType vorhanden |
| 9.6 | Fokus-Indikator visuell sichtbar | Pixel-Diff vor/nach Tab > 0 |
| 9.7 | Kernfunktionen per Shortcut erreichbar | Ctrl+N, Ctrl+K, Ctrl+, ohne Maus |

### Suite 10 — Inkognito-Modus (`10-incognito.spec.ts`)

*Vorbedingung: App läuft, Inkognito zu Beginn deaktiviert.*

> **Technische Besonderheit:** Claude Desktop ändert den Windows-HWND-Titel (`Process.MainWindowTitle`) im Inkognito-Modus **nicht** — er bleibt immer „Claude". Inkognito-Erkennung erfolgt daher per **Pixel-Brightness-Check** der Titelleiste (R+G+B: Normal ≈ 700, Inkognito ≈ 42; Schwelle < 300). Aktivierung via UIA-Koordinatenklick auf den Ghost-Button (unbenannter Button im UIA-Baum). Im Inkognito-Modus verschwindet der Ghost-Button aus dem UIA-Baum — Deaktivierung daher via Kill+Neustart.

| ID | Testfall | Prüfkriterium |
|----|----------|---------------|
| 10.1 | Inkognito via Ghost-Button aktivierbar | `isIncognitoActive()` = true (Brightness-Check) |
| 10.2 | Visueller Indikator (dunkle Titelleiste) | Brightness normal ≥ 300, Inkognito < 300, Δ > 200 |
| 10.3 | Toggle: Kill+Restart deaktiviert Inkognito | `isIncognitoActive()` = false nach Restart |
| 10.4 | Inkognito vollständig deaktivierbar | Normalmodus nach Kill+Restart wiederhergestellt |
| 10.5 | Ctrl+N im Inkognito-Modus möglich | Inkognito bleibt aktiv, App stabil |
| 10.6 | Einstellungen im Inkognito-Modus erreichbar | Ctrl+, öffnet Dialog, App stabil |
| 10.7 | App bleibt nach 3× Inkognito-Zyklus stabil | Fenstertitel enthält „Claude", kein Absturz |

### Suite 8 — Performance-Proxy (`08-performance.spec.ts`)

| ID | Testfall | Prüfkriterium |
|----|----------|---------------|
| 8.1 | Kaltstart bis Fenster sichtbar | ≤ 15.000 ms (gemessen: ~1.700 ms) |
| 8.2 | Speicher im Ruhezustand | Gesamt ≤ 2.500 MB, Einzelprozess ≤ 600 MB |
| 8.3 | Kein Memory Leak (10 Konversationen) | Wachstum < 50 % |
| 8.4 | Ctrl+N Reaktionszeit (Median aus 5) | ≤ 2.000 ms (gemessen: ~233 ms) |

---

## 7. Abnahmekriterien

| Kriterium | Schwellwert |
|-----------|-------------|
| Bestandene Tests | 53 / 53 (100 %) |
| Erlaubte Fehlschläge | 0 (bei `retries: 1` zählt erst der 2. Fehlschlag) |
| Maximale Gesamtlaufzeit | < 15 Minuten |

---

## 8. Bekannte Einschränkungen

- **Verifikationstiefe:** Ohne DOM-Zugriff kann nicht geprüft werden, ob z. B. ein Ctrl+N-Aufruf tatsächlich eine *neue* Konversation angelegt hat — nur dass die App danach stabil läuft.
- **Visual Regression Stabilität:** Baselines müssen nach größeren UI-Änderungen oder nach `npm run update-snapshots` neu angelegt werden. 1 % Toleranz puffert Anti-Aliasing, aber keine Layout-Änderungen.
- **Performance-Proxy:** WorkingSet ist ein OS-Level-Proxy für Speicher (inkl. Shared Memory). Echte Heap-Metriken erfordern IPC-Zugriff auf den Electron-Prozess.
- **Timing:** Manche Tests nutzen feste `sleep()`-Pausen. Auf sehr langsamen Maschinen kann `timeout: 60_000` in `playwright.config.ts` erhöht werden.
- **Single Instance:** Claude Desktop erlaubt nur eine Instanz. Parallele Testausführung (`workers > 1`) ist daher nicht möglich.
