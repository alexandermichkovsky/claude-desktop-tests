import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import { takeScreenshot } from './app';

const BASELINE_DIR = path.join(process.cwd(), 'test-screenshots', 'baseline');
const DIFF_DIR     = path.join(process.cwd(), 'test-screenshots', 'diff');

export interface SnapshotResult {
  diffPercent: number;
  diffPixels: number;
  totalPixels: number;
  isNewBaseline: boolean;
  baselinePath: string;
  currentPath: string;
  diffPath: string | null;
}

/**
 * Nimmt einen Screenshot und vergleicht ihn mit dem gespeicherten Baseline.
 * Beim ersten Aufruf wird der Screenshot als Baseline gespeichert (isNewBaseline = true).
 *
 * @param name          Name des Snapshots (ohne Extension)
 * @param tolerancePercent  Erlaubte Abweichung in Prozent der Pixel (Standard: 0.5 %)
 */
export async function compareToBaseline(
  name: string,
  tolerancePercent = 0.5
): Promise<SnapshotResult> {
  for (const dir of [BASELINE_DIR, DIFF_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const currentPath  = await takeScreenshot(name);
  const baselinePath = path.join(BASELINE_DIR, `${name}.png`);
  const diffPath     = path.join(DIFF_DIR, `${name}-diff.png`);

  // Erster Lauf: Baseline anlegen
  if (!fs.existsSync(baselinePath)) {
    fs.copyFileSync(currentPath, baselinePath);
    return {
      diffPercent: 0,
      diffPixels: 0,
      totalPixels: 0,
      isNewBaseline: true,
      baselinePath,
      currentPath,
      diffPath: null,
    };
  }

  const current  = PNG.sync.read(fs.readFileSync(currentPath));
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));

  // Dimensionen unterschiedlich → Baseline automatisch aktualisieren (z.B. nach Fenstergrößen-Änderung)
  if (current.width !== baseline.width || current.height !== baseline.height) {
    fs.copyFileSync(currentPath, baselinePath);
    return {
      diffPercent: -1,
      diffPixels: -1,
      totalPixels: current.width * current.height,
      isNewBaseline: true,
      baselinePath,
      currentPath,
      diffPath: null,
    };
  }

  // pixelmatch ist ESM-only → dynamic import
  const { default: pixelmatch } = await import('pixelmatch');

  const diff = new PNG({ width: current.width, height: current.height });
  const diffPixels = pixelmatch(
    current.data,
    baseline.data,
    diff.data,
    current.width,
    current.height,
    { threshold: 0.1 }   // per-pixel Schwellwert (0 = exakt, 1 = alles erlaubt)
  );

  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  const totalPixels  = current.width * current.height;
  const diffPercent  = (diffPixels / totalPixels) * 100;

  return { diffPercent, diffPixels, totalPixels, isNewBaseline: false, baselinePath, currentPath, diffPath };
}

/**
 * Löscht die gespeicherte Baseline für einen Snapshot (erzwingt Neuanlage beim nächsten Lauf).
 */
export function resetBaseline(name: string): void {
  const p = path.join(BASELINE_DIR, `${name}.png`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
