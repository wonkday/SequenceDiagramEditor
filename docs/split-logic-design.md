# Split PNG Export Design

## Overview

Each of the three editors (PlantUML, Mermaid, Gliffy) supports splitting a large sequence diagram into multiple smaller PNG images, packaged as a ZIP download. This is designed for embedding diagrams into Word documents where a single massive image would be impractical.

Two export modes are available in every editor:

| Mode | Button label | Behavior |
|---|---|---|
| **Grouped split** | Split PNGs (ZIP) | Groups consecutive sections by a configurable limit, producing fewer (but larger) images |
| **Per-section split** | Section PNGs (ZIP) | Produces one image per section marker, also sub-splitting at `@split` markers within sections |

## Split Point Markers (`@split`)

Users can place fine-grained split points **within** a section using `@split` markers. These are comment lines that are invisible in the rendered diagram but tell the "Section PNGs" export where to break a large section into multiple images.

### Marker Syntax

| Format | Comment syntax | Example |
|---|---|---|
| PlantUML | `' @split` | `' @split` or `' @split: After validation` |
| Mermaid | `%% @split` | `%% @split` or `%% @split: After cart creation` |
| Gliffy JSON | N/A | JSON does not support comments; convert to PlantUML or Mermaid for marker support |

### Interactive UX (Editor)

Users do not need to type markers manually. Two interactive methods are provided:

1. **Gutter click** (breakpoint-style) — A `split-markers` gutter column appears to the right of the fold gutter. Clicking it toggles a scissors icon and inserts/removes the `@split` comment in the source.
2. **Toolbar button** — "Toggle Split Marker" in the Export dropdown inserts/removes a marker at the current cursor line.

Lines containing `@split` markers are highlighted with a subtle orange background in the editor.

### How Markers Affect Export

The **Section PNGs (ZIP)** export is enhanced to sub-split at `@split` markers:

- A section with 0 markers produces 1 image (unchanged behavior)
- A section with N markers produces N+1 images
- Sub-parts are labeled with letter suffixes: `Section 3a`, `Section 3b`, `Section 3c`

The **Split PNGs (ZIP)** (grouped by line count) mode is unchanged and ignores `@split` markers.

### CLI Support

The CLI tool `scripts/split-puml.js` supports `@split` markers via `--per-section`:

```bash
node scripts/split-puml.js diagram.puml --per-section --png
```

It also accepts `--header-notes <first|all|none>` to control how top-level context notes are placed across split parts (default: `first`):

```bash
# Header notes only in the first split image (default)
node scripts/split-puml.js diagram.puml --per-section --png

# Repeat header notes in every split image (legacy behavior)
node scripts/split-puml.js diagram.puml --per-section --png --header-notes all

# Strip header notes entirely
node scripts/split-puml.js diagram.puml --per-section --png --header-notes none
```

## Section Marker Conventions

Each format uses its own native section marker, parsed independently by that editor's split logic:

| Format | Marker syntax | Example |
|---|---|---|
| PlantUML | `== Section N: Title ==` | `== Section 3: Checkout ==` |
| Mermaid | `%% == Section N: Title ==` | `%% == Section 3: Checkout ==` |
| Gliffy JSON | `"sections"` array in top-level JSON | `{"id":"3","title":"Checkout","objectIds":[10,12]}` |

If a diagram has no section markers, the split buttons show an error and do nothing.

## Architecture

### Rendering Pipeline

| Editor | How each split part is rendered to PNG |
|---|---|
| PlantUML | Each part is POST'd to the Kroki server (`/plantuml/png`) which returns a PNG blob |
| Mermaid | Each part is rendered client-side via `mermaid.render()` → SVG → `svgToPngBlob()` → PNG blob |
| Gliffy | Each part's filtered JSON is converted to Mermaid via `DiagramConverters.gliffyJsonToMermaid()`, then rendered the same as Mermaid |

### `svgToPngBlob(svgString)` — Client-Side SVG-to-PNG Conversion

This async helper (implemented independently in both `mermaid.html` and `gliffy.html`) converts an SVG string to a PNG Blob:

1. Create an offscreen `<div>`, set `innerHTML` to the SVG string, extract the `<svg>` element
2. Serialize the SVG to XML via `XMLSerializer`
3. Encode as a `data:image/svg+xml;base64,...` URL
4. Load into an `Image` element
5. Draw onto a `<canvas>` at **2x resolution** (for crisp output on retina displays)
6. Return a PNG `Blob` via `canvas.toBlob('image/png')`

### ZIP Packaging

