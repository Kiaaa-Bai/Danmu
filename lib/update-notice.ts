/**
 * When the extension is updated or reloaded, Chrome leaves the old content script running in tabs that were
 * already open, cut off from the extension: settings can't be saved and posting to YouTube fails. The bar
 * and the danmaku are taken down, and this one line takes the bar's place until the page is reloaded.
 */
export const UPDATE_TEXT = 'Bullet Comments was updated.';

const NOTICE_CLASS = 'dm-update-notice';

/**
 * Only when the extension itself is gone (`runtime.id` is undefined) and there was a bar to replace. If the
 * id is still there, a newer copy of the content script took over this page and draws its own bar.
 */
export function shouldShowUpdateNotice(onWatchPage: boolean, runtimeId: string | null | undefined): boolean {
  return onWatchPage && runtimeId == null;
}

// Inline styles: after an update the extension's own stylesheet may no longer apply to this page.
const ROW = 'display:flex;align-items:center;gap:12px;font-family:Roboto,Arial,sans-serif;font-size:14px;line-height:20px;';
const UNDER = 'margin:12px 0 0;color:var(--yt-spec-text-primary,#0f0f0f);';
const PILL = 'padding:8px 8px 8px 16px;color:#fff;background:rgba(28,28,28,0.9);border-radius:24px;';
const FLOATING = 'position:absolute;left:12px;bottom:72px;z-index:60;';
const CORNER = 'position:fixed;left:24px;bottom:24px;z-index:9999;';
const BUTTON =
  'flex:none;height:36px;padding:0 16px;border:none;border-radius:18px;font:inherit;font-weight:500;color:inherit;cursor:pointer;';
const BUTTON_LIGHT = 'background:var(--yt-spec-badge-chip-background,rgba(0,0,0,0.05));';
const BUTTON_DARK = 'background:rgba(255,255,255,0.2);';

/** Under the player like the bar; inside the player in fullscreen; the page corner if neither spot exists. */
function place(notice: HTMLElement, button: HTMLButtonElement): void {
  const player = document.querySelector<HTMLElement>('#movie_player');
  if (player && document.fullscreenElement?.contains(player)) {
    notice.style.cssText = ROW + PILL + FLOATING;
    button.style.cssText = BUTTON + BUTTON_DARK;
    player.append(notice);
    return;
  }
  const below = document.querySelector('ytd-watch-flexy #below');
  if (below) {
    notice.style.cssText = ROW + UNDER;
    button.style.cssText = BUTTON + BUTTON_LIGHT;
    below.prepend(notice);
    return;
  }
  notice.style.cssText = ROW + PILL + CORNER;
  button.style.cssText = BUTTON + BUTTON_DARK;
  document.body.append(notice);
}

/** Shows the notice once (a second call returns the same one). `reload` runs when Reload is clicked. */
export function showUpdateNotice(reload: () => void): HTMLElement {
  const existing = document.querySelector<HTMLElement>(`.${NOTICE_CLASS}`);
  if (existing) return existing;

  const notice = document.createElement('div');
  notice.className = NOTICE_CLASS;
  notice.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = UPDATE_TEXT;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Reload';
  button.addEventListener('click', () => reload());
  notice.append(text, button);

  // Same rules as the bar: a button must not keep focus (space would press it again instead of pausing),
  // and inside the player a click must not reach it (a click pauses, a double-click leaves fullscreen).
  notice.addEventListener('mousedown', (e) => e.preventDefault());
  for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'] as const) {
    notice.addEventListener(type, (e) => e.stopPropagation());
  }

  place(notice, button);
  const onFullscreen = () => {
    if (notice.isConnected) place(notice, button);
    else document.removeEventListener('fullscreenchange', onFullscreen);
  };
  document.addEventListener('fullscreenchange', onFullscreen);
  return notice;
}
