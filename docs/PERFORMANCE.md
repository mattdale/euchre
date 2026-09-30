# Performance analysis

**Verdict:** the game was already smooth to play. Frames held 60 fps even on a slow phone profile, and nothing leaked. Where it fell short was page weight and idle CPU. Two-thirds of the bytes it loaded came from third-party scripts that did almost nothing, and while it waited for you to play, CSS animations kept the main thread busy every frame. This branch fixes both.

## How it was measured

The measurements ran in headless Chromium with Playwright against `main` and against this branch:

- **Device:** a 390×844 phone viewport at 3× DPR, with **4× CPU throttling**.
- **Network:** Lighthouse's "Slow 4G" profile (150 ms RTT, 1.6 Mbps down), with text files served gzip'd.
- **Third-party CDNs:** jQuery, unpkg and jsdelivr were served from local copies of the same npm packages, so their byte counts are exact. Their latency is flattered, because a real CDN adds DNS and TLS setup on each new origin. Giphy and Tenor GIFs were stubbed out.
- **Gameplay:** one full hand ran at real speed with an autoplayer. Frame times come from `requestAnimationFrame` deltas. Script, style and layout time come from CDP `Performance.getMetrics`.
- **Leaks:** three full games ran at accelerated speed, and DOM nodes, event listeners and JS heap were compared after forced GC.

## Results

| Metric | `main` | This branch | Change |
| --- | ---: | ---: | --- |
| Bytes loaded (gzip) | 166 KB | 61 KB | −63% |
| Third-party bytes | 113 KB | 0 KB | removed |
| Requests | 16 | 10 | −6 |
| First Contentful Paint | 780 ms | 572 ms | −27% |
| Largest Contentful Paint | 1,152 ms | 768 ms | −33% |
| Cumulative Layout Shift | 0 | 0 | |
| Total Blocking Time | 0 ms | 0 ms | |
| **Main-thread work while waiting on your turn** | **186 ms/s** | **4.5 ms/s** | **−98%** |
| Style recalcs while waiting on your turn | 60 /s | 0 /s | |
| Main-thread work on the start screen | 114 ms/s | 88 ms/s | −23% |
| Style recalc time over one hand | 9.2 s | 6.9 s | −25% |
| Frame time p95 / p99 during a hand | 16.7 / 16.8 ms | 16.7 / 16.8 ms | already smooth |
| Frames over 50 ms during a hand | 4 | 2 | |
| DOM nodes / listeners after 3 games | +78 / +1 | +1 / −7 | no leak either way |

Figures are per second of wall-clock time on the 4× throttled CPU. At 186 ms/s, the old build kept a slow phone's main thread about 19% busy while you were just thinking about which card to play.

## What was wrong, and what changed

1. **The icon library cost 94 KB to draw one X.** The `@phosphor-icons/web` script injects six stylesheets, one per weight, with about 9,000 rules in all. The game used one of them, for the close button in Settings. Those rules were also checked on every style recalc during animations. The X is now an inline SVG, and the script is gone.
2. **jQuery was a render-blocking third-party script used for fades.** Its 25 call sites were `fadeIn`/`fadeOut`, class toggles and `find`. They now use two small helpers on the Web Animations API, which animate opacity on the compositor, plus plain DOM methods. That removes 30 KB and a blocking request to another origin.
3. **Invisible infinite animations.** The Start button's shine and glow kept animating after the button faded out, and the dealer line's dashes kept marching at `opacity: 0`. Both now stop when hidden.
4. **The MAKER badge repainted every frame for the whole hand.** It animated `box-shadow`. The glow now lives on a pseudo-element, and only its opacity animates, so it runs on the GPU. This was most of the idle cost.
5. **`glitch.mp4` (1 MB)** now has `preload="none"`, so it downloads only if someone finds the fast-forward easter egg. Chrome was already frugal here, but Safari is not.
6. **About 100 `console.log` lines per hand, plus a `console.trace` on every AI decision.** Logging is now off unless the URL has `?debug`.
7. **Every card created scheduled a hand re-layout,** including trick cards and deal animations that aren't in your hand. Only the trump pickup needed it, and now it's the only place that asks.

## What's left, and whether it matters

These items are ranked by impact. None of them causes jank today.

1. ~~**The turn-indicator pulse on opponents still repaints each frame.**~~ Fixed when the player labels took on the tutorial's look: the turn cue is now a yellow ring on its own layer that only animates `opacity`, and the text stays one color.
2. **The Start button shine** is a `background-position` animation that repaints the button 60 times a second, but only on the start screen, about 9% of a throttled CPU. Rebuilding it as a translated gradient layer would make it free. That's worth doing if the start screen ever becomes a place people linger.
3. **Euchre and game-over GIFs are fetched from Giphy and Tenor when the overlay opens.** They're 0.3–3 MB each, so on a slow connection the overlay can show an empty box for a second. Prefetching the chosen GIF when the last trick starts, or self-hosting short MP4/WebP loops, would fix it.
4. **`game.js` ships unminified,** at 150 KB raw and 34 KB gzip. That's fine without a build step. Minifying would save roughly 15 KB gzip if a build step is ever added.
5. **Trick cards fly to the winner by animating `left`/`top`** instead of `transform`. That's technically a layout animation, but it measured 0.3 s of layout per hand, so it isn't worth the risk of changing a tuned visual.

## Reproducing

The harness scripts live outside the repo because they need Playwright. To reproduce with Chrome DevTools instead, open the Performance panel, set CPU to 4× slowdown and Network to Slow 4G, record 5 seconds while it's your turn, and compare the "Recalculate Style" and "Paint" counts.
