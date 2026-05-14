# Sequence Diagram Editor

A web-based diagram editor supporting **PlantUML**, **Mermaid**, and **Gliffy JSON** sequence diagrams. Features live preview, three-way format conversion, section-based splitting for PNG export, collapsible sections, diagram sharing, and one-click editor switching.

## Features

- **Three editors** -- PlantUML (via [Kroki](https://kroki.io/)), Mermaid (client-side [Mermaid.js](https://mermaid.js.org/)), and Gliffy JSON (converted to Mermaid for rendering)
- **Live editor** with syntax highlighting (CodeMirror), auto-render, and configurable debounce
- **SVG preview** with zoom (mouse wheel + buttons), fit-to-view, and pan
- **Three-way format conversion** -- PlantUML, Mermaid, and Gliffy JSON, with section marker translation
- **Section collapse/expand** -- toggle sections in the preview via a side gutter, and fold sections and blocks in the editor
- **Split PNG export** -- export diagrams as multiple PNGs in a ZIP, split by line count or by individual section
- **Diagram sharing** via URL-encoded links (small diagrams) or server-stored short IDs (large diagrams)
- **Export** to SVG and PNG
- **Dark/light theme** toggle, persisted across sessions
- **Editor content caching** in localStorage (survives page reloads)
- **Collapsible panels** -- maximize editor or preview independently
- **Drag & drop** `.puml` / `.mmd` / `.gliffy` files directly onto the page
- **Configurable Kroki API URL** via Settings
- **Centralized configuration** -- all settings in a single `.env` file
- **Flexible deployment** -- Docker, Docker Compose, or Vercel (with Upstash Redis)

## Project Structure

```
Sequence_Diagram_Editor/
├── public/                       # Static frontend files
│   ├── puml.html                 # PlantUML editor (served at /)
│   ├── mermaid.html              # Mermaid sequence diagram editor (/mermaid)
│   ├── gliffy.html               # Gliffy JSON editor (/gliffy)
│   ├── editor.html               # Legacy standalone editor (/editor.html)
│   ├── toolbar.css               # Shared toolbar and UI styles
│   └── converters.js             # Three-way format conversion logic
├── lib/                          # Server-side modules
│   ├── storage.js                # Storage abstraction (filesystem or Upstash Redis)
│   └── api-routes.js             # Share API Express router
├── scripts/                      # CLI and shell helpers
│   ├── split-puml.js             # CLI tool to split PlantUML diagrams
│   ├── start_kroki.sh            # Start Kroki container
│   ├── start_editor.sh           # Build & start editor container
│   └── restart_editor.sh         # Rebuild & restart editor container
├── docs/                         # Design documentation
│   ├── conversion-design.md      # Conversion matrix and section markers
│   └── split-logic-design.md     # Split/export pipeline design
├── api/                          # Vercel serverless functions
│   └── index.js                  # Share API for Vercel deployment
├── data/                         # Shared diagram storage (runtime, gitignored)
├── server.js                     # Express server
├── package.json
├── .env                          # Configuration (gitignored)
├── .env.example                  # Template for .env
├── deploy.sh                     # Build & deploy script
├── Dockerfile
├── docker-compose.yml
├── vercel.json                   # Vercel deployment config
├── DEPLOYMENT.md                 # Deployment guide
├── .gitignore
└── .dockerignore
```

## Prerequisites

- **Docker** and **Docker Compose** (for containerized deployment)
- **Kroki** running (for PlantUML rendering -- the Mermaid and Gliffy editors do not need it)

## Quick Start

### 1. Configure

Copy `.env.example` to `.env` and edit as needed:

```bash
cp .env.example .env
```

Key settings in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8001` | Server listen port |
| `CONTAINER_NAME` | `seq-diag-editor` | Docker container name |
| `IMAGE_NAME` | `seq-diag-editor` | Docker image name |
| `KROKI_PORT` | `8000` | Kroki container port |
| `KROKI_CONTAINER` | `kroki-plantuml` | Kroki container name |
| `KROKI_IMAGE` | `yuzutech/kroki` | Kroki Docker image |
| `PLANTUML_LIMIT_SIZE` | `16384` | PlantUML max image dimension |
| `SHARE_TTL_DAYS` | `5` | Auto-delete shared diagrams older than N days (0 = disabled) |
| `SHARE_MAX_FILES` | `100` | Max stored shared diagrams (0 = unlimited) |
| `SHARE_MAX_SIZE_MB` | `20` | Max total storage in MB (0 = unlimited) |
| `UPSTASH_REDIS_REST_URL` | *(blank)* | Upstash Redis URL (blank = use filesystem) |
| `UPSTASH_REDIS_REST_TOKEN` | *(blank)* | Upstash Redis token |
| `HTTP_PROXY` | *(blank)* | HTTP proxy (for builds behind corporate proxy) |
| `HTTPS_PROXY` | *(blank)* | HTTPS proxy |
| `NO_PROXY` | `localhost,127.0.0.1` | Proxy bypass list |

### 2. Start Kroki

```bash
bash scripts/start_kroki.sh
```

### 3. Build & Start the Editor

```bash
bash deploy.sh
```

All scripts source `.env` automatically.

### 4. Access

| URL | Description |
|-----|-------------|
| `http://<host>:<PORT>/` | PlantUML editor (default landing page) |
| `http://<host>:<PORT>/mermaid` | Mermaid sequence diagram editor |
| `http://<host>:<PORT>/gliffy` | Gliffy JSON editor |
| `http://<host>:<PORT>/editor.html` | Legacy standalone editor |

Use the tab bar at the top to switch between PlantUML, Mermaid, and Gliffy editors.

## Editors

### PlantUML Editor (`/`)

- Renders via Kroki (configurable API URL in Settings)
- Supports **any PlantUML diagram type** -- sequence, component, class, state, activity, deployment, use-case, object, timing, mind map, WBS, gantt, JSON, YAML, etc. Kroki's `/plantuml` endpoint is diagram-agnostic.
- Supports `.puml`, `.plantuml`, `.pu`, `.txt`, `.wsd` files
- File browser sidebar for managing multiple diagrams
- Split export with configurable max lines per group
- Code folding for both sequence blocks (`alt`, `opt`, `loop`, `group`, ...) and container blocks (`package { ... }`, `node { ... }`, `frame { ... }`, etc.)

> Note: section-based features (Section PNGs, gutter collapse, Convert to Mermaid/Gliffy) target sequence diagrams. They auto-hide or disable for non-sequence sources.

### Mermaid Editor (`/mermaid`)

- Client-side rendering using Mermaid.js -- no Kroki dependency
- Supports `.mmd`, `.mermaid`, `.txt` files
- Zoom bar with keyboard and mouse wheel zoom

### Gliffy JSON Editor (`/gliffy`)

- Renders Gliffy JSON by converting to Mermaid internally
- Supports `.gliffy`, `.json` files
- **Diagram / Info** toggle to switch between rendered preview and JSON metadata panel
- **Format** button to pretty-print the JSON

## Format Conversion

All three editors support converting between formats via the **Convert** dropdown menu. Section markers are preserved and translated across formats.

### Conversion Matrix

| From \ To | PlantUML | Mermaid | Gliffy JSON |
|-----------|----------|---------|-------------|
| **PlantUML** | -- | Convert > To Mermaid | Convert > To Gliffy JSON |
| **Mermaid** | Convert > To PlantUML | -- | Convert > To Gliffy JSON |
| **Gliffy JSON** | Convert > To PlantUML | Convert > To Mermaid | -- |

### Supported Syntax Conversions

| Concept | PlantUML | Mermaid | Gliffy JSON |
|---------|----------|---------|-------------|
| Participant | `participant Alice` | `participant Alice` | `"text": "Alice"` object |
| Actor | `actor Bob` | `actor Bob` | Actor graphic object |
| Sync message | `Alice -> Bob: msg` | `Alice->>Bob: msg` | Constraint with `"type": "MessageFlow"` |
| Return/dashed | `Alice --> Bob: msg` | `Alice-->>Bob: msg` | Dashed constraint |
| Note | `note right of A: text` | `Note right of A: text` | Note object |
| Alt/else/loop/opt/group | `alt cond ... else ... end` | `alt cond ... else ... end` | Group objects |
| Activate | `activate A` | `activate A` | Activation bar |

### Gliffy / Confluence Workflow

**Export to Confluence:**
1. Write your diagram in any editor
2. Convert to Mermaid (if not already)
3. Copy the Mermaid code
4. In Confluence: edit page > insert Gliffy macro > **Create from code** > **Mermaid** > paste

**Import from Confluence:**
1. In Confluence, open the Gliffy diagram > copy the Mermaid source or export as `.gliffy`
2. Use the **Convert** menu or open the file directly in the appropriate editor

### Section Marker Conventions

Sections partition a diagram into logical parts. Each format uses its own marker syntax, and conversions translate between them:

| Format | Section Marker Syntax |
|--------|-----------------------|
| PlantUML | `== Section <id>: <title> ==` |
| Mermaid | `%% == Section <id>: <title> ==` |
| Gliffy JSON | `"sections": [{ "id": "<id>", "title": "<title>", ... }]` |

## Split PNG Export

All three editors support exporting diagrams as multiple PNG images packaged in a ZIP file, useful for embedding in documents (e.g., Word).

### Split Modes

| Mode | Description |
|------|-------------|
| **Split PNGs (ZIP)** | Groups diagram content by line count (configurable in Settings) |
| **Section PNGs (ZIP)** | Splits at section markers -- one PNG per `== Section ==` |

### CLI Split Tool

For batch processing, a CLI tool is available:

```bash
node scripts/split-puml.js input.puml --png --output-dir ./output
```

Options: `--max-lines`, `--group`, `--kroki-url`, `--output-dir`, `--png`.

## Section Collapse & Expand

### Preview (Side Gutter)

When a diagram contains section markers, a gutter appears on the left side of the preview with toggle buttons aligned to each section divider. Click a toggle to collapse or expand that section's content in the rendered diagram. **Collapse All** / **Expand All** buttons appear in the preview header.

### Editor (Code Folding)

The CodeMirror editor supports folding via the gutter fold markers or `Ctrl+Q`:

- **Section folding** -- fold at `== ... ==` (PlantUML) or `%% == ... ==` (Mermaid) markers
- **Block folding** -- fold `group`, `alt`, `opt`, `loop`, `par`, `critical`, `break` blocks (PlantUML and Mermaid)
- **JSON folding** -- brace/bracket folding in the Gliffy JSON editor

## Sharing Diagrams

Click the **Share** button in the toolbar to generate a shareable link. All editors support sharing.

### Dual-mode Sharing

| Mode | How it works | When used |
|------|-------------|-----------|
| **URL encoding** | Diagram compressed with pako + base64url into the URL hash | Diagram size <= configured limit (default 2000 chars) |
| **Server storage** | Diagram saved on server with a short ID | Diagram size > limit |

Share mode is configurable in **Settings** (Auto / URL only / Server only).

### Shared Link Formats

- `http://<host>:<PORT>/#puml=<encoded>` -- PlantUML, URL-encoded
- `http://<host>:<PORT>/mermaid#mmd=<encoded>` -- Mermaid, URL-encoded
- `http://<host>:<PORT>/#id=<shortId>` -- server-stored (any editor)

## Share API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/share` | POST | Save diagram (JSON `{ content }` or raw text), returns `{ id }` |
| `/api/share/:id` | GET | Retrieve diagram `{ content, created }` |
| `/api/share/:id` | DELETE | Delete a specific shared diagram |
| `/api/share/cleanup/expired` | DELETE | Manually trigger TTL cleanup |

Payload limit: 2 MB.

## Client-side Settings

Accessible via the **Settings** button in the toolbar (persisted in localStorage):

- Kroki PlantUML API URL (PlantUML editor only)
- Auto-render debounce (PlantUML editor only)
- Split export max lines per group
- Share mode (Auto / URL only / Server only)
- URL encoding size limit (chars)

## Storage

The server supports two storage backends, configured via environment variables:

| Backend | When used | Config |
|---------|-----------|--------|
| **Filesystem** | Default; stores JSON files in `data/` | No additional config needed |
| **Upstash Redis** | When `UPSTASH_REDIS_REST_URL` is set | Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` |

## Cleanup Strategy

Shared diagrams are managed by three mechanisms:

1. **Auto-expire (TTL)** -- hourly scheduled job deletes diagrams older than `SHARE_TTL_DAYS`
2. **Storage caps** -- on every new share, oldest entries are evicted if `SHARE_MAX_FILES` or `SHARE_MAX_SIZE_MB` is exceeded
3. **Manual API** -- `DELETE /api/share/:id` or `DELETE /api/share/cleanup/expired`

## Deployment

### Docker (recommended)

```bash
bash deploy.sh
```

See `DEPLOYMENT.md` for detailed instructions.

### Local Development (without Docker)

```bash
npm install
node server.js
```

Runs on `http://localhost:8001`. Requires Kroki running separately for PlantUML rendering.

### Vercel

The project includes `vercel.json` and `api/index.js` for serverless deployment. Requires Upstash Redis for diagram sharing storage. See `DEPLOYMENT.md` for setup details.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Render diagram |
| `Ctrl+S` | Save to disk |
| `Ctrl+Q` | Toggle fold at cursor |
| `Ctrl+Scroll` | Zoom preview |
| `Escape` | Close modals/popovers |

## Design Documentation

Detailed design notes are available in the `docs/` directory:

- `docs/conversion-design.md` -- conversion matrix, `converters.js` architecture, section marker translation
- `docs/split-logic-design.md` -- split/export pipeline, section markers per format, rendering flow
