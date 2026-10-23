# Reusable Factory print assets

This folder contains the editable source, logo, pinned renderer, and regression
tests for [`../droid-sdk-one-pager.pdf`](../droid-sdk-one-pager.pdf).
It is a separate Node package so PDF tooling does not change SDK example
dependencies.

## Rebuild the handout

From the repository root, with Node 20+:

```bash
npm ci --prefix docs/assets
npm run build --prefix docs/assets
npm test --prefix docs/assets
```

The default build writes `docs/droid-sdk-one-pager.pdf`. It needs no Factory
API key, model calls, network access after installation, or internal checkout.
The source and final PDF should be committed together.

## Make another asset

Copy `droid-sdk-one-pager.pdf.json`, edit its content/layout, and pass the copy
and destination to the same renderer:

```bash
node docs/assets/render-pdf.mjs \
  --source docs/assets/your-handout.pdf.json \
  --output docs/your-handout.pdf \
  --pages 1
```

Custom command-line paths are relative to your current working directory.
Defaults resolve relative to the renderer, so it works from any directory.
Use `--pages 2` for a deliberately two-page document. The renderer refuses
unexpected pagination before replacing the previous output.

The document definition supports text, columns, panels, tables, lists, images,
QR codes, and links. Use `factoryLockup` as an image reference to include the
bundled Factory logo. Keep arbitrary assets embedded as data URIs. Do not add
remote images, personal data, or keys.

## Branding and provenance

- `brand/palette.json` is a small snapshot of Factory's official light palette:
  Tungsten warm neutrals, `#FF5A00` accents, dark headlines, and a monochrome logo.
  The renderer rejects hex colors outside this palette.
- `brand/factory-lockup-black.png` is the official black lockup mirrored from
  `Factory-AI/factory-brand-guide`. Update it from that source, never redraw it.
- Fonts are bundled Roboto. This preserves the original rendering and keeps
  builds self-contained; it is not a claim of full Geist typography compliance.
- Fixed PDF metadata timestamps make repeat builds byte-identical. Tests cover
  pagination, selectable content, sponsor-track copy, CLI inputs, overflow
  protection, and deterministic output.

The Cal Hacks 13.0 track copy comes from the linked
[Hacker Guide, Sponsor Tracks](https://docs.google.com/document/d/1RQrueC9wm5u8uxtWSC2gadIchp05hVayhGUrIjxT9dE/edit?tab=t.0#heading=h.5mjfxw9sx02s),
read on October 22, 2026:

- Best Use of the Factory Droid SDK.
- Meaningful TypeScript or Python SDK use in the running product, not only
  code-writing assistance; explain where/how in the project README.
- $2,000 cash, Factory credits, and swag. Prizes are subject to change.

## Student-facing message and feedback decisions

The handout leads with building a product that uses an agent, rather than
using an agent only to write code. One concrete trip-planner flow explains
the idea. The next action is scan, run an example, and make it your own.
The competition is the incentive, not the headline.

Feedback on the earlier layout was handled as follows:

- Show TypeScript and Python in the main description and getting-started
  copy. Keep TypeScript as the default guide rather than suggesting equal
  maturity or claiming it is the only supported language.
- Replace feature-oriented numbered examples with a concrete product flow.
  Its four numbers describe sequential actions, not an API-feature checklist.
- Remove terminal setup commands and the long sample-data disclaimer from
  the flyer. The trip planner is illustrative, not a new shipped demo.
- Do not mechanically swap sections from the obsolete layout. Keep the
  intentional reading order: idea, example, start action, competition.
- The credits/voucher signup QR discussed by the event team is pending.
  The current QR deliberately links to the TypeScript SDK guide, and its
  label does not promise credit signup. Before printing, obtain the final
  approved signup destination, ensure it also leads students to both SDKs
  and examples, and update the QR, printed URL, and CTA together. Do not
  invent a voucher URL or claim credit redemption works.

Refresh event-specific copy and prize details before reusing the template
for another event. Demo code remains separate from this asset-only change.

Before printing, review the rendered PDF visually. Automated checks are not
a substitute for checking the logo, clipping, QR legibility, and readability.
