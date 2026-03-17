# Checklist Icons (Icon-Only Production Set)

Source reviewed from:
- `/Users/nask/Documents/Feul App/SVG`

Target folder:
- `/Users/nask/Documents/Feul App/apps/driver-pwa/public/checklist-icons`

## Approved icons (copied + normalized)
- `air-conditioner.svg`
- `battery.svg`
- `body.svg`
- `brakes.svg`
- `fire-extinguisher.svg`
- `first-aid-box.svg`
- `fuel.svg`
- `high-flag.svg`
- `horn.svg`
- `indicators.svg`
- `jack.svg`
- `load-restraint.svg`
- `measuring-devices.svg`
- `mirrors.svg`
- `oil.svg`
- `plate-visible.svg`
- `radio.svg`
- `ras-sticker.svg`
- `reverse-alarm.svg`
- `safety-lock-fittings.svg`
- `seat-belt.svg`
- `speed-limiter.svg`
- `steering.svg`
- `tools.svg`
- `tyre-pressure.svg`
- `tyres-wheel-fixing.svg`
- `vehicle-registration-paper.svg`
- `water-level.svg`
- `wipers-windscreen.svg`

## Rejected icons
- `Breake.svg` (duplicate variant, typo)
- `Jack_Spanner.svg` (more decorative duplicate of `Jack.svg`)
- `Light.svg` (detailed/label-style variant; use `Lights.svg`)
- `Load_restraint.svg` (decorative duplicate of `load.svg`)
- `Measuring.svg` (heavier duplicate of `Measure.svg`)
- `Oil_Levels.svg` (detailed/label-style duplicate of `Oil.svg`)
- `Plate_Number.svg` (detailed/label-style duplicate)
- `Ras_Stiker.svg` (decorative duplicate + typo)
- `Tyre_fixing.svg` (detailed duplicate of `tyre.svg`)
- `VhReg.svg` (detailed/label-style duplicate)
- `Water_level.svg` (detailed duplicate of `Water.svg`)
- `fittings.svg` (heavier duplicate of `fitting.svg`)
- `horns.svg` (duplicate variant)
- `mirrors.svg` (duplicate variant not used in final mapped set)
- `reflectives.svg` (heavier duplicate of `reflective.svg`)
- `tape.svg` (not required in final paper-row mapping)
- `tools_box.svg` (not required; fallback handled by `tools.svg`)
- `tyre check.svg` (too detailed for small card rendering)
- `wipers.svg` (detailed duplicate of `Windscreen.svg`)

## Needs cleanup/redraw before final rollout
- Dedicated `fuse-box` icon (currently mapped to `tools.svg` fallback).

## Recommended render sizes
- Driver PWA checklist cards: `28px` (allow `32px` only if specific icon legibility fails)
- Admin read-only checklist report: `20px` to `24px` (default `22px`)
- Print/PDF: `18px` to `20px` (default `20px`)

## Rule
- Keep labels outside the icon in UI components.
- Do not embed words/text in icon assets.
