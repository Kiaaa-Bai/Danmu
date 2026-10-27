import { describe, expect, it } from 'vitest';
import { Timeline } from '@/lib/timeline';

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

function make() {
  const tl = new Timeline<{ id: string; t: number }>();
  tl.add([{ id: 'c', t: 3 }, { id: 'a', t: 1 }, { id: 'b', t: 2 }]);
  return tl;
}

describe('Timeline', () => {
  it('emits items as playback passes them', () => {
    const tl = make();
    tl.reset(0);
    expect(tl.tick(0.5)).toEqual([]);
    expect(ids(tl.tick(1.2))).toEqual(['a']);
    expect(ids(tl.tick(2.1))).toEqual(['b']);
  });

  it('a forward jump over 1.5 s is a seek', () => {
    const tl = make();
    tl.reset(0);
    expect(tl.tick(10)).toEqual([]);
    expect(tl.tick(10.2)).toEqual([]);
  });

  it('a backward jump is a seek', () => {
    const tl = make();
    tl.reset(2.5);
    expect(tl.tick(0.9)).toEqual([]);
    expect(ids(tl.tick(1.1))).toEqual(['a']);
  });

  it('after reset, an item exactly at now shows on the next tick', () => {
    const tl = make();
    tl.reset(2);
    expect(ids(tl.tick(2.05))).toEqual(['b']);
  });

  it('add returns only new ids and keeps order', () => {
    const tl = make();
    expect(ids(tl.add([{ id: 'a', t: 1 }, { id: 'd', t: 4 }, { id: 'e', t: 0.5 }]))).toEqual(['d', 'e']);
    expect(tl.size).toBe(5);
    expect(tl.has('e')).toBe(true);
    tl.reset(0);
    expect(ids(tl.tick(0.6))).toEqual(['e']);
  });

  it('tick ignores the jump back after an ad', () => {
    const tl = make();
    tl.reset(60);
    expect(tl.tick(60.1)).toEqual([]);
  });

  it('between returns items with from < t <= to, in order', () => {
    const tl = make();
    expect(ids(tl.between(1, 3))).toEqual(['b', 'c']);
    expect(ids(tl.between(-8, 0.5))).toEqual([]);
  });
});

describe('Timeline.remove', () => {
  it('forgets an item so it is neither counted nor emitted', () => {
    const tl = new Timeline<{ id: string; t: number }>();
    tl.add([{ id: 'a', t: 1 }, { id: 'b', t: 2 }]);
    tl.remove('a');
    expect(tl.size).toBe(1);
    expect(tl.has('a')).toBe(false);
    tl.reset(0);
    expect(ids(tl.tick(1.5))).toEqual([]);
    expect(ids(tl.tick(2.1))).toEqual(['b']);
  });
  it('ignores an id it does not have', () => {
    const tl = new Timeline<{ id: string; t: number }>();
    tl.add([{ id: 'a', t: 1 }]);
    tl.remove('zzz');
    expect(tl.size).toBe(1);
  });
});
