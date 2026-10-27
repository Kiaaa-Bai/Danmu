/** Playback jumps bigger than this (or any jump backwards) count as a seek. */
export const SEEK_JUMP = 1.5;

/** After a reset, items this far behind `now` still show, so one sitting exactly at `now` isn't skipped. */
export const RESET_LOOKBACK = 0.25;

/** Items sorted by time, and a cursor that hands out the ones playback has just passed. */
export class Timeline<T extends { id: string; t: number }> {
  private items: T[] = [];
  private ids = new Set<string>();
  private prev = 0;

  get size(): number {
    return this.items.length;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  add(items: T[]): T[] {
    const fresh = items.filter((x) => !this.ids.has(x.id));
    for (const x of fresh) {
      this.ids.add(x.id);
      this.items.splice(this.firstAfter(x.t), 0, x);
    }
    return fresh;
  }

  reset(now: number): void {
    this.prev = now - RESET_LOOKBACK;
  }

  tick(now: number): T[] {
    if (now < this.prev || now - this.prev > SEEK_JUMP) {
      this.prev = now;
      return [];
    }
    const out = this.items.slice(this.firstAfter(this.prev), this.firstAfter(now));
    this.prev = now;
    return out;
  }

  /** Items with from < t <= to, in time order. */
  between(from: number, to: number): T[] {
    return this.items.slice(this.firstAfter(from), this.firstAfter(to));
  }

  /** Index of the first item with t > time. */
  private firstAfter(time: number): number {
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.items[mid]!.t <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
