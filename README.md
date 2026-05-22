# Vertical Mixer Card

A Home Assistant Lovelace custom card that renders **mixing-console style
vertical sliders** for any `number` or `input_number` entity. Group
entities side by side just like channel strips on a real mixer, with
tick marks, a unity (0 dB) reference line, and per-channel accent
colors.

![preview](docs/preview.png)

> **Why?** Built originally to drive bass / treble / channel-level trims
> on a Sony STR-DN1080 AV receiver via its companion Home Assistant
> integration ([ha-sony-dn1080][sony]), but the card itself is
> completely generic — point it at any `number`/`input_number` entity
> and it adapts to that entity's own range, step, and unit.

[sony]: https://github.com/Gorke07/ha-sony-dn1080

## Features

- **Domain agnostic** — works with `number.*` and `input_number.*`. Min,
  max, step, and unit are read from each entity's state attributes at
  runtime, so the card doesn't need per-entity configuration of bounds.
- **Mixer aesthetic** — tick marks on both sides of every track, longer
  ticks at major intervals (auto-sized to the entity's range), an
  optional dashed unity line at 0 (or any reference value you pick),
  endpoint labels at the track top and bottom.
- **Smooth dragging** — pointer-capture-based custom slider, so the
  thumb stays under your finger / cursor even if you drag off the
  track. Debounced service calls (180 ms) so a fast drag does not
  flood the receiver / helper with requests.
- **Grouping** — arrange entities into named groups (e.g. `Front`,
  `Center`, `Surround`, `Sub`); each group renders as its own bordered
  card-within-card.
- **Per-entity accent color** — mushroom palette names
  (`red`, `orange`, `amber`, `green`, `cyan`, `blue`, `purple`, …) or
  any CSS color string.
- **Theme-aware** — uses Home Assistant CSS variables, so it
  automatically follows your theme (light / dark / mushroom etc.).
- **Visual editor** — basic GUI editor for groups, entities, labels,
  and colors in the dashboard editor.

## Installation

### HACS (recommended)

1. In HACS go to **Frontend** → **⋮** → **Custom repositories**.
2. Add this repository URL, category **Lovelace**.
3. Install **Vertical Mixer Card**.
4. HACS adds the resource for you. If not, add it manually:
   `/hacsfiles/lovelace-vertical-mixer-card/vertical-mixer-card.js`,
   type `module`.

### Manual

1. Download `vertical-mixer-card.js` from the latest release.
2. Copy it to `<config>/www/vertical-mixer-card.js`.
3. In Home Assistant: **Settings → Dashboards → Resources → Add**,
   URL `/local/vertical-mixer-card.js`, type **JavaScript Module**.
4. Hard-refresh the dashboard (Ctrl+Shift+R).

## Configuration

### Card

| Option           | Type             | Default | Description |
|------------------|------------------|---------|-------------|
| `type`           | string           | —       | `custom:vertical-mixer-card` |
| `title`          | string           | —       | Optional title shown above the mixer |
| `slider_height`  | number (px)      | `180`   | Track height in pixels |
| `unity_value`    | number \| `null` | `0`     | Value at which to draw the unity reference line. Set `null` to hide |
| `show_ticks`     | boolean          | `true`  | Draw tick marks alongside the track |
| `show_endpoints` | boolean          | `true`  | Show min/max labels at track ends |
| `groups`         | list             | —       | **Required.** List of channel groups (see below) |

### Group

| Option     | Type   | Default | Description |
|------------|--------|---------|-------------|
| `name`     | string | —       | Group title (uppercase, small text) |
| `entities` | list   | —       | **Required.** Entities to render as channel strips |

### Entity

Each entry under `entities[]` may be a bare entity-id string, or an
object:

| Option   | Type   | Default                   | Description |
|----------|--------|---------------------------|-------------|
| `entity` | string | —                         | **Required.** A `number.*` or `input_number.*` entity |
| `label`  | string | last segment of entity-id | Label shown below the slider |
| `color`  | string | `--primary-color`         | Accent color — mushroom palette name (`orange`, `cyan`, `purple`, …) or a raw CSS color |

## Example

```yaml
type: custom:vertical-mixer-card
title: Sony DN1080 Mixer
slider_height: 170
groups:
  - name: Front
    entities:
      - entity: number.sony_dn1080_front_left_level
        label: L
        color: orange
      - entity: number.sony_dn1080_front_right_level
        label: R
        color: orange
      - entity: number.sony_dn1080_front_bass_level
        label: Bass
        color: deep-orange
      - entity: number.sony_dn1080_front_treble_level
        label: Treble
        color: cyan
  - name: Center
    entities:
      - entity: number.sony_dn1080_center_level
        label: C
        color: amber
      - entity: number.sony_dn1080_center_bass_level
        label: Bass
        color: deep-orange
      - entity: number.sony_dn1080_center_treble_level
        label: Treble
        color: cyan
  - name: Sub
    entities:
      - entity: number.sony_dn1080_subwoofer_level
        label: Sub
        color: blue
```

## Accepted color names

`red`, `deep-orange`, `orange`, `amber`, `yellow`, `lime`, `green`,
`teal`, `cyan`, `light-blue`, `blue`, `indigo`, `deep-purple`,
`purple`, `pink`, `brown`, `grey` — plus any CSS color string (hex,
rgb, named, …).

## Development

The card is a single ES6 module file with no build step. To iterate:

1. Edit `vertical-mixer-card.js`.
2. Copy it into `<config>/www/`.
3. Bump the version query string in the resource URL (`?v=N`) so the
   browser reloads it.

## License

MIT — see [LICENSE](LICENSE).
