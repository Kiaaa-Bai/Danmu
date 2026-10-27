import type { Mode } from './settings';

/** The last danmu sent into a lane. Times are media seconds; speed is px per media second. */
export type LaneItem = { start: number; width: number; speed: number };

/**
 * First lane where a new item fits: the lane's last item has moved fully in (plus a gap),
 * and the new item, which is faster if it is longer, won't catch it before it leaves.
 * Returns -1 when no lane fits.
 */
export function pickLane(
  last: (LaneItem | undefined)[],
  now: number,
  playerWidth: number,
  width: number,
  duration: number,
  gap: number,
): number {
  const speed = (playerWidth + width) / duration;
  for (let i = 0; i < last.length; i++) {
    const prev = last[i];
    if (!prev) return i;
    const entered = prev.speed * (now - prev.start) >= prev.width + gap;
    const prevGoneAt = prev.start + duration;
    const reachesLeftAt = now + playerWidth / speed;
    if (entered && reachesLeftAt >= prevGoneAt) return i;
  }
  return -1;
}

/** Fixed (top/bottom) lanes hold one danmu until a media time. First lane free by `now`, or -1. */
export function pickFixedLane(busyUntil: number[], now: number): number {
  return busyUntil.findIndex((until) => until <= now);
}

/** How many lanes of `laneHeight` fit in `area` (0.25 … 1) of the player. At least one. */
export function laneCount(playerHeight: number, area: number, laneHeight: number): number {
  return Math.max(1, Math.floor((playerHeight * area) / laneHeight));
}

/** A top/bottom danmu wider than the player would be cut off at both ends, so it scrolls instead. */
export function fittedMode(mode: Mode, width: number, playerWidth: number): Mode {
  return mode !== 'scroll' && width > playerWidth ? 'scroll' : mode;
}
