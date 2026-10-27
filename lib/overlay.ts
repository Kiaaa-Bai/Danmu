import { laneCount, pickFixedLane, pickLane, type LaneItem } from './lanes';
import { DEFAULT_DISPLAY, DENSITY_LIMITS, SPEED_DURATIONS, type DisplaySettings, type Mode } from './settings';

/** Media seconds a top/bottom danmu stays up. */
export const FIXED_DURATION = 4;
const GAP = 24;
const LINE_HEIGHT = 1.4;
/** Bottom danmu sit this share of the player above its bottom edge, clear of YouTube's controls. */
const BOTTOM_OFFSET = 0.12;

export type ShowItem = { text: string; color?: string; mode?: Mode };

type Flying = { el: HTMLElement; anim: Animation };

function resizeFixed(lanes: number[], n: number): void {
  while (lanes.length < n) lanes.push(0);
  lanes.length = n;
}

/** The layer over the video where danmaku fly. */
export class Overlay {
  private layer: HTMLDivElement;
  private resizeObserver: ResizeObserver;
  private flying = new Set<Flying>();
  private scrollLanes: (LaneItem | undefined)[] = [];
  private topLanes: number[] = [];
  private bottomLanes: number[] = [];
  private width = 0;
  private height = 0;
  private fontSize = 18;
  private paused = false;
  private visible = true;
  private settings: DisplaySettings = DEFAULT_DISPLAY;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private player: HTMLElement,
    private onRelayout: () => void = () => {},
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'dm-layer';
    const videoContainer = player.querySelector('.html5-video-container');
    if (videoContainer) videoContainer.after(this.layer);
    else player.prepend(this.layer);
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(player);
    this.measure();
  }

  /** Media seconds a scrolling danmu takes to cross the player at 1×. */
  get duration(): number {
    return SPEED_DURATIONS[this.settings.speed - 1] ?? 8;
  }

  /** New viewer settings: re-measure, and let the session re-lay what is flying. */
  applySettings(settings: DisplaySettings): void {
    const old = this.settings;
    this.settings = settings;
    this.layer.style.opacity = String(settings.opacity);
    // Opacity and density don't move anything; re-laying on every slider tick made danmaku jump.
    const moved = old.area !== settings.area || old.fontScale !== settings.fontScale || old.speed !== settings.speed;
    this.measure(moved);
  }

  private measure(relayout = false): void {
    const oldWidth = this.width;
    this.width = this.player.clientWidth;
    this.height = this.player.clientHeight;
    const base = Math.min(36, Math.max(18, this.height * 0.04));
    this.fontSize = Math.round(base * this.settings.fontScale);
    const laneHeight = this.fontSize * LINE_HEIGHT;
    this.scrollLanes.length = laneCount(this.height, this.settings.area, laneHeight);
    resizeFixed(this.topLanes, laneCount(this.height, 0.4, laneHeight));
    resizeFixed(this.bottomLanes, laneCount(this.height, 0.4, laneHeight));
    this.layer.style.setProperty('--dm-font-size', `${this.fontSize}px`);
    // Flying danmaku were laid out for the old size or settings (fullscreen, theater, panel).
    if (relayout || (oldWidth > 0 && oldWidth !== this.width)) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(this.onRelayout, relayout ? 0 : 150);
    }
  }

  /**
   * Shows one danmu that entered at media time `start`. `age` > 0 starts it part-way (after a seek).
   * Returns false when it was dropped: hidden, too old, the density limit, or no free lane.
   */
  show(item: ShowItem, start: number, rate: number, own = false, age = 0): boolean {
    const mode = item.mode ?? 'scroll';
    const duration = mode === 'scroll' ? this.duration : FIXED_DURATION;
    const { density } = this.settings;
    if (!this.visible || this.width === 0 || age >= duration) return false;
    if (!own && this.flying.size >= DENSITY_LIMITS[density]) return false;

    const el = document.createElement('span');
    el.className = own ? 'dm-item dm-own' : 'dm-item';
    el.textContent = item.text;
    el.style.color = item.color ?? '#FFFFFF';
    el.style.transform = `translateX(${this.width}px)`;
    this.layer.append(el);
    const w = el.offsetWidth;
    const laneHeight = this.fontSize * LINE_HEIGHT;
    // More density, or your own danmu: when every lane is busy, overlap instead of dropping.
    const overlap = density === 'high' || own;

    let keyframes: Keyframe[];
    if (mode === 'scroll') {
      let lane = pickLane(this.scrollLanes, start, this.width, w, duration, GAP);
      if (lane === -1 && overlap) lane = Math.floor(Math.random() * this.scrollLanes.length);
      if (lane === -1) {
        el.remove();
        return false;
      }
      this.scrollLanes[lane] = { start, width: w, speed: (this.width + w) / duration };
      el.style.top = `${lane * laneHeight}px`;
      keyframes = [{ transform: `translateX(${this.width}px)` }, { transform: `translateX(${-w}px)` }];
    } else {
      const lanes = mode === 'top' ? this.topLanes : this.bottomLanes;
      let lane = pickFixedLane(lanes, start);
      if (lane === -1 && overlap) lane = 0;
      if (lane === -1) {
        el.remove();
        return false;
      }
      lanes[lane] = start + duration;
      const top =
        mode === 'top' ? lane * laneHeight : this.height * (1 - BOTTOM_OFFSET) - (lane + 1) * laneHeight;
      el.style.top = `${top}px`;
      const x = `translateX(${(this.width - w) / 2}px)`;
      keyframes = [{ transform: x }, { transform: x }];
    }

    const anim = el.animate(keyframes, { duration: duration * 1000, easing: 'linear', fill: 'forwards' });
    anim.currentTime = age * 1000;
    anim.updatePlaybackRate(rate);
    if (this.paused) anim.pause();
    const flying = { el, anim };
    this.flying.add(flying);
    anim.finished
      .then(() => this.remove(flying))
      .catch(() => {}); // cancelled by clear()
    return true;
  }

  private remove(flying: Flying): void {
    flying.el.remove();
    this.flying.delete(flying);
  }

  pause(): void {
    this.paused = true;
    for (const f of this.flying) f.anim.pause();
  }

  resume(): void {
    this.paused = false;
    for (const f of this.flying) f.anim.play();
  }

  setRate(rate: number): void {
    for (const f of this.flying) f.anim.updatePlaybackRate(rate);
  }

  clear(): void {
    for (const f of this.flying) {
      f.anim.cancel();
      f.el.remove();
    }
    this.flying.clear();
    this.scrollLanes.fill(undefined);
    this.topLanes.fill(0);
    this.bottomLanes.fill(0);
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.layer.hidden = !on;
    if (!on) this.clear();
  }

  destroy(): void {
    clearTimeout(this.resizeTimer);
    this.clear();
    this.resizeObserver.disconnect();
    this.layer.remove();
  }
}
