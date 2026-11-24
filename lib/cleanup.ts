/**
 * Runs and empties a list of cleanups, the last one added first. One that throws doesn't stop the rest:
 * after the extension is updated, its storage calls throw "Extension context invalidated", and the bar
 * and the danmaku still have to come off the page.
 */
export function runCleanups(fns: (() => void)[]): void {
  for (const fn of fns.splice(0).reverse()) {
    try {
      fn();
    } catch (err) {
      console.warn('[danmu] cleanup failed', err);
    }
  }
}
