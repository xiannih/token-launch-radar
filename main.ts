// Token launch radar — entry point.
// Reads the sealed snapshot, builds the ranked board, and writes everything
// the grader and the judge need: board.json, the dashboard's data.js, the
// dashboard and screenshots, and dossier.json.
//
// Paths come from the environment, never from the working directory:
//   input   MAKEFUN_INPUT_DIR, else /input
//   output  MAKEFUN_OUTPUT_DIR, else OUT_DIR, else /output
//   sources resolved from this file's own location, never from cwd.
// The output directory is created, never removed.
//
// Write discipline (the grader stages the repo read-only, files 0444):
//   - generated files (board.json, data.js, dossier.json) are written fresh:
//     unlinked first when present, then written, so no run ever overwrites
//     a read-only copy in place.
//   - copied files (dashboard, screenshots) are chmodded 0644 after the
//     copy, so a second run into a populated output directory can replace
//     them instead of failing on a read-only destination.
// The program is deterministic: two runs write identical bytes.

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

function inputDir(): string {
  return process.env.MAKEFUN_INPUT_DIR ?? '/input';
}

function outputDir(): string {
  return process.env.MAKEFUN_OUTPUT_DIR ?? process.env.OUT_DIR ?? '/output';
}

function writeFresh(path: string, data: string | Uint8Array): void {
  if (existsSync(path)) rmSync(path, { force: true });
  writeFileSync(path, data);
}

function copyWritable(src: string, dest: string): void {
  copyFileSync(src, dest);
  chmodSync(dest, 0o644);
}

function main(): void {
  const inDir = inputDir();
  const outDir = outputDir();
  const snapPath = join(inDir, 'snapshot.json');
  const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
  const built = buildBoard(snap);

  mkdirSync(outDir, { recursive: true });

  // The ranked board.
  writeFresh(join(outDir, 'board.json'), JSON.stringify({ rows: built.rows, meta: built.meta }));

  // The dashboard's data, written fresh beside the page (never copied).
  const dataJs = 'window.BOARD_DATA = ' + JSON.stringify({ rows: built.rows, meta: built.meta, comps: built.comps }) + ';\n';
  writeFresh(join(outDir, 'data.js'), dataJs);

  // The dashboard: an explicit allowlist, so nothing unexpected is copied.
  const dashOut = join(outDir, 'dashboard');
  mkdirSync(dashOut, { recursive: true });
  for (const name of ['index.html', 'app.css', 'app.js', 'METHOD.md']) {
    copyWritable(join(HERE, 'dashboard', name), join(dashOut, name));
  }

  // The screenshots.
  const shotsOut = join(outDir, 'screenshots');
  mkdirSync(shotsOut, { recursive: true });
  for (const name of readdirSync(join(HERE, 'screenshots'))) {
    if (name.startsWith('.')) continue;
    copyWritable(join(HERE, 'screenshots', name), join(shotsOut, name));
  }

  // The dossier: byte for byte what the library writes from this output.
  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFresh(join(outDir, 'dossier.json'), dossier);

  const top = built.rows[0];
  const failed = built.meta.selfChecks.filter((c) => !c.pass);
  console.log(
    `[radar] ${built.rows.length} rows, top #1 ${top.name} $${top.implied_value_usd.toLocaleString('en-US')}, ` +
      `watchlist ${built.meta.counts.watchlist}/${built.meta.counts.watchlist}, ` +
      `curator-discounted ${built.meta.counts.curatorDiscounted}, ` +
      `self-checks ${built.meta.selfChecks.length - failed.length}/${built.meta.selfChecks.length} pass`,
  );
  if (failed.length > 0) {
    for (const c of failed) console.error(`[radar] FAILED self-check: ${c.name} — ${c.detail}`);
    process.exitCode = 1;
  }
}

main();
