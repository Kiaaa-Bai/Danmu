import type { Danmu } from './store';

/**
 * Comment danmaku have ids `c_<YouTube comment id>_<n>` (see buildSeeds). YouTube ids contain `_` and `-`,
 * so the id is everything between the `c_` prefix and the trailing `_<n>`.
 */
export function commentIdOf(danmuId: string): string | null {
  return /^c_(.+)_\d+$/.exec(danmuId)?.[1] ?? null;
}

/**
 * A comment danmu that is the YouTube copy of a bullet comment someone posted through the extension.
 * Matched by comment id only: the same words from other people always stay.
 */
export function isLinkedComment(d: Danmu, linked: ReadonlySet<string>): boolean {
  if (d.source !== 'comment') return false;
  const id = commentIdOf(d.id);
  return id !== null && linked.has(id);
}
