/**
 * Background polling that never stacks overlapping runs (avoids flooding the
 * backend proxy when a request is slow). By default it skips hidden tabs.
 */
export function startBackgroundPoll(
  tick: () => void | Promise<void>,
  intervalMs: number,
  options?: {
    /** Also refresh when the tab becomes visible again. Default true. */
    refreshOnVisible?: boolean;
    /** Fire once immediately. Default true. */
    runImmediately?: boolean;
    /** Keep polling while the tab is hidden. Default false. */
    pollWhenHidden?: boolean;
  },
): () => void {
  const refreshOnVisible = options?.refreshOnVisible ?? true;
  const runImmediately = options?.runImmediately ?? true;
  const pollWhenHidden = options?.pollWhenHidden ?? false;
  let cancelled = false;
  let inFlight = false;
  let timer: number | undefined;

  async function run() {
    if (cancelled || inFlight) return;
    if (
      !pollWhenHidden &&
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }

    inFlight = true;
    try {
      await tick();
    } catch {
      // Callers handle their own errors; never let a poll reject crash the loop.
    } finally {
      inFlight = false;
    }
  }

  if (runImmediately) {
    void run();
  }
  timer = window.setInterval(() => {
    void run();
  }, intervalMs);

  function onVisibility() {
    if (!refreshOnVisible) return;
    if (document.visibilityState === "visible") {
      void run();
    }
  }

  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    cancelled = true;
    if (timer != null) window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
