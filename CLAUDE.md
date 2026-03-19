# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all tests (53 tests)
npm test

# Run a single test file
npx playwright test tests/01-startup.spec.ts

# Run a single test by name
npx playwright test --grep "1.3 Fenstergröße"

# Visual regression only
npm run test:visual

# Performance only
npm run test:performance

# Reset visual regression baselines (forces regeneration on next run)
npm run update-snapshots

# Open HTML report (after running tests)
npm run report
```

## Architecture

This project tests **Claude Desktop** (an Electron app installed as a Windows Store AppX package) using Playwright for test structure/assertions and `@nut-tree-fork/nut-js` for keyboard/mouse automation.

### Core constraint: no DOM access

Claude Desktop cannot be launched via `electron.launch()` (AppX packaging prevents it) and CDP remote debugging is not reliably injectable. All tests are **black-box**: they automate keyboard/mouse input and verify app stability via process count, window title, window rect, screenshots, and pixel-diffs.

### `tests/helpers/app.ts`

The central helper. Key design decisions:

- **App launch**: Uses `explorer.exe shell:AppsFolder\Claude_pzs8sxrjxfjjc!Claude` — the only reliable way to activate an AppX app.
- **Window detection**: Uses `.NET Process.MainWindowTitle` via PowerShell temp scripts — NOT `user32.dll EnumWindows`/`FindWindow`. User32 APIs return nothing from Node.js subprocesses due to Window Station isolation; .NET's `Process` class works cross-boundary.
- **Win32 API calls** (GetWindowRect, SetForegroundWindow, ShowWindow): Must be written to a `.ps1` temp file with `Add-Type` C# blocks and executed via `powershell -File`. Inline `-Command` with multiline here-strings fails.
- **Single instance**: Claude Desktop enforces single-instance. Call `killClaudeDesktop()` before relaunching in fresh-start tests.
- **WorkingSet mapping**: `getClaudeDesktopProcesses()` maps PowerShell's PascalCase JSON keys (`Id`, `WorkingSet`) to camelCase (`id`, `workingSet`) explicitly.

### `tests/helpers/visual.ts`

Snapshot comparison helper using `pixelmatch` + `pngjs`:
- First run: saves screenshot as baseline in `test-screenshots/baseline/`
- Subsequent runs: pixel-diff against baseline, saves diff image to `test-screenshots/diff/`
- `pixelmatch` is ESM-only (v7) → loaded via dynamic `import()`
- `npm run update-snapshots` deletes the baseline directory to force regeneration

### `tests/helpers/performance.ts`

Proxy metrics (no IPC/CDP access, so process-level approximations only):
- `measureStartupTime()`: kill → relaunch → time to window visible
- `measureMemory()`: sum of WorkingSet across all Claude processes
- `measureCtrlNResponse()`: keypress-to-screenshot roundtrip as UI responsiveness proxy

### Test execution

Tests run **sequentially** (`workers: 1`) — mandatory because there is only one Desktop app window and it has global state. Each suite's `beforeAll` calls `showClaudeDesktop()` to bring the window to the foreground. Suites that require a clean state do a kill+relaunch in `beforeAll`:
- `01-startup.spec.ts`: always kills and relaunches
- `07-visual-regression.spec.ts`: always kills and relaunches (state-independent snapshots)
- `08-performance.spec.ts` (8.1): kills and relaunches for cold-start measurement

### Version/path constants

`CLAUDE_VERSION` and `CLAUDE_EXE` are resolved dynamically at runtime via `Get-AppxPackage` in `helpers/app.ts` — no manual update needed after a Claude Desktop upgrade. Only `CLAUDE_AUMID` is a hard-coded constant (the publisher suffix `pzs8sxrjxfjjc` does not change between versions).
