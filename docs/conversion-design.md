# Format Conversion Design

## Overview

The application supports three sequence diagram formats — **PlantUML**, **Mermaid**, and **Gliffy JSON** — with full bidirectional conversion between all pairs. All conversion logic lives in a single file, `public/converters.js`, exposed as `window.DiagramConverters`.

## Supported Formats

| Format | File ext. | Editor page | Rendering |
|---|---|---|---|
| PlantUML | `.puml` | `/` (`puml.html`) | Server-side via Kroki (Docker) |
| Mermaid | `.mmd` | `/mermaid` (`mermaid.html`) | Client-side via `mermaid.js` |
| Gliffy JSON | `.gliffy`, `.json` | `/gliffy` (`gliffy.html`) | Client-side: converted to Mermaid, then rendered via `mermaid.js` |

## Conversion Matrix

Six conversion functions cover every pair:

```
              PlantUML         Mermaid          Gliffy JSON
            ┌─────────────┬──────────────┬───────────────────┐
PlantUML    │     ---      │ plantumlTo   │ plantumlTo        │
            │              │ Mermaid      │ GliffyJson        │
            ├─────────────┼──────────────┼───────────────────┤
Mermaid     │ mermaidTo    │     ---      │ mermaidTo         │
            │ PlantUml     │              │ GliffyJson *      │
            ├─────────────┼──────────────┼───────────────────┤
Gliffy JSON │ gliffyJsonTo │ gliffyJsonTo │      ---          │
            │ PlantUml     │ Mermaid *    │                   │
            └─────────────┴──────────────┴───────────────────┘
```

Functions marked `*` are convenience wrappers that chain through PlantUML as an intermediate representation:

- `mermaidToGliffyJson(src)` = `plantumlToGliffyJson(mermaidToPlantUml(src))`
- `gliffyJsonToMermaid(jsonStr)` = `plantumlToMermaid(gliffyJsonToPlantUml(jsonStr))`

## Section Marker Conventions

Each format has its own native section marker syntax. Sections partition a diagram into logical groups (e.g. "Validation", "Processing") that the split-to-PNG features use.

| Format | Section marker syntax | Example |
|---|---|---|
| PlantUML | `== Section N: Title ==` | `== Section 1: Validation ==` |
| Mermaid | `%% == Section N: Title ==` (comment line) | `%% == Section 1: Validation ==` |
| Gliffy JSON | Top-level `"sections"` array | `"sections": [{"id":"1","title":"Validation","objectIds":[4,6]}]` |

All six converters preserve section markers by translating between these conventions:

- **PlantUML → Mermaid**: `== Section 1: Validation ==` becomes `%% == Section 1: Validation ==`
- **Mermaid → PlantUML**: `%% == Section 1: Validation ==` becomes `== Section 1: Validation ==`
- **PlantUML → Gliffy JSON**: Section markers are tracked during parsing; message object IDs are collected per section and emitted as a `"sections"` array in the output JSON
- **Gliffy JSON → PlantUML**: The `"sections"` array is read, a lookup from object ID to section is built, and `== Section N: Title ==` markers are emitted at section boundaries during message output

## Conversion Function Details

### `plantumlToMermaid(puml)`

Parses PlantUML source line by line. Handles:

| PlantUML construct | Mermaid output |
|---|---|
| `participant "Label" as Alias #color` | `participant Alias as Label` |
| `actor`, `database` | `actor` / `participant` (database→participant) |
| `A -> B : msg` | `A->>B: msg` |
| `A --> B : msg` (dashed) | `A-->>B: msg` |
| `A ->> B : msg` (async) | `A-)B: msg` |
| `== Section N: T ==` | `%% == Section N: T ==` |
| `note right of X : text` | `Note right of X: text` |
| Multi-line `note ... end note` | Joined with `<br/>` |
| `group Label` | `critical Label` |
| `alt`, `else`, `opt`, `loop`, `end`, etc. | Passed through |
| `activate` / `deactivate` | Passed through (deduplicated) |
| `skinparam`, `title`, `|||` | Dropped |

**Arrow mapping:**

| PlantUML arrow | Mermaid arrow | Meaning |
|---|---|---|
| `->` | `->>` | Synchronous |
| `-->` | `-->>` | Dashed/return |
| `->>` | `-)` | Asynchronous |

### `mermaidToPlantUml(src)`

Parses Mermaid source line by line. Handles:

