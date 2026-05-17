import "server-only";

/**
 * Global serialized rate limiter for outbound Spotify requests.
 *
 * No matter how many scanners, components or parallel server actions are
 * running, every Spotify call funnels through this single queue and waits
 * for a slot. Configured well below Spotify's documented 180 req/30s window
 * so that stacked workloads (stats scan + genre analysis + page fetches)
 * cannot collectively exceed it.
 */
class TokenBucket {
  private queue: Array<() => void> = [];
  private processing = false;
  private lastReleased = 0;

  constructor(private readonly minIntervalMs: number) {}

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.pump();
    });
  }

  private async pump() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const elapsed = Date.now() - this.lastReleased;
        if (elapsed < this.minIntervalMs) {
          await sleep(this.minIntervalMs - elapsed);
        }
        const next = this.queue.shift();
        this.lastReleased = Date.now();
        next?.();
      }
    } finally {
      this.processing = false;
    }
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// 4 requests/sec sustained = 120 req/30s, well under Spotify's 180 cap.
// Brief bursts are fine because Spotify's window is rolling.
const SPOTIFY_MIN_INTERVAL_MS = 250;

declare global {
  // eslint-disable-next-line no-var
  var __spotifyRateLimiter: TokenBucket | undefined;
}

export const spotifyLimiter =
  globalThis.__spotifyRateLimiter ??
  (globalThis.__spotifyRateLimiter = new TokenBucket(SPOTIFY_MIN_INTERVAL_MS));
