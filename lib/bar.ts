import {
  AREA_STEPS,
  PALETTE,
  SPEED_LABELS,
  type Density,
  type DisplaySettings,
  type Mode,
  type SendStyle,
} from './settings';

const MAX_LENGTH = 100;
const SEND_COOLDOWN_MS = 2000;

export type BarHandlers = {
  onSend(text: string): Promise<void>;
  onToggle(on: boolean): void;
  onStyle(style: SendStyle): void;
  onDisplay(settings: DisplaySettings): void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

type SegOption<T> = { value: T; label?: string; title?: string; icon?: () => SVGSVGElement };

/** A row of mutually exclusive buttons: text, an icon, or an icon over a short label. */
function segmented<T>(options: SegOption<T>[], onPick: (value: T) => void) {
  const root = el('div', 'dm-seg');
  const buttons = options.map((o) => {
    const b = el('button', 'dm-seg-btn');
    b.type = 'button';
    if (o.icon) {
      b.classList.add(o.label ? 'dm-seg-stacked' : 'dm-seg-icon');
      b.append(o.icon());
    }
    if (o.label) b.append(el('span', 'dm-seg-label', o.label));
    if (o.title) {
      b.title = o.title;
      b.setAttribute('aria-label', o.title);
    }
    b.addEventListener('click', () => onPick(o.value));
    root.append(b);
    return b;
  });
  return {
    root,
    set(value: T) {
      options.forEach((o, i) => buttons[i]!.setAttribute('aria-pressed', String(o.value === value)));
    },
  };
}

/** A labelled slider with its current value shown on the right. */
function slider(min: number, max: number, step: number, format: (v: number) => string, onInput: (v: number) => void) {
  const root = el('div', 'dm-slider');
  const input = el('input', 'dm-range');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  const value = el('span', 'dm-slider-value');
  input.addEventListener('input', () => {
    value.textContent = format(Number(input.value));
    onInput(Number(input.value));
  });
  root.append(input, value);
  return {
    root,
    set(v: number) {
      input.value = String(v);
      value.textContent = format(v);
    },
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
// Material Icons "settings" (Apache 2.0), the gear YouTube's own player uses.
const GEAR_PATH =
  'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z';

// Material Icons "chat" (Apache 2.0): a speech bubble whose lines read as flying comments.
const CHAT_PATH =
  'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z';

/** Built node by node: YouTube's Trusted Types policy blocks innerHTML. */
function icon(d: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

function svgNode<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const OFF_MASK_ID = 'dm-off-mask';

/**
 * The on/off toggle: a chat bubble. While danmaku are off, a slash crosses it with a gap cut out of
 * the bubble around the slash (the mask), so the slash doesn't melt into the bubble's fill.
 */
function danmuIcon(): SVGSVGElement {
  const svg = icon(CHAT_PATH);
  const mask = svgNode('mask', { id: OFF_MASK_ID, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 24, height: 24 });
  mask.append(
    svgNode('rect', { width: 24, height: 24, fill: 'white' }),
    svgNode('line', { x1: 3, y1: 3, x2: 21, y2: 21, stroke: 'black', 'stroke-width': 6, 'stroke-linecap': 'round' }),
  );
  const defs = svgNode('defs', {});
  defs.append(mask);
  svg.prepend(defs);
  svg.append(svgNode('line', { class: 'dm-slash', x1: 3, y1: 3, x2: 21, y2: 21 }));
  return svg;
}

/** A small player frame (28×20) with marks inside it, for the Area and Mode buttons. */
function frameIcon(...marks: SVGElement[]): SVGSVGElement {
  const svg = svgNode('svg', { viewBox: '0 0 28 20', 'aria-hidden': 'true', class: 'dm-frame-icon' });
  svg.append(
    svgNode('rect', { x: 1.75, y: 1.75, width: 24.5, height: 16.5, rx: 2.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }),
    ...marks,
  );
  return svg;
}

/** Area: the top share of the frame filled in, the part of the player danmaku may use. */
function areaIcon(share: number): SVGSVGElement {
  return frameIcon(svgNode('rect', { x: 4, y: 4, width: 20, height: 12 * share, rx: 1, fill: 'currentColor' }));
}

/** Mode: an arrow flying right to left (normal), or a comment pinned to the top or bottom. */
function modeIcon(mode: Mode): SVGSVGElement {
  if (mode === 'scroll') {
    return frameIcon(
      svgNode('path', {
        d: 'M20.5 10H8.5M11.75 6.75 8.5 10l3.25 3.25',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.75,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    );
  }
  const y = mode === 'top' ? 4.5 : 12.5;
  return frameIcon(svgNode('rect', { x: 8, y, width: 12, height: 3, rx: 1.5, fill: 'currentColor' }));
}

const AREA_TITLES = ['Top quarter of the player', 'Top half of the player', 'Top three quarters of the player', 'Whole player'];

/** 267 → "267", 1234 → "1.2k": keeps the toggle pill short. */
function formatCount(n: number): string {
  return n < 1000 ? String(n) : `${Math.floor(n / 100) / 10}k`;
}

function row(label: string, control: HTMLElement): HTMLElement {
  const r = el('div', 'dm-row');
  r.append(el('span', 'dm-row-label', label), control);
  return r;
}

/** The row under the player (inside it in fullscreen): on/off pill with the danmu count, send style, input, Send, settings. */
export class Bar {
  private root = el('div', 'dm-bar');
  private toggle = el('button', 'dm-toggle');
  private styleButton = el('button', 'dm-icon-btn dm-style-btn', 'A');
  private input = el('input', 'dm-input');
  private send = el('button', 'dm-send', 'Send');
  private settingsButton = el('button', 'dm-icon-btn');
  private count = el('span', 'dm-toggle-count');
  private stylePanel = el('div', 'dm-panel dm-panel-style');
  private displayPanel = el('div', 'dm-panel dm-panel-display');
  private enabled = true;
  private lastSent = 0;
  private style: SendStyle = { color: '#FFFFFF', mode: 'scroll' };
  private display!: DisplaySettings;

  private total = 0;
  // User testing (2026-10-27): "Scroll / Top / Bottom" and "1/4 … Full" read as jargon, so both are pictures now.
  private modeControl = segmented<Mode>(
    [
      { value: 'scroll', label: 'Normal', title: 'Flies across, right to left', icon: () => modeIcon('scroll') },
      { value: 'top', label: 'Top', title: 'Stays at the top for a few seconds', icon: () => modeIcon('top') },
      { value: 'bottom', label: 'Bottom', title: 'Stays at the bottom for a few seconds', icon: () => modeIcon('bottom') },
    ],
    (mode) => this.updateStyle({ ...this.style, mode }),
  );
  private swatches: HTMLButtonElement[] = [];
  private opacityControl = slider(10, 100, 5, (v) => `${v}%`, (v) => this.updateDisplay({ opacity: v / 100 }));
  private areaControl = segmented<number>(
    AREA_STEPS.map((value, i) => ({ value, title: AREA_TITLES[i]!, icon: () => areaIcon(value) })),
    (area) => this.updateDisplay({ area }),
  );
  private speedControl = slider(1, 5, 1, (v) => SPEED_LABELS[v - 1]!, (speed) => this.updateDisplay({ speed }));
  private sizeControl = slider(50, 200, 10, (v) => `${v}%`, (v) => this.updateDisplay({ fontScale: v / 100 }));
  private densityControl = segmented<Density>(
    [
      { value: 'low', label: 'Fewer' },
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'More' },
    ],
    (density) => this.updateDisplay({ density }),
  );

  constructor(private handlers: BarHandlers) {
    for (const b of [this.toggle, this.styleButton, this.send, this.settingsButton]) b.type = 'button';
    this.styleButton.title = 'Bullet comment colour and position';
    this.settingsButton.title = 'Bullet comment settings';
    this.settingsButton.append(icon(GEAR_PATH));
    this.toggle.append(danmuIcon(), this.count);
    this.input.maxLength = MAX_LENGTH;
    this.input.placeholder = 'Add a bullet comment…';

    // Send style: mode + Bilibili's palette.
    const palette = el('div', 'dm-palette');
    for (const color of PALETTE) {
      const s = el('button', 'dm-swatch');
      s.type = 'button';
      s.style.background = color;
      s.title = color;
      s.addEventListener('click', () => this.updateStyle({ ...this.style, color }));
      palette.append(s);
      this.swatches.push(s);
    }
    this.stylePanel.append(row('Mode', this.modeControl.root), row('Colour', palette));

    // Display settings, as in Bilibili's 弹幕设置.
    this.displayPanel.append(
      row('Opacity', this.opacityControl.root),
      row('Area', this.areaControl.root),
      row('Speed', this.speedControl.root),
      row('Font size', this.sizeControl.root),
      row('Density', this.densityControl.root),
    );
    this.stylePanel.hidden = true;
    this.displayPanel.hidden = true;

    this.root.append(
      this.toggle,
      this.styleButton,
      this.input,
      this.send,
      this.settingsButton,
      this.stylePanel,
      this.displayPanel,
    );

    this.toggle.addEventListener('click', () => {
      this.setEnabled(!this.enabled);
      this.handlers.onToggle(this.enabled);
    });
    this.styleButton.addEventListener('click', () => this.openPanel(this.stylePanel));
    this.settingsButton.addEventListener('click', () => this.openPanel(this.displayPanel));
    this.send.addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) this.submit();
    });
    // Keep YouTube's shortcuts (k, f, j, l, m, space, /, arrows) from firing while typing or using
    // sliders. Buttons let keys through, so k still pauses after clicking 弹 or Send.
    for (const type of ['keydown', 'keypress', 'keyup'] as const) {
      this.root.addEventListener(type, (e) => {
        if ((e as KeyboardEvent).key === 'Escape') this.closePanels();
        if (e.target instanceof HTMLInputElement) e.stopPropagation();
      });
    }
    // Clicking a button must not leave it focused, or space would press it again instead of pausing.
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as Element).closest('button')) e.preventDefault();
    });
    // Inside the player (fullscreen), clicks must not reach it: a click pauses, a double-click exits fullscreen.
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'] as const) {
      this.root.addEventListener(type, (e) => e.stopPropagation());
    }
    document.addEventListener('click', this.onDocumentClick, true);
    this.setEnabled(true);
  }

  private onDocumentClick = (e: MouseEvent) => {
    if (!this.root.contains(e.target as Node)) this.closePanels();
  };

  private openPanel(panel: HTMLElement): void {
    const wasOpen = !panel.hidden;
    this.closePanels();
    panel.hidden = wasOpen;
  }

  private closePanels(): void {
    this.stylePanel.hidden = true;
    this.displayPanel.hidden = true;
  }

  get isMounted(): boolean {
    return this.root.isConnected;
  }

  get inPlayer(): boolean {
    return this.root.classList.contains('dm-bar-fs');
  }

  /**
   * Puts the bar just below the player, or, given the player (fullscreen), floating at its bottom.
   * False while YouTube hasn't rendered the spot below the player yet.
   */
  mount(player?: HTMLElement): boolean {
    if (player) {
      this.root.classList.add('dm-bar-fs');
      player.append(this.root);
      return true;
    }
    const below = document.querySelector('ytd-watch-flexy #below');
    if (!below) return false;
    this.root.classList.remove('dm-bar-fs');
    below.prepend(this.root);
    return true;
  }

  /** In fullscreen, how far above the player's bottom edge the bar floats (clear of YouTube's controls). */
  setBottomOffset(px: number): void {
    this.root.style.setProperty('--dm-fs-bottom', `${px}px`);
  }

  private async submit(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || Date.now() - this.lastSent < SEND_COOLDOWN_MS) return;
    this.lastSent = Date.now();
    this.input.value = '';
    this.send.disabled = true;
    setTimeout(() => (this.send.disabled = false), SEND_COOLDOWN_MS);
    try {
      await this.handlers.onSend(text);
    } catch (err) {
      console.error('[danmu] send failed', err);
      this.input.value = text;
    }
  }

  private updateStyle(style: SendStyle): void {
    this.setStyle(style);
    this.handlers.onStyle(style);
  }

  private updateDisplay(change: Partial<DisplaySettings>): void {
    this.setDisplay({ ...this.display, ...change });
    this.handlers.onDisplay(this.display);
  }

  setStyle(style: SendStyle): void {
    this.style = style;
    this.styleButton.style.color = style.color;
    this.modeControl.set(style.mode);
    this.swatches.forEach((s, i) => s.setAttribute('aria-pressed', String(PALETTE[i] === style.color)));
  }

  setDisplay(settings: DisplaySettings): void {
    this.display = settings;
    this.opacityControl.set(Math.round(settings.opacity * 100));
    this.areaControl.set(settings.area);
    this.speedControl.set(settings.speed);
    this.sizeControl.set(Math.round(settings.fontScale * 100));
    this.densityControl.set(settings.density);
  }

  setCount(total: number): void {
    this.total = total;
    this.renderToggle();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.toggle.setAttribute('aria-pressed', String(on));
    this.renderToggle();
  }

  /** On: the count. Off: the word "Off" and a crossed-out bubble (testers missed the old dimmed look). */
  private renderToggle(): void {
    const bubble = this.toggle.querySelector('svg > path');
    if (this.enabled) bubble?.removeAttribute('mask');
    else bubble?.setAttribute('mask', `url(#${OFF_MASK_ID})`);
    const n = this.total;
    this.count.textContent = this.enabled ? formatCount(n) : 'Off';
    this.toggle.title = this.enabled
      ? `${n} bullet comment${n === 1 ? '' : 's'} · click to hide`
      : 'Bullet comments are off · click to show';
  }

  destroy(): void {
    document.removeEventListener('click', this.onDocumentClick, true);
    this.root.remove();
  }
}
