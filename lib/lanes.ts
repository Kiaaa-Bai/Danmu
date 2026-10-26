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