All editors use [JSZip](https://stuk.github.io/jszip/) (loaded from CDN) to package the split PNGs. Each ZIP contains:

- One `.png` file per split part
- One source file per part (`.puml`, `.mmd`, or `.gliffy`) containing the diagram text for that part

## PlantUML Split Logic (`puml.html`)

### Section Parsing

Both `splitPumlBySections` and `splitPumlPerSection` share the same parsing approach:

1. **Find header boundary**: Scan lines for the first `== Section ...` marker. Everything before it is the header.
2. **Separate preamble from participants**: The header is split into non-participant lines (preamble: `@startuml`, `title`, `skinparam`, etc.) and participant declarations (`participant`, `actor`, `database`).
3. **Collect sections**: Starting from the first section marker, group lines into section objects `{ id, title, lines[] }`. Trailing blank lines and `|||` spacers are trimmed.

### Participant Filtering

For each split part, only participant declarations whose alias appears in that part's message lines are included. This reduces image width by omitting unused lifelines. The alias is matched using a word-boundary regex.

### Header Note Handling

Notes that appear above the first `== Section ==` marker (typically context/overview notes) would otherwise be repeated in every split image. To avoid this, the preamble is classified into **essential** lines (`@startuml`, `title`, `skinparam`, `!theme`, comments, blanks) and **header notes** (`note over X`, `note left of X`, `hnote`, `rnote`, `note as N1` ... `end note`, plus single-line variants).

The behavior is controlled by a setting with three modes:

| Mode | Behavior |
|---|---|
| `first` (default) | Header notes appear only in part 1 of the split |
| `all` | Header notes are repeated in every part (legacy behavior) |
| `none` | Header notes are stripped from all split parts |

Participants referenced inside the header notes are still declared in any part that includes those notes (via the same word-boundary regex). The localStorage key is `puml-split-header-notes` and the matching CLI flag is `--header-notes <first|all|none>`.

### `splitPumlBySections(source, maxLinesPerGroup)`

Groups consecutive sections until the cumulative line count exceeds `maxLinesPerGroup` (default: 80, configurable in Settings). Each group becomes a standalone PlantUML diagram with:

- The preamble
- Only the participants referenced in that group
- A `note over` banner showing "Part N of M — Sections X-Y: Titles"
- The section lines
- `@enduml`

**Output:** `[{ partNum, ids[], label, titles, puml }]`

**ZIP filenames:** `{baseName}_part{N}_sec{ids}.png`, `{baseName}_part{N}_sec{ids}.puml`
**ZIP name:** `{baseName}_sections.zip`

### `splitPumlPerSection(source)`

Same parsing, but each section maps 1:1 to a part — no grouping, no `maxLines` logic. Additionally, within each section, lines matching `' @split` are treated as sub-split boundaries, producing multiple parts from a single section (labeled with letter suffixes like `3a`, `3b`).

**Output:** `[{ partNum, id, label, title, puml }]`

**ZIP filenames:** `{baseName}_sec{id}.png`, `{baseName}_sec{id}.puml`
**ZIP name:** `{baseName}_per_section.zip`

### Settings

| Key | localStorage key | Default | UI element |
|---|---|---|---|
| Max lines per group | `puml-split-max-lines` | 80 | `cfgSplitMaxLines` input in Settings modal |
| Show part label note | `puml-split-label` | true | `cfgSplitLabel` checkbox in Settings modal |
| Header notes mode | `puml-split-header-notes` | `first` | `cfgSplitHeaderNotes` select in Settings modal |

## Mermaid Split Logic (`mermaid.html`)

### Section Parsing

Uses the same structural approach as PlantUML but with Mermaid-specific patterns:

| Constant | Pattern | Purpose |
|---|---|---|
| `SECTION_RE` | `/^%%\s*==\s*Section\s+/i` | Detect section comment lines |
| `MMD_PARTICIPANT_RE` | `/^\s*participant\s+(\S+)/i` | Extract participant alias |
| `MMD_ACTOR_RE` | `/^\s*actor\s+(\S+)/i` | Extract actor alias |
| `MMD_MSG_RE` | `/(\S+?)\s*(?:->>|-->>|-\))\s*(\S+?)\s*:/` | Extract from/to aliases from messages |

### Participant Filtering

`findUsedAliases(contentLines, declaredParticipants)` scans the content lines for message arrows matching `MMD_MSG_RE` and returns only the participant declarations whose alias appears as a sender or receiver.

### Header Note Handling

Same as PlantUML: notes in the preamble (lines matching `Note over A,B: ...` / `Note left of A: ...` / `Note right of A: ...` that appear above the first section marker) are classified separately and shown in the first part only by default. The localStorage key is `mmd-split-header-notes`.

### `splitMermaidBySections(source, maxLinesPerGroup)`

Groups sections by cumulative line count (default: 80). Each group becomes a complete Mermaid diagram starting with `sequenceDiagram`, the filtered participant declarations, a `Note over` label, and the section content lines (with section marker comments removed).

**Output:** `[{ partNum, ids[], label, titles, mmd }]`

**ZIP filenames:** `{baseName}_part{N}_sec{ids}.png`, `{baseName}_part{N}_sec{ids}.mmd`
**ZIP name:** `{baseName}_sections.zip`

### `splitMermaidPerSection(source)`

One diagram per section, no grouping. Additionally, within each section, lines matching `%% @split` are treated as sub-split boundaries, producing multiple parts from a single section (labeled with letter suffixes like `3a`, `3b`).

**Output:** `[{ partNum, id, label, title, mmd }]`

**ZIP filenames:** `{baseName}_sec{id}.png`, `{baseName}_sec{id}.mmd`
**ZIP name:** `{baseName}_per_section.zip`

### Settings

| Key | localStorage key | Default | UI element |
|---|---|---|---|
| Max lines per group | `mmd-split-max-lines` | 80 | `cfgSplitMaxLines` input in Settings modal |
| Show part label note | `mmd-split-label` | true | `cfgSplitLabel` checkbox in Settings modal |
| Header notes mode | `mmd-split-header-notes` | `first` | `cfgSplitHeaderNotes` select in Settings modal |

## Gliffy JSON Split Logic (`gliffy.html`)

### Section Parsing

Gliffy sections are defined structurally in the JSON, not as text markers. `parseGliffySections(jsonStr)` reads the top-level `sections` array and builds lookup structures:

- `objById` — maps object IDs to their full objects from `stage.objects`
- `participantIds` — set of all non-Line object IDs (participant shapes)
- `messageObjs` — array of Line objects (messages)

### Filtered JSON Construction

`buildFilteredGliffyJson(doc, objById, participantIds, messageIds)` creates a new Gliffy JSON document containing only:

1. The message objects specified by `messageIds`
2. The participant objects connected to those messages (determined via `constraints.startConstraint.nodeId` / `endConstraint.nodeId`)
3. If no constraints are found, all participants are included as a fallback

The `sections` key is removed from filtered output since each part represents a subset.

### `splitGliffyBySections(jsonStr, maxMessages)`

Groups sections by cumulative `objectIds.length` (message count) with a default threshold of 20. Each group produces a filtered Gliffy JSON document.

**Output:** `[{ partNum, ids[], label, titles, gliffy }]`

**ZIP filenames:** `{baseName}_part{N}_sec{ids}.png`, `{baseName}_part{N}_sec{ids}.gliffy`
**ZIP name:** `{baseName}_sections.zip`

### `splitGliffyPerSection(jsonStr)`

One filtered JSON document per section entry, no grouping.

**Output:** `[{ partNum, id, label, title, gliffy }]`

**ZIP filenames:** `{baseName}_sec{id}.png`, `{baseName}_sec{id}.gliffy`
**ZIP name:** `{baseName}_per_section.zip`

### Rendering

`renderGliffyToSvg(gliffyJsonStr)` converts a Gliffy JSON string to Mermaid via `DiagramConverters.gliffyJsonToMermaid()`, then renders via `mermaid.render()`. This is not a format conversion for the split logic itself — it is purely the rendering step (Gliffy has no native browser renderer).

### Settings

| Key | localStorage key | Default | UI element |
|---|---|---|---|
| Max messages per group | `gliffy-split-max-messages` | 20 | `cfgSplitMaxMessages` input in Settings modal |

## Comparison of Split Modes

| Aspect | Split PNGs (grouped) | Section PNGs (individual) |
|---|---|---|
| Grouping | Groups sections up to a configurable limit | No grouping — 1 section = 1 PNG (unless `@split` markers subdivide it) |
| `@split` markers | Ignored | Respected — sub-splits sections at marker points |
| Configurable | Yes (max lines / max messages in Settings) | No settings needed |
| Image count | Fewer, larger images | More, smaller images |
| Best for | Embedding a few images per page in Word | Granular control, one image per topic |
| File naming | `_part{N}_sec{ids}` | `_sec{id}` (with letter suffix for sub-parts: `_sec3a`) |
| ZIP naming | `_sections.zip` | `_per_section.zip` |

## Error Handling

All split export handlers follow the same pattern:

1. Check editor is not empty
2. Parse sections; if none found, show error status
3. Verify JSZip is loaded
4. Iterate parts, render each, catch per-part failures
5. If all parts fail, show error and abort
6. Otherwise, generate and download ZIP, reporting how many succeeded/failed

## File Locations

| File | Split functions |
|---|---|
| `public/puml.html` | `splitPumlBySections`, `splitPumlPerSection` |
| `public/mermaid.html` | `splitMermaidBySections`, `splitMermaidPerSection`, `svgToPngBlob` |
| `public/gliffy.html` | `splitGliffyBySections`, `splitGliffyPerSection`, `svgToPngBlob`, `renderGliffyToSvg` |

Each editor's split logic is **fully standalone** — it parses its own native format directly without converting to another format first. The only cross-format dependency is Gliffy's rendering step, which uses Mermaid.js as a renderer (not as a split mechanism).
