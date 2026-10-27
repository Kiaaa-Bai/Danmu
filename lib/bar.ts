const MAX_LENGTH = 100;
const SEND_COOLDOWN_MS = 2000;

export type BarHandlers = {
  onSend(text: string): Promise<void>;
  onToggle(on: boolean): void;
};

function formatTime(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** The row under the player: on/off toggle, input, Send, and the danmu count. */
export class Bar {
  private root = document.createElement('div');
  private toggle = document.createElement('button');
  private input = document.createElement('input');
  private send = document.createElement('button');
  private count = document.createElement('span');
  private enabled = true;
  private lastSent = 0;

  constructor(private handlers: BarHandlers) {
    this.root.className = 'dm-bar';
    this.toggle.className = 'dm-toggle';
    this.toggle.textContent = '弹';
    this.toggle.title = 'Show or hide danmu';
    this.input.className = 'dm-input';
    this.input.maxLength = MAX_LENGTH;
    this.input.placeholder = 'Send a danmu…';
    this.send.className = 'dm-send';
    this.send.textContent = 'Send';
    this.count.className = 'dm-count';
    this.root.append(this.toggle, this.input, this.send, this.count);

    this.toggle.addEventListener('click', () => {
      this.setEnabled(!this.enabled);
      this.handlers.onToggle(this.enabled);
    });
    this.send.addEventListener('click', () => this.submit());
    // Keep YouTube's shortcuts (k, f, j, l, m, space, /, arrows) from firing while typing.
    for (const type of ['keydown', 'keypress', 'keyup'] as const) {
      this.input.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === 'keydown' && e.key === 'Enter' && !e.isComposing) this.submit();
      });
    }
    this.setEnabled(true);
  }

  get isMounted(): boolean {
    return this.root.isConnected;
  }

  /** Puts the bar just below the player. False while YouTube hasn't rendered that spot yet. */
  mount(): boolean {
    const below = document.querySelector('ytd-watch-flexy #below');
    if (!below) return false;
    below.prepend(this.root);
    return true;
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

  setTime(sec: number): void {
    this.input.placeholder = `Send a danmu at ${formatTime(sec)}…`;
  }

  setCount(total: number, fromComments: number): void {
    this.count.textContent =
      fromComments > 0 ? `${total} danmu · ${fromComments} from comments` : `${total} danmu`;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.toggle.setAttribute('aria-pressed', String(on));
  }

  destroy(): void {
    this.root.remove();
  }
}
