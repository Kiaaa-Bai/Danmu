import { describe, expect, it } from 'vitest';
import { pickLane, type LaneItem } from '@/lib/lanes';

const W = 1000;
const D = 8;
const GAP = 20;
const justStarted: LaneItem = { start: 0, width: 100, speed: (W + 100) / D };

describe('pickLane', () => {
  it('takes the first empty lane', () => expect(pickLane([undefined, undefined], 0, W, 100, D, GAP)).toBe(0));
  it('skips a lane whose last item has not fully entered', () =>
    expect(pickLane([justStarted, undefined], 0.1, W, 100, D, GAP)).toBe(1));
  it('returns -1 when every lane is busy', () =>
    expect(pickLane([justStarted, justStarted], 0.1, W, 100, D, GAP)).toBe(-1));
  it('reuses a lane once the last item is in and cannot be caught', () =>
    expect(pickLane([justStarted], 2, W, 100, D, GAP)).toBe(0));
  it('does not reuse a lane if a longer, faster item would catch up', () =>
    expect(pickLane([justStarted], 2, W, 900, D, GAP)).toBe(-1));
});
