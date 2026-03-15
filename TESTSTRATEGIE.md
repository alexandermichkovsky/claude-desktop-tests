# Ideelle Teststrategie: Claude Desktop App

Dieses Dokument beschreibt die **angestrebte Teststrategie** — unabhängig von aktuellen technischen Einschränkungen. Es dient als Orientierung für die Weiterentwicklung der Testabdeckung.

---

## 1. Testpyramide

```
        ▲
       /E2E\          Wenige, stabile Kernszenarien
      /─────\         (heutiger Stand: 39 Tests)
     / Integ-\
    / ration  \       Komponentenübergreifende Abläufe
   /───────────\
  /  Unit Tests \     Viele, schnelle Einzeltests
 /───────────────\    (Logik, Utilities, State-Management)
```

Je weiter unten in der Pyramide, desto:
- **schneller** in der Ausführung
- **stabiler** gegenüber UI-Änderungen
- **präziser** in der Fehlerlokalisierung

---

## 2. Testebenen

### 2.1 Unit Tests (Basis)

**Ziel:** Einzelne Funktionen und Module isoliert prüfen.

Testbare Einheiten in Claude Desktop:
- Konversations-State (Erstellen, Umbenennen, Löschen, Sortierung)
- Nachrichtenformatierung (Markdown-Rendering, Code-Blöcke)
- Einstellungs-Persistenz (Serialisierung/Deserialisierung)
- Shortcut-Handler (korrekte Aktionszuordnung)
- Fehlerbehandlung bei fehlgeschlagenen API-Calls

**Werkzeuge (ideal):** Jest / Vitest direkt auf dem Electron-Main- und Renderer-Prozess

**Vorteil gegenüber aktuellem Stand:** Fehlerlokalisierung auf Funktionsebene, kein App-Start nötig, Ausführung in < 30 Sekunden

---

### 2.2 Integrationstests

**Ziel:** Zusammenspiel mehrerer Komponenten prüfen, ohne die vollständige UI zu starten.

Szenarien:
- IPC-Kommunikation zwischen Main- und Renderer-Prozess
- API-Client: Anfragen/Antworten korrekt verarbeitet (mit Mock-Server)
- Datenpersistenz: Konversationen werden korrekt gespeichert und geladen
- Authentifizierungs-Flow: Token-Verwaltung, Session-Handling
- Update-Mechanismus: Versions-Check, Download-Trigger

**Werkzeuge (ideal):** Playwright Component Testing, Electron-IPC-Mocks, `nock` für HTTP-Mocking

---

### 2.3 E2E Tests (heutiger Stand)

**Ziel:** Kernfunktionen aus Nutzerperspektive ohne Unterbrechung durchspielen.

**Aktuelle Einschränkung:** Kein DOM-Zugriff → Black-Box-Verifikation via Prozess/Fenster/Screenshot.

**Ideal:** Mit CDP-Zugang wären folgende Assertions möglich:

| Heute (Black-Box) | Ideal (mit CDP) |
|-------------------|-----------------|
| App-Prozesse aktiv | Konversations-Element im DOM vorhanden |
| Screenshot existiert | Nachrichtentext im Chat sichtbar (`getByText()`) |
| Fenster hat Titel | Input-Feld ist fokussiert (`isFocused()`) |
| Kein Absturz | Fehlermeldung wird/wird nicht angezeigt |

---

### 2.4 Visual Regression Tests

**Ziel:** Unbeabsichtigte visuelle Änderungen erkennen.

**Heutiger Stand (pragmatisch umgesetzt):** `pixelmatch`-basierter Pixel-Diff gegen gespeicherte Baselines (Suite 07, 4 Snapshots, 1 % Toleranz). Frischer App-Neustart vor jedem Lauf für reproduzierbare Ergebnisse.

Szenarien (aktuell abgedeckt):
- Hauptfenster im Ruhezustand
- Einstellungsdialog
- Suchpalette (Ctrl+K)
- Eingabefeld mit Text

Szenarien (noch nicht abgedeckt, Ideal):
- Light/Dark/System-Theme je einzeln
- Konversationsansicht mit langer Nachrichtenhistorie
- Code-Block-Rendering
- Fehlerzustände (Offline, API-Fehler)

**Werkzeug (ideal):** Playwright `toHaveScreenshot()` mit Baseline-Snapshots pro Theme

**Ausführungsregel:** Baselines nach UI-Änderungen via `npm run update-snapshots` neu anlegen.

---

### 2.5 Performance Tests

**Ziel:** Sicherstellen, dass die App unter Last nicht degradiert.

**Heutiger Stand (pragmatisch umgesetzt):** WorkingSet-basierte Proxy-Metriken (Suite 08, 4 Tests).

Gemessene Realwerte als Referenz:

| Metrik | Gemessen | Limit (Suite 08) | Idealziel |
|--------|----------|------------------|-----------|
| Kaltstart bis Fenster | ~1.700 ms | 15.000 ms | < 5.000 ms |
| WorkingSet gesamt | ~1.550 MB | 2.500 MB | < 800 MB |
| Größter Einzelprozess | ~485 MB | 600 MB | < 300 MB |
| Ctrl+N Reaktion (Median) | ~233 ms | 2.000 ms | < 500 ms |
| Speicherwachstum (10 Konv.) | < 1 % | 50 % | < 10 % |

> Die Limits in Suite 08 sind großzügig (gemessene Realität × ~1,5), um auf verschiedenen Maschinen stabil zu bestehen. Die Idealziele sind technisch erreichbar, erfordern aber IPC-Zugriff für präzisere Heap-Metriken.

**Werkzeug (ideal):** Electron `process.getCPUUsage()`, `process.getProcessMemoryInfo()`, gemessen via IPC

---

### 2.6 Accessibility Tests

**Ziel:** Bedienbarkeit für Nutzer mit eingeschränkter Motorik/Sehvermögen.

Prüfpunkte:
- Vollständige Tastaturbedienbarkeit (kein Maus-Pflichtpfad)
- ARIA-Labels auf interaktiven Elementen
- Farbkontrast ≥ WCAG AA (4.5:1)
- Screen-Reader-Kompatibilität (NVDA/Narrator)
- Zoom bis 200 % ohne Funktionsverlust

**Werkzeug (ideal):** `axe-core` via Playwright (`checkA11y()`), Windows UI Automation API

---

## 3. Teststufen im Entwicklungszyklus

```
Commit    →  Unit Tests          (< 1 min,  automatisch, blockierend)
PR        →  Unit + Integration  (< 5 min,  automatisch, blockierend)
Release   →  Alle Ebenen         (< 30 min, automatisch, blockierend)
Nightly   →  E2E + Performance   (unbegrenzt, Ergebnis als Report)
```

---

## 4. Testdaten-Strategie

| Datentyp | Ansatz |
|----------|--------|
| Konversationen | Synthetische Fixtures (kein echtes Nutzer-Gespräch) |
| API-Antworten | Mock-Server mit vordefinierten Antworten |
| Fehlerfälle | Injizierte Fehler (Netzwerk-Timeout, 429, 500) |
| Auth-Token | Test-Credentials in `.env.test` (nie in Git) |
| Dateianlagen | Kleine synthetische Testdateien (txt, png, pdf) |

---

## 5. Gap-Analyse: Ist vs. Ideal

| Bereich | Ist (heute) | Ideal | Lücke |
|---------|-------------|-------|-------|
| Unit Tests | ✗ Keine | ✓ ~100 Tests | Kein Zugriff auf Quellcode |
| Integrationstests | ✗ Keine | ✓ ~30 Tests | Kein Quellcode-Zugriff |
| E2E Black-Box | ✓ 31 Tests | ✓ 31 Tests + DOM-Assertions | Kein CDP |
| Visual Regression | ✓ 4 Snapshots (pixelmatch) | ✓ ~20 Snapshots + Theme-Varianten | Teilweise umgesetzt |
| Performance | ✓ 4 Proxy-Metriken (WorkingSet) | ✓ Heap/CPU via IPC | Teilweise umgesetzt |
| Accessibility | ✗ Keine | ✓ axe-core | Kein DOM-Zugriff |
| CI/CD | ✓ GitHub Actions `windows-2022` (`.github/workflows/e2e.yml`) | ✓ GitHub Actions (Windows Runner) | — |

---

## 6. Empfehlungen

### Kurzfristig (ohne Quellcode-Zugriff)
1. ✅ **Snapshot-Vergleich** — Umgesetzt in Suite 07 (`pixelmatch`, 1 % Toleranz, `npm run update-snapshots`)
2. ✅ **Performance-Proxy** — Umgesetzt in Suite 08 (Startzeit, WorkingSet, Memory Leak, Reaktionszeit)
3. ✅ **CI auf Windows Hosted Runner** — Umgesetzt in `.github/workflows/e2e.yml` (GitHub Actions `windows-2022`, interaktive Desktop-Session, automatischer Claude-Install via Secret `CLAUDE_INSTALLER_URL`, Playwright-Report + Screenshots als Artifacts)

### Mittelfristig (mit Quellcode-Zugriff / Entwickler-Zusammenarbeit)
4. **CDP aktivieren** — `ELECTRON_EXTRA_LAUNCH_ARGS=--remote-debugging-port=9222` in einem Debug-Build ermöglichen → schaltet DOM-Assertions frei
5. **Unit-Test-Suite aufbauen** — Renderer-Logik mit Vitest + jsdom testen
6. **Mock-API** — lokaler HTTP-Server ersetzt Claude API in Tests → deterministische Antworten, Offline-Tests

### Langfristig
7. **Testpyramide vollständig ausbauen** — Ziel: 70 % Unit, 20 % Integration, 10 % E2E
8. **Accessibility-Audit** — einmalig manuell mit NVDA, danach axe-core automatisiert
