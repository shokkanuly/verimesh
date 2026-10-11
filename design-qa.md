# Horkos Strawberry-Inspired Frontend QA

Date: October 8, 2026.

## Findings

No actionable P0/P1/P2 findings remain in this frontend update. This is an
adaptation for Horkos, not an identical Strawberry-branded reproduction.
The earlier PactFlow/ribbon design report is superseded by this report.

## Comparison Evidence

- Source visual truth: <https://strawberrybrowser.com/?ref=saaspo.com>.
  The actual page was inspected in the in-app browser at desktop and mobile
  sizes, including its product preview, lower sections, FAQ and mobile menu.
- Implementation: <http://127.0.0.1:5173/> and
  <http://127.0.0.1:5173/dashboard>.
- Matched desktop comparison: 1440 x 1000 CSS pixels; source and implementation
  screenshots both 1440 x 1000 image pixels, devicePixelRatio 1.
- Matched mobile comparison: 390 x 844 CSS pixels; both screenshots 390 x 844
  image pixels, devicePixelRatio 1. Open-menu states were also compared.
- Source and implementation screenshots were emitted together in the same
  comparison input for each matched state. An initial source capture at
  1280 x 720 / density 2 was discarded for fidelity judgment; viewport and density
  were normalized before the desktop comparison.
- Source captures are recorded in browser tool results, not saved locally.
  Reproducible implementation screenshots live in `evidence/replay/screens/`:
  `home-desktop.png`, `home-mobile.png`, `home-menu-mobile.png`,
  `home-wide.png` (1920 x 1080), `home-reference.png` (794 x 556),
  `home-narrow.png` (320 x 740) and `home-full.png` (1440 x 3799).
- State: initial homepage, light theme, no overlay; mobile menu compared
  separately with navigation open. The source product video is animated, while
  Horkos deliberately uses its own explicitly recorded static dashboard image.
- Full-view comparisons establish header, hero, actions and preview proportions.
  Those controls were readable at native size, so separate magnified hero crops
  were unnecessary. Focused implementation checks additionally inspected
  `home-faq-desktop.png`, the mobile FAQ in the in-app browser, and dashboard
  evidence/integration screenshots. The scaled full-page image alone was not
  used to judge small control text.

## Required Fidelity Surfaces

- Fonts and typography: the source uses proprietary Strawberry Sans, approximately
  50.8 px / 55.88 px at weight 480 for the desktop headline, with negative tracking.
  Horkos uses existing Inter at 52 px / 1.12, weight 550, and zero letter spacing
  as required by the project design constraints. Georgia gives the wordmark a
  comparable serif treatment without copying the logo. Responsive headline sizes
  are fixed by breakpoints, not viewport-scaled. Mobile heading and body wrap
  cleanly; mono protocol text remains compact. Exact font metrics and rasterization
  are intentional differences, not claimed pixel matches.
- Spacing and layout: 64 px sticky header, centered 1040 px desktop content,
  generous centered hero, 46 px pill actions and a large actual product preview.
  The source preview begins around y455; Horkos around y456 at the matched
  desktop size. Mobile actions stack and navigation becomes a full-height overlay.
  The product preview enters the first viewport at all five tested sizes.
  Lower sections are unframed layouts, not nested cards. No horizontal overflow,
  overlapping text or clipped command labels was observed.
- Colors and tokens: source near-white `#fffcfa` becomes neutral `#fdfdfc`, with
  `#252522` ink, restrained gray text, coral brand accent and black/white actions.
  The bitmap pattern is softened to 60% opacity. Dashboard semantic green, blue,
  amber and red remain distinct, with explicit recorded/historical warnings.
  The result does not rely on a dominant beige or dark-slate palette.
- Image quality: an original 1672 x 941 generated PNG supplies the subtle ambient
  pattern instead of hand-drawn CSS/SVG decoration. The actual dashboard preview
  is a sharp 1440 x 1110 capture, with reserved aspect ratio and proportional
  responsive scaling. It is illustrative at phone scale; its link opens the usable
  full dashboard. No hotlinked assets, copied mascots or fake customer logos.
