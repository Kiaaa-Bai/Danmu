import { pickLane, type LaneItem } from './lanes';

/** Media seconds a danmu takes to cross the player at 1×. */
export const DURATION = 8;
const GAP = 24;
const LINE_HEIGHT = 1.4;

type Flying = { el: HTMLElement; anim: Animation };

/** The layer over the video where danmaku fly. Lanes fill the top half of the player. */
export class Overlay {
  private layer: HTMLDivElement;
  private resizeObserver: ResizeObserver;
  private flying = new Set<Flying>();
  private lanes: (LaneItem | undefined)[] = [];
  private width = 0;
  private fontSize = 16;
  private paused = false;
  private visible = true;

  constructor(
    private player: HTMLElement,
    private onResize: () => void = () => {},
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

  private measure(): void {
    const height = this.player.clientHeight;
    const oldWidth = this.width;
    this.width = this.player.clientWidth;
    this.fontSize = Math.round(Math.min(30, Math.max(16, height * 0.03)));
    const laneCount = Math.max(1, Math.floor(height / 2 / (this.fontSize * LINE_HEIGHT)));
    this.lanes.length = laneCount;
    this.layer.style.setProperty('--dm-font-size', `${this.fontSize}px`);
    // Flying danmaku were sized for the old width (fullscreen, theater): let the session re-lay them.
    if (oldWidth > 0 && oldWidth !== this.width) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(this.onResize, 150);
    }
  }

  private resizeTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Sends one danmu across, starting at media time `start`. `age` > 0 starts it mid-flight
   * (after a seek). Returns false when it was dropped (hidden, or no free lane).
   */
  show(text: string, start: number, rate: number, own = false, age = 0): boolean {
    const now = start;
    if (!this.visible || this.width === 0) return false;
    const el = document.createElement('span');
    el.className = own ? 'dm-item dm-own' : 'dm-item';
    el.textContent = text;
    el.style.transform = `translateX(${this.width}px)`;
    this.layer.append(el);
    const w = el.offsetWidth;
    const lane = pickLane(this.lanes, now, this.width, w, DURATION, GAP);
    if (lane === -1) {
      el.remove();
      return false;
    }
    this.lanes[lane] = { start: now, width: w, speed: (this.width + w) / DURATION };
    el.style.top = `${lane * this.fontSize * LINE_HEIGHT}px`;
    const anim = el.animate(
      [{ transform: `translateX(${this.width}px)` }, { transform: `translateX(${-w}px)` }],
      { duration: DURATION * 1000, easing: 'linear', fill: 'forwards' },
    );
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
    this.lanes.fill(undefined);
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
