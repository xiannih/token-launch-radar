// Token Launch Radar — the entrypoint.
//
// Reads the sealed DefiLlama snapshot, ranks its pre-token protocols by
// implied launch value with the model in lib/model.ts, and writes the board,
// the dashboard's data, the dashboard and its screenshots, and the dossier
// the judge reads. Node 22, standard library only, no network, no installs.
// Deterministic: the same snapshot always writes the same bytes.
//
// The write order is the starter's: board.json, then data.js, then the
// dashboard and the screenshots copied file by file, then dossier.json last,
// so the dossier is built from exactly what the run just wrote. data.js is
// written twice, once beside the page in /output (the starter's place) and
// once inside /output/dashboard (the page's place), the same bytes both
// times, so the dossier's text still carries the rows the page renders.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The text cap the scorer rebuilds the dossier with; the only cap that shapes its bytes. */
const TEXT_MAX_BYTES = 65_536;

/** A screenshot name: letters, digits and . _ -, 1 to 128 characters. */
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** `--name <value>` out of the arguments, `--name=value` included, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

// The snapshot: --input wins; otherwise the grader's input dir, then /input.
// A --input ending in .json names the file itself, a directory holds snapshot.json.
const inputArg = arg('input', process.env.MAKEFUN_INPUT_DIR ?? '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar, meta } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

/**
 * Write a file fresh: remove any file a previous run left behind first.
 * A copied file keeps its source mode, and the grader stages /bot read-only
 * (0444), so a file this program copied on an earlier run into the same
 * /output is read-only — overwriting it in place would refuse the write.
 * Removing it first needs only the directory to be writable, which /output
 * is, so a second run into the same output works too.
 */
function writeFresh(path: string, data: string | Uint8Array): void {
  if (existsSync(path)) unlinkSync(path);
  writeFileSync(path, data);
}

mkdirSync(out, { recursive: true });
writeFresh(
  join(out, 'board.json'),
  `${JSON.stringify({ snapshot_as_of: snapshot.as_of, floor_usd: snapshot.floor_usd, watchlist_count: snapshot.watchlist.length, model: meta, rows: board }, null, 2)}\n`,
);
const script = dataScript(radar);
writeFresh(join(out, 'data.js'), script);

/**
 * Copy one directory's regular files into `to`, skipping names that start
 * with a dot and any names in `skip`. A copied file keeps its source mode,
 * and the grader stages /bot read-only (0444), so a copied file the program
 * then overwrites would refuse the write as uid 65534: names in `skip` are
 * never copied, they are written fresh instead.
 */
function copyFiles(from: string, to: string, skip: Set<string> = new Set()): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.') || skip.has(name)) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    const dest = join(to, name);
    // Remove a file an earlier run left behind first, then leave the copy
    // writable: a copy keeps its source mode, so a copy from a read-only
    // /bot is 0444, and overwriting it in place on a second run into the
    // same /output would refuse the write.
    if (existsSync(dest)) unlinkSync(dest);
    copyFileSync(path, dest);
    chmodSync(dest, 0o644);
    copied.push(name);
  }
  return copied;
}

// The page loads data.js beside itself, so it goes inside the dashboard too,
// the same bytes as the copy at /output/data.js above. It is skipped in the
// copy and written fresh: the committed copy is read-only in the grader,
// and overwriting the copied file would fail.
copyFiles(join(here, 'dashboard'), join(out, 'dashboard'), new Set(['data.js']));
writeFresh(join(out, 'dashboard', 'data.js'), script);
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last, from exactly this /output, with the scorer's
// own call: text_max_bytes alone, no other caps.
writeFresh(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES }));

const top = board[0]!;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (4 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}; top ${top.name} $${top.implied_value_usd.toLocaleString('en-US')}\n`,
);