- Copy and content: Horkos-specific identity, commitments and evidence replace
  the source's browser marketing. Protocol foundations replace its customer strip;
  no adoption or performance claims are implied. Single-signer authority,
  unproven feature truth, mock bridge and pending verified deployment stay explicit.
  The FAQ explains actual boundaries rather than describing styling or controls.
- Icons and controls: existing Lucide icons, consistent strokes, visible focus,
  semantic buttons and links. FAQ questions and answers follow the source's
  conversational bubble treatment, with one answer open at a time. The operational
  dashboard remains compact and work-focused rather than becoming a marketing page.

## Comparison History

1. Blocked, P2: the homepage preview still showed the earlier dark dashboard after
   the real workspace switched to light. That made product imagery inconsistent.
   Fix: replace `dashboard-recorded.png` with the new regression-suite capture.
   Post-fix desktop/mobile comparisons show the light preview and matching workspace.
2. Blocked, P2: the generated pattern was too prominent behind the headline compared
   with the reference. Fix: render the bitmap on a non-interactive pseudo-element
   at 60% opacity, retaining the same original asset and crop.
3. Passed: matched post-fix desktop/mobile comparisons show subdued texture, clear
   headline/body contrast, correctly framed light preview, and intact navigation.
   Fresh regression screenshots and build were produced after the final CSS edit.

## Behavior and Verification

- Homepage and dashboard have separate routes and titles. Dashboard code is lazy;
  homepage does not start evidence API polling.
- Header, hero, preview, footer, back-home and direct evidence/integration links,
  browser history, trailing slash, unknown route and invalid-view fallback tested.
- Mobile menu open/close, section selection, Escape/focus restoration, keyboard
  wrap, inert background, scroll-lock cleanup and resize-to-desktop tested.
- FAQ default-open, switching questions and collapsing the active answer tested.
  In-app browser checks confirmed the rendered mobile FAQ and menu, not just DOM.
- Recorded incident selection, successful complete API verification, tamper
  rejection, invalid JSON, restoring the selected bundle and API-offline states pass.
- Mocked RPC event correlation, selected live evidence, empty range and offline
  states pass. These are synthetic tests, not proof of a new live deployment.
- `pnpm build`, final dashboard build, `pnpm lint`, `pnpm check:addresses`,
  `pnpm test` (80 Node + 89 package tests), and final `pnpm check:dashboard` passed.
  Browser regression suite recorded no runtime errors. The local browser console
  also returned no errors during the final homepage check.
- Dashboard captures: `recorded-desktop.png`, `recorded-mobile.png`,
  `tamper-desktop.png`, `evidence-mobile.png`, `integration-mobile.png`,
  `integration-desktop.png` under `evidence/replay/screens/`.

## Intentional Differences and Limits

- Original brand, product content, bitmap texture and product preview replace
  Strawberry's proprietary media, fonts, customer logos and claims. Unrelated
  browser carousels, download flows, pricing and account pages are not reproduced.
- Pills and FAQ bubbles intentionally follow the reference. Actual framed product
  previews use radii of 8 px or less; sections do not float inside decorative cards.
- No public hosting, fresh contract broadcast, production-readiness or full-roadmap
  completion is claimed. Existing credential/deployment blockers are unaffected.
- Chromium and in-app checks do not substitute for Safari/Firefox testing, a full
  assistive-technology audit or a comprehensive text-zoom audit. Remote font
  availability continues to use the existing system fallback chain.

## Implementation Checklist

- [x] Separate homepage and dashboard, with working navigation.
- [x] Adapt the inspected Strawberry direction with original assets and honest copy.
- [x] Match desktop/mobile sizes and inspect both artifacts together.
- [x] Fix preview/theme mismatch and excessive pattern contrast, then recapture.
- [x] Verify five viewport sizes, mobile keyboard behavior and FAQ states.
- [x] Preserve recorded/live boundaries and evidence verification.
- [x] Document asset provenance and retain local preview URLs.

final result: passed
