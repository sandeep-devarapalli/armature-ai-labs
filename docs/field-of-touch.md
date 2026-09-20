# Field of touch

The approved T2 design uses a calm point lattice in muted source colours. The homepage uses microplate scanning as the integrated backdrop (option 03), with a dark fade behind the text and the animation stacked below the copy on mobile. A clearly labelled illustrative laboratory interior accompanies the working-floor introduction; glass pickup and the selected yellow arm accompany the build pipeline. Membership uses birds over water and a closing rain study. Services uses waves with training and clinical sample automation with research. All existing text, calls to action, room information and operational routes are retained.

The user authorized publication of the completed placements on 20 September 2026, superseding the earlier deployment hold and PR #67's glass-pickup hero. Biotech pipetting is explicitly excluded for now: its Storyblocks evaluation source has no acquired publication license. No General Intuition reference footage or earlier tactile still is included.

The eight included clips are modified Pexels footage; author links, exact source pages, asset hashes and authored cues are recorded in `public/media/field-of-touch/sources.json`. They illustrate robotics, automation and nature, not Armature facilities or owned equipment.

The shared renderer is independently implemented for the local studies and copied with its approved T2 shader. A React wrapper loads it near the viewport; videos remain absent until needed, and reduced-motion visitors receive a rendered T2 still until they choose Play. Hidden/offscreen playback stops. Pausing leaves pointer exploration available. Touch retains native vertical scrolling. Asset or graphics failures retain a T2 still.

The local catalogue remains at http://127.0.0.1:4331/catalogue.html, with the finalized design at /t2.html and the earlier comparisons preserved.

## Validation

The complete selected placement release passed 69 unit tests, 127 browser tests (seven intentional skips), 25 production release gates (three intentional skips), asset integrity and local Pages runtime checks. Additional visual/playback checks covered all eight scenes at 1440px and 390px in dark, light and sepia, plus 900px hero and paired-film layouts. Reduced-motion loads no MP4 on home, membership or services until Play. At taller viewports the next film may preload within the 160px margin; offscreen video remains paused. Local evidence: `/private/tmp/t2-release-qa/results.json` and `/private/tmp/placement-independent-review.json`. Physical Safari/iOS testing remains outstanding.

The selected integrated-backdrop revision passed 69 unit tests, the production build and asset-integrity checks, and four targeted desktop/mobile playback and reduced-motion browser checks. Local visual checks covered 1440px and 390px widths in dark, light and sepia themes, with no horizontal overflow or page errors. Evidence: `evidence/integrated-selected-qa.json` and `integrated-selected-*.png` in the animation study. The performance measurements below describe the earlier glass-pickup hero, not the larger scanner backdrop.

Verified on this Mac in Chromium 151 against a production build at desktop and 390px mobile viewports:

- All six homepage sections, CTA destinations, room content and themes retained.
- All three T2 scenes render moving frames; pause/resume works; pointer illumination returns to the exact paused image after decay.
- Clinical footage has no video request on initial homepage view. Reduced motion makes no MP4 request until Play. Offscreen scenes stop, and a simulated hidden-document transition stops playback; failed video and unavailable WebGL retain the T2 still.
- Desktop hero 590×332, DPR 1: three eight-second samples after two-second warmup measured 25.000, 25.000 and 25.125 draw calls/second. Median frame intervals 41.5–41.6 ms; p95 42.3–42.7 ms. No additional dropped video frames during these samples. Offscreen: zero draws over two seconds.
- Whole-page CDP script duration was 0.247–0.260 seconds per eight-second sample. This excludes GPU completion and native video decode; these are cadence/resource checks, not a speedup claim or physical mobile-device performance measurement.
- Unit tests: 69 passed, including five playback-race regressions. Build, asset integrity, local Cloudflare Pages smoke and dependency audit passed. Full demo browser suite: 127 passed and seven intentional mode/device skips. Four targeted T2 desktop/mobile checks passed again after the lifecycle guard fix. Production gate results are recorded with the release PR.

Local visual evidence is preserved in the animation study's `evidence/website-t2-qa.json`, `website-t2-performance.json` and theme screenshots. The original comparison evidence remains separate.
