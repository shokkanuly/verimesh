# Homepage Assets

The homepage at `/` adapts the visual direction of
<https://strawberrybrowser.com/?ref=saaspo.com>, inspected October 8, 2026.
`/dashboard` remains the separate operational application, with a matching light
palette. This replaces the earlier folded-ribbon homepage direction.

The reference's centered composition, serif wordmark treatment, dark/white
pill actions, product preview, mobile navigation and conversational FAQ informed
the layout. Strawberry branding, proprietary fonts, mascots, videos, testimonials,
customer logos and claims are not copied or hotlinked. Reuse of third-party
proprietary assets requires appropriate permission and compliance with terms.

## Generated Pattern

- File: `apps/dashboard/public/images/horkos-pattern.png`
- Tool: built-in `image_gen`, generated October 8, 2026, using the inspected
  source screenshot as a visual reference for an original bitmap background.
- Original output: `exec-2ef3a5c3-90a0-4c7e-828f-01d0b3e17de6.png`.
- Size: 1672 x 941, PNG, opaque near-white background.
- Purpose: decorative geometric texture only, with no product-proof claims.
- Treatment: full-bleed background at 60% opacity; responsive crop, no layout shift.

Generation prompt:

> Generate an original 16:9 website background texture bitmap, using the attached Strawberry Browser screenshot ONLY as visual reference for its pale patterned background. Output ONLY the background asset, not a website mockup. No text, letters, logos, UI, buttons, avatars, people, animals, characters, browser screenshot, cards or watermarks. A clean near-white (#fdfdfc) canvas with an extremely subtle, orderly field of tiny soft gray geometric glyphs (small diamonds, squares, little four-point crosses) mostly toward the upper left and upper right edges, fading gently into a completely clean empty white central area for a centered black heading. Crisp delicate editorial texture, low contrast, not a gradient illustration, no orbs, no bokeh, no big shape or ribbon, no pink sculpture. The lower half fades to uniform near-white. Match the restrained calm density and near-invisibility of the source's ambient geometric pattern; this is a neutral decorative background for Horkos, a cryptographic decision registry. Wide landscape high-resolution bitmap.

## Product Preview

- File: `apps/dashboard/public/images/dashboard-recorded.png`
- Source: `evidence/replay/screens/recorded-desktop.png`, produced by
  `pnpm check:dashboard` at a 1440 x 1000 Chromium viewport. The full-page
  image is 1440 x 1110; markup reserves these intrinsic dimensions.
- Refreshed to show the current light dashboard, not the earlier dark palette.
- Actual local dashboard with five synthetic signed incidents and the historical
  deployment warning. Not live activity, a fresh deployment or adoption evidence.
- Surrounding page explicitly labels this preview RECORDED and synthetic.

## Fonts and Icons

The existing Inter family replaces the proprietary Strawberry Sans, with Arial
and sans-serif fallbacks. Georgia supplies the Horkos wordmark's serif treatment;
JetBrains Mono retains compact protocol identifiers. Letter spacing stays zero.
Controls use the existing `lucide-react` library. No custom SVG artwork or new
icon library was introduced.

`horkos-ribbon.png` is retained as an unused earlier generated variant, not
loaded by the current homepage. See root `design-qa.md` for verification.
