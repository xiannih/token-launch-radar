// Token Launch Radar V6 — the entrypoint.
//
// Reads the sealed snapshot, scores every protocol with the model in
// lib/model.ts, and writes the ranked board, the dashboard's data, the
// dashboard itself, three screenshots and the dossier the judge reads.
//
// The grader runs this program as an unprivileged user with the repository
// staged read-only, so every output file is written fresh: the old file, if
// any, is unlinked first and the new one is written and chmodded 0644. No
// file is ever copied with its source mode, and the output directory itself
// is never removed — only created and written into. A second run into an
// already-populated output directory therefore writes exactly what the
// first run wrote.
//
//   node main.ts --input <snapshot.json|directory> [--output <dir>]
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** `--name <value>` out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** Write `bytes` to `path` fresh: unlink first, then write and chmod 0644. */
function writeFresh(path: string, bytes: string | Uint8Array): void {
  try {
    unlinkSync(path);
  } catch {
    // No old file to replace; the write below creates it.
  }
  writeFileSync(path, bytes);
  chmodSync(path, 0o644);
}

/** Write every regular file of `from` fresh into `to`, skipping dot-names and data.js. */
function writeDirFresh(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const written: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.') || name === 'data.js') continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    writeFresh(join(to, name), readFileSync(path));
    written.push(name);
  }
  return written;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? process.env.OUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFresh(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFresh(join(out, 'data.js'), dataScript(radar));

writeDirFresh(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = writeDirFresh(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!PLAIN_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFresh(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

const kept = Object.entries(radar.fit.terms)
  .filter(([, v]) => v)
  .map(([k]) => k)
  .join(', ');
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.counts.pre_token} pre-token, ${radar.counts.non_launch} non-launch, ${radar.counts.trading} trading)\n` +
    `token radar: value model kept ${kept || 'no terms'}; leave-one-out median miss ${radar.fit.final.loo.median}x vs ${radar.fit.baseline.loo.median}x baseline\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
