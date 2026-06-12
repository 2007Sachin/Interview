# Design Direction — “Aurora”

The app is a quiet, luminous space at night. A continuous plasma light field breathes behind
everything; the interface is set in near-darkness so the student's attention goes to the
voice, the question, and the light reacting to it. Nothing here should feel like a SaaS
dashboard — it should feel like stepping into a calm planetarium with one warm guide.

## Typography (the design)

| Role | Font | Source | Usage |
| --- | --- | --- | --- |
| Display | **Clash Display** (variable) | Fontshare | Questions, screen titles, the readiness word, oversized numerals. Weight 500–600, tight leading (1.05–1.15), `text-wrap: balance`. |
| Workhorse | **Satoshi** (variable) | Fontshare | Body, transcripts, buttons, labels. Labels are uppercase, 0.72rem, +0.14em tracking. |

Scale contrast is non-negotiable: display runs `clamp(2.2rem → 3.8rem)`; labels stay at
0.72rem — a >4× jump visible on every screen. No Inter, no Roboto, no system-ui for display.

## Palette (tokens only — `src/styles/tokens.css`)

| Token | Value | Meaning |
| --- | --- | --- |
| Canvas | `#0a0b16` / `#11132a` / `#181b38` | Deep-space layers (base / raised / sunken) |
| Neutrals | `#f1f0fb` / `#a9a7c9` / `#686a92` | Text hierarchy on dark |
| `--aurora-teal` `#5ee6c8` | Color 1 | Life: positive state, listening, success, focus |
| `--aurora-violet` `#8b7bf7` | Color 2 | Asha: primary actions, speaking state |
| `--aurora-magenta` `#f566c3` | Color 3 — THE accent | Rare. Recording, danger, celebration. ≤5 appearances per screen. |

Four colors max (three + neutrals). Everything else is darkness and glow.

## Signature element — **“the Beam”**

A 2px luminous gradient hairline (teal → violet → magenta) with a soft blur glow.
It appears on every screen, always meaning “energy flows here”:

- under every screen title (`.beam`)
- as the interview progress bar (`.progress-track`)
- as the mic level meter on the sound check
- as the top edge of key cards (`.beam-top`)
- as section rules in the report and its print version

If a screen has no Beam, it's off-direction.

## Layout point of view

Left-anchored, asymmetric, lots of night sky. Oversized ghost numerals (`Q·03`) sit behind
or beside content. The interview room is a stage: Beam across the top, giant question on the
left measure, orb holding the right, controls floating in dark glass at the bottom. No
centered-card-on-gradient screens; dark glass is allowed only for the floating control bar
and status pill.

## Motion personality — fluid and continuous

Aurora never snaps. Easing is long and smooth (`--ease-fluid`), durations 300–600ms,
ambient loops 25–40s. The orb is plasma: its glow and scale follow real audio amplitude
continuously (AnalyserNode, rAF, transform/opacity only). No overshoot, no bounce —
light doesn't bounce. Full `prefers-reduced-motion` variant: static field, instant reveals,
no sound.

## Craft details

Magenta text selection, aurora focus rings, styled scrollbars, designed error/empty states
(“This session drifted off into the dark”), themed favicon + page title + meta description,
print stylesheet that translates the direction to paper: ink on white with Beam rules in
color.

Second-pass refinements (stay on-direction when touching these):

- **Beam energy drift**: every Beam carries a bright pulse that travels its length every
  ~5s (transform-only). The Beam is alive, not a static rule.
- **Aurora arc**: a thin two-color arc ring orbits the orb on a 24s loop — the Beam's
  circular sibling. Static under reduced motion.
- **Star field**: a sparse static dot layer behind the plasma blobs; the whole layer
  twinkles on an 11s alternate loop.
- **Luminous ink**: the interview question's glyphs cool from white into lavender via
  background-clip — light passing through the text.
- **Numeral family**: ghost numerals (briefing, room, score, 404) and outlined `Q·01`
  mini-numerals on report cards, all tabular-nums.
- Teal caret + violet accent-color in inputs; control bar wears a Beam top edge.
