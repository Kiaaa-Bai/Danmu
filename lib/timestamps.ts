export type SeedDanmu = { t: number; text: string };

export const MAX_SEED_TEXT = 60;

// m:ss or h:mm:ss, not glued to other digits, colons or a decimal point ("16:9", "v1.2:30", "12:345").
const TIMESTAMP = /(?<![\d:.])(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?![\d:])/g;
const EDGE_PUNCTUATION = /^[\s\-–—|:()[\]•·]+|[\s\-–—|:()[\]•·]+$/g;

type Found = { t: number; start: number; end: number };

function findTimestamps(text: string): Found[] {
  const found: Found[] = [];
  for (const m of text.matchAll(TIMESTAMP)) {
    const hours = m[1] === undefined ? 0 : Number(m[1]);
    const minutes = Number(m[2]);
    const seconds = Number(m[3]);
    if (seconds >= 60 || (m[1] !== undefined && minutes >= 60)) continue;
    found.push({ t: hours * 3600 + minutes * 60 + seconds, start: m.index, end: m.index + m[0].length });
  }
  return found;
}

export function parseTimestamps(text: string): number[] {
  return findTimestamps(text).map((f) => f.t);
}

export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d = '0', h = '0', min = '0', s = '0'] = m;
  return Number(d) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(s);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string): string {
  const chars = Array.from(text);
  return chars.length > MAX_SEED_TEXT ? chars.slice(0, MAX_SEED_TEXT - 1).join('') + '…' : text;
}

function removeTimestamps(line: string, found: Found[]): string {
  let out = line;
  for (const f of [...found].reverse()) out = out.slice(0, f.start) + ' ' + out.slice(f.end);
  return collapse(out).replace(EDGE_PUNCTUATION, '');
}

/**
 * One timestamp: the whole comment becomes one danmu at that time.
 * Several (a chapter list): every line with a timestamp becomes a danmu, timestamp removed.
 */
export function commentToDanmu(text: string, durationSec: number): SeedDanmu[] {
  const all = findTimestamps(text);
  if (all.length === 0) return [];
  const [first] = all;
  if (all.length === 1 && first) {
    return first.t <= durationSec ? [{ t: first.t, text: truncate(collapse(text)) }] : [];
  }
  const out: SeedDanmu[] = [];
  for (const line of text.split(/\r?\n/)) {
    const found = findTimestamps(line);
    const t = found[0]?.t;
    if (t === undefined || t > durationSec) continue;
    const rest = removeTimestamps(line, found);
    if (rest) out.push({ t, text: truncate(rest) });
  }
  return out;
}