| Mermaid construct | PlantUML output |
|---|---|
| `participant Alias as Label` | `participant "Label" as Alias` |
| `A->>B: msg` | `A -> B : msg` |
| `A-->>B: msg` | `A --> B : msg` |
| `A-)B: msg` | `A ->> B : msg` |
| `%% == Section N: T ==` | `== Section N: T ==` |
| `Note over/right of/left of` | `note over/right of/left of` |
| `alt`, `loop`, `end`, etc. | Passed through |
| Other `%%` comments | Dropped |

Wraps output in `@startuml` / `@enduml`.

### `gliffyJsonToPlantUml(jsonStr)`

Parses the Gliffy JSON `stage.objects` array to extract:

1. **Participants** — Objects whose `uid` contains `uml`, `sequence`, and `lifeline` (or `actor`). Sorted by `x` coordinate (left to right).
2. **Messages** — Objects with `graphic.type === 'Line'`. Source/target participants are resolved via `constraints.startConstraint.StartPositionConstraint.nodeId` / `endConstraint`. If constraints are missing, a **nearest-participant fallback** uses the line's absolute X start/end positions to find the closest participant by center position.
3. **Notes** — Objects whose `uid` contains `note`.

Messages are sorted by `y` coordinate (top to bottom). If a `sections` array is present in the JSON, section markers are emitted at section transitions by mapping each message's original Gliffy object ID to its section.

**Participant alias generation:** Non-alphanumeric characters are stripped from the name. If the resulting alias differs from the display name, a `participant "Display Name" as Alias` declaration is emitted.

### `plantumlToGliffyJson(puml)`

Builds a complete Gliffy JSON structure from PlantUML source:

1. **Parsing phase**: Extracts participants, messages, and sections. Handles `skinparam {}` blocks, multi-line notes, `#color` suffixes on aliases.
2. **Layout phase**: Places participants horizontally with 180px spacing. Messages are placed vertically at 60px intervals below an 80px header area.
3. **Object generation**: Each participant becomes a `Shape` object with a `Text` child. Each message becomes a `Line` object with `constraints` linking to source/target participant `nodeId`s and a `Text` child for the label. The `controlPath` direction is set based on whether the arrow goes left or right.
4. **Section tracking**: During parsing, each message index is recorded in the active section's `objectIds`. After creating Line objects, message indices are resolved to actual Gliffy object IDs. The `sections` array is added to the top-level JSON output if any sections were found.

**Output structure:**

```json
{
  "contentType": "application/gliffy+json",
  "version": "1.3",
  "metadata": { "title": "Sequence Diagram", ... },
  "stage": {
    "objects": [ /* participant Shapes + message Lines */ ],
    "background": "#FFFFFF",
    "width": ..., "height": ...,
    "layers": [{ "guid": "layer0", ... }],
    ...
  },
  "sections": [
    { "id": "1", "title": "Validation", "objectIds": [4, 6] },
    { "id": "2", "title": "Processing", "objectIds": [8, 10, 12] }
  ]
}
```

### `gliffyJsonToMermaid(jsonStr)` (chain)

```
Gliffy JSON → gliffyJsonToPlantUml → plantumlToMermaid → Mermaid
```

### `mermaidToGliffyJson(src)` (chain)

```
Mermaid → mermaidToPlantUml → plantumlToGliffyJson → Gliffy JSON
```

## Cross-Editor Navigation

When a user triggers a conversion from one editor to another (e.g. "Convert to Mermaid" button in the PlantUML editor), two functions handle the seamless handoff:

1. **`convertAndNavigate(content, targetEditor)`** — Stores the converted content in `localStorage` under `convert-payload` with a timestamp, then navigates to the target editor's URL.
2. **`checkConvertPayload()`** — Called on page load by each editor. If a payload exists and is less than 30 seconds old, it returns the content for the editor to load into CodeMirror.

## Helper Functions

| Function | Purpose |
|---|---|
| `stripHtml(html)` | Removes HTML tags and decodes `&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;` entities |
| `extractText(obj)` | Extracts plain text from a Gliffy object by finding the first `Text` child graphic |
| `extractGliffyInfo(jsonStr)` | Returns metadata about a Gliffy JSON document (title, version, object counts, participant names, message labels) for the info panel |

## File Location

All conversion code: `public/converters.js`

The file is included via `<script src="converters.js"></script>` in all three editor HTML pages. No server-side conversion is performed; all logic runs in the browser.
