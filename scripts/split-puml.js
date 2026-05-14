#!/usr/bin/env node
//
// Splits a large PlantUML sequence diagram into section-based parts and
// optionally renders each part to PNG via Kroki.
//
// Usage:
//   node scripts/split-puml.js <input.puml> [options]
//
// Options:
//   --output-dir <dir>   Output directory (default: <input>_split/)
//   --kroki-url <url>    Kroki base URL (default: http://localhost:8000)
//   --png                Also generate PNG files via Kroki
//   --group <spec>       Section grouping spec, e.g. "1-3,4-5,6-8,9-10,11-12"
//   --max-lines <n>      Max content lines per group for auto-grouping (default: 60)
//                        Lower = shorter images, more parts. Ignored when --group is used.
//   --no-label           Omit the "Part X of Y — Section ..." note from split diagrams
//   --per-section        Split per section, also sub-splitting at ' @split markers
//   --header-notes <m>   Where to place top-level context notes (notes above the
//                        first section). One of: first | all | none.
//                        Default: first (only show in part 1).
//
// Examples:
//   node scripts/split-puml.js diagram.puml --png
//   node scripts/split-puml.js diagram.puml --max-lines 80 --png
//   node scripts/split-puml.js diagram.puml --group "1-3,4-5,6-8,9-10,11-12" --png
//   node scripts/split-puml.js diagram.puml --output-dir ./out --kroki-url http://myhost:8000 --png
//   node scripts/split-puml.js diagram.puml --png --no-label

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { png: false, maxLines: 60, label: true, perSection: false, headerNotes: 'first' };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--output-dir':   args.outputDir  = argv[++i]; break;
      case '--kroki-url':    args.krokiUrl   = argv[++i]; break;
      case '--group':        args.group      = argv[++i]; break;
      case '--max-lines':    args.maxLines   = parseInt(argv[++i], 10) || 60; break;
      case '--png':          args.png        = true;      break;
      case '--no-label':     args.label      = false;     break;
      case '--per-section':  args.perSection = true;      break;
      case '--header-notes': {
        const v = (argv[++i] || '').toLowerCase();
        if (v !== 'first' && v !== 'all' && v !== 'none') {
          console.error(`Invalid --header-notes value: ${v}. Must be one of: first, all, none`);
          process.exit(1);
        }
        args.headerNotes = v;
        break;
      }
      default:               positional.push(argv[i]);
    }
  }
  args.inputFile = positional[0];
  return args;
}

// ---------------------------------------------------------------------------
// PUML parsing helpers
// ---------------------------------------------------------------------------

const SECTION_RE = /^==\s*Section\s+/i;

function parsePuml(source) {
  const lines = source.split(/\r?\n/);

  let headerEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (SECTION_RE.test(lines[i].trim())) { headerEnd = i; break; }
  }
  if (headerEnd === -1) {
    console.error('No "== Section ..." markers found in the file.');
    process.exit(1);
  }

  // Header = everything before the first section (minus trailing blank/spacer lines)
  let h = headerEnd;
  while (h > 0 && /^\s*(\|\|\|)?\s*$/.test(lines[h - 1])) h--;
  const header = lines.slice(0, h);

  // Collect sections
  const sections = [];
  let current = null;
  for (let i = headerEnd; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (SECTION_RE.test(trimmed)) {
      if (current) sections.push(current);
      const m = trimmed.match(/^==\s*Section\s+([\w]+)[:\s]*(.*?)\s*==$/i);
      current = {
        id: m ? m[1] : String(sections.length + 1),
        title: m ? m[2].trim() : '',
        lines: [lines[i]],
      };
    } else if (trimmed === '@enduml') {
      // skip; we'll append it ourselves
    } else if (current) {
      current.lines.push(lines[i]);
    }
  }
  if (current) sections.push(current);

  // Trim trailing blank/spacer lines from each section
  for (const s of sections) {
    while (s.lines.length && /^\s*(\|\|\|)?\s*$/.test(s.lines[s.lines.length - 1])) {
      s.lines.pop();
    }
  }

  return { header, sections };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function normalizeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildGroups(sections, groupSpec, maxLines) {
  if (groupSpec) return parseGroupSpec(sections, groupSpec);
  return autoGroupByLines(sections, maxLines);
}

function parseGroupSpec(sections, spec) {
  const groups = [];
  for (const part of spec.split(',')) {
    const [startRaw, endRaw] = part.trim().split('-');
    const startNorm = normalizeId(startRaw);
    const endNorm = normalizeId(endRaw || startRaw);

    const startIdx = sections.findIndex(s => normalizeId(s.id) === startNorm);
    const endIdx   = sections.findIndex(s => normalizeId(s.id) === endNorm);

    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      console.error(`Invalid group range: ${part}  (available: ${sections.map(s => s.id).join(', ')})`);
      process.exit(1);
    }
    groups.push(sections.slice(startIdx, endIdx + 1));
  }
  return groups;
}

function autoGroupByLines(sections, maxLines = 60) {
  const groups = [];
  let current = [];
  let currentLines = 0;

  for (const sec of sections) {
    const secLines = sec.lines.length;
    if (current.length > 0 && currentLines + secLines > maxLines) {
      groups.push(current);
      current = [sec];
      currentLines = secLines;
    } else {
      current.push(sec);
      currentLines += secLines;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

// ---------------------------------------------------------------------------
// Participant filtering
// ---------------------------------------------------------------------------

const PARTICIPANT_RE = /^(participant|actor|database)\s+(?:"[^"]*"\s+as\s+)?(\S+)/i;

const PUML_NOTE_BLOCK_START_RE = /^(?:r|h)?note\s+(?:over|left|right|across)\b(?!.*:)/i;
const PUML_NOTE_AS_RE = /^(?:r|h)?note\s+(?:as|"[^"]*"\s+as)\b/i;
const PUML_NOTE_INLINE_RE = /^(?:r|h)?note\s+(?:over|left|right|across|of)\b.*:/i;
const PUML_NOTE_END_RE = /^end\s*note\b|^endnote\b/i;

function classifyPreamble(preambleLines) {
  const essential = [];
  const notes = [];
  let inBlock = false;
  let buffer = [];
  for (const line of preambleLines) {
    const t = line.trim();
    if (inBlock) {
      buffer.push(line);
      if (PUML_NOTE_END_RE.test(t)) {
        notes.push(buffer);
        buffer = [];
        inBlock = false;
      }
    } else if (PUML_NOTE_INLINE_RE.test(t)) {
      notes.push([line]);
    } else if (PUML_NOTE_BLOCK_START_RE.test(t) || PUML_NOTE_AS_RE.test(t)) {
      inBlock = true;
      buffer = [line];
    } else {
      essential.push(line);
    }
  }
  if (inBlock) essential.push(...buffer);
  return { essential, notes };
}

function shouldIncludeHeaderNotes(mode, partIndex) {
  if (mode === 'all') return true;
  if (mode === 'none') return false;
  return partIndex === 0;
}

function parseHeader(header) {
  const preamble = [];
  const participants = [];
  for (const line of header) {
    const m = line.trim().match(PARTICIPANT_RE);
    if (m) {
      participants.push({ alias: m[2], line });
    } else {
      preamble.push(line);
    }
  }
  const { essential, notes } = classifyPreamble(preamble);
  return { preamble, essential, notes, participants };
}

function findUsedParticipants(participants, sectionGroup) {
  const content = sectionGroup.map(s => s.lines.join('\n')).join('\n');
  return participants.filter(p => {
    const re = new RegExp('\\b' + p.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    return re.test(content);
  });
}

// ---------------------------------------------------------------------------
// Sub-splitting at @split markers
// ---------------------------------------------------------------------------

const SPLIT_MARKER_RE = /^'\s*@split/i;

const BLOCK_START_RE = /^(group|opt|alt|loop|par|break|critical|ref)\b/i;
// Match a bare "end" line ONLY (with optional inline comment).
// Must NOT match "end note", "endif", "end ref", etc.
const BLOCK_END_RE = /^end\s*(?:'.*)?$/i;
const SECTION_MARKER_RE = /^==\s+/;

function balanceChunk(lines) {
  let depth = 0;
  const prefix = [];
  const suffix = [];
  const firstContent = lines.find(l => l.trim());
  const startsWithElse = firstContent && /^else\b/i.test(firstContent.trim());
  for (const l of lines) {
    const t = l.trim();
    if (BLOCK_END_RE.test(t)) depth--;
    if (BLOCK_START_RE.test(t)) depth++;
  }
  if (startsWithElse) {
    prefix.push('alt continued');
    depth++;
  }
  while (depth > 0) { suffix.push('end'); depth--; }
  while (depth < 0) { prefix.push('group continued'); depth++; }
  return [...prefix, ...lines, ...suffix];
}

function subSplitAtMarkers(section) {
  const chunks = [[]];
  for (const line of section.lines) {
    if (SPLIT_MARKER_RE.test(line.trim())) {
      chunks.push([]);
    } else {
      chunks[chunks.length - 1].push(line);
    }
  }
  const hasContent = l => {
    const t = l.trim();
    return t && t !== '|||' && !SECTION_MARKER_RE.test(t) && !BLOCK_END_RE.test(t);
  };
  return chunks.filter(c => c.some(hasContent));
}

function buildPerSectionParts(header, sections, opts = {}) {
  const { essential, notes: headerNotes, participants } = parseHeader(header);
  const headerNotesMode = opts.headerNotes || 'first';
  const headerNotesContent = headerNotes.flat().join('\n');
  const parts = [];
  let partNum = 0;

  for (const sec of sections) {
    const subParts = subSplitAtMarkers(sec);
    const effectiveParts = subParts.length > 0 ? subParts : [sec.lines.filter(l => !SPLIT_MARKER_RE.test(l.trim()))];

    for (let cIdx = 0; cIdx < effectiveParts.length; cIdx++) {
      partNum++;
      const includeNotes = shouldIncludeHeaderNotes(headerNotesMode, partNum - 1);
      const rawChunk = effectiveParts[cIdx];
      const chunk = balanceChunk(rawChunk);
      const lookupContent = includeNotes ? chunk.join('\n') + '\n' + headerNotesContent : chunk.join('\n');
      const used = participants.filter(p => {
        const re = new RegExp('\\b' + p.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        return re.test(lookupContent);
      });
      const effectiveUsed = used.length > 0 ? used : participants;

      const out = [];
      out.push(...essential);
      for (const p of effectiveUsed) out.push(p.line);
      out.push('');

      if (includeNotes) {
        for (const note of headerNotes) out.push(...note);
        if (headerNotes.length) out.push('');
      }

      if (opts.label !== false) {
        const subLabel = effectiveParts.length > 1 ? String.fromCharCode(97 + cIdx) : '';
        const labelText = `Section ${sec.id}${subLabel}`;
        const firstAlias = effectiveUsed.length > 0 ? effectiveUsed[0].alias : 'CSR';
        const lastAlias = effectiveUsed.length > 1 ? effectiveUsed[effectiveUsed.length - 1].alias : firstAlias;
        out.push(`note over ${firstAlias}, ${lastAlias}`);
        out.push(`    **${labelText}** — ${sec.title}${subLabel ? ' (part ' + (cIdx + 1) + '/' + effectiveParts.length + ')' : ''}`);
        out.push('end note');
        out.push('');
      }

      out.push(...chunk);
      out.push('');
      out.push('@enduml');

      const subLabel = effectiveParts.length > 1 ? String.fromCharCode(97 + cIdx) : '';
      parts.push({
        partNum,
        id: sec.id + subLabel,
        title: sec.title,
        puml: out.join('\n'),
      });
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// PUML assembly
// ---------------------------------------------------------------------------

function assemblePuml(header, sectionGroup, partNum, totalParts, { label: showLabel = true, headerNotes: headerNotesMode = 'first' } = {}) {
  const ids = sectionGroup.map(s => s.id);

  const { essential, notes: headerNotes, participants } = parseHeader(header);
  const includeNotes = shouldIncludeHeaderNotes(headerNotesMode, partNum - 1);
  const headerNotesContent = headerNotes.flat().join('\n');

  const sectionContent = sectionGroup.map(s => s.lines.join('\n')).join('\n');
  const lookupContent = includeNotes ? sectionContent + '\n' + headerNotesContent : sectionContent;
  const used = participants.filter(p => {
    const re = new RegExp('\\b' + p.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    return re.test(lookupContent);
  });

  const out = [];
  out.push(...essential);
  for (const p of used) out.push(p.line);
  out.push('');

  if (includeNotes) {
    for (const note of headerNotes) out.push(...note);
    if (headerNotes.length) out.push('');
  }

  if (showLabel) {
    const labelText = ids.length === 1 ? `Section ${ids[0]}` : `Sections ${ids[0]}-${ids[ids.length - 1]}`;
    const titles = sectionGroup.map(s => s.title).filter(Boolean).join(', ');
    const firstAlias = used.length > 0 ? used[0].alias : 'CSR';
    const lastAlias = used.length > 1 ? used[used.length - 1].alias : firstAlias;
    out.push(`note over ${firstAlias}, ${lastAlias}`);
    out.push(`    **Part ${partNum} of ${totalParts}** — ${labelText}: ${titles}`);
    out.push(`end note`);
    out.push('');
  }

  for (let i = 0; i < sectionGroup.length; i++) {
    out.push(...sectionGroup[i].lines);
    if (i < sectionGroup.length - 1) out.push('');
  }

  out.push('');
  out.push('@enduml');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Kroki PNG rendering
// ---------------------------------------------------------------------------

function fetchPng(krokiBaseUrl, pumlSource) {
  const pngUrl = krokiBaseUrl.replace(/\/+$/, '') + '/plantuml/png';
  const parsed = new URL(pngUrl);
  const transport = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(pngUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
    }, (res) => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => reject(new Error(`Kroki returned ${res.statusCode}: ${body}`)));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(pumlSource);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);

  if (!args.inputFile) {
    console.error('Usage: node split-puml.js <input.puml> [--output-dir dir] [--kroki-url url] [--group spec] [--max-lines N] [--png]');
    process.exit(1);
  }

  const inputPath = path.resolve(args.inputFile);
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(inputPath, 'utf-8');
  const { header, sections } = parsePuml(source);

  console.log(`Parsed ${sections.length} sections: ${sections.map(s => s.id).join(', ')}`);
  for (const s of sections) {
    console.log(`  Section ${s.id.padEnd(4)} ${String(s.lines.length).padStart(4)} lines  ${s.title}`);
  }

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputDir = path.resolve(args.outputDir || `${path.dirname(inputPath)}/${baseName}_split`);
  fs.mkdirSync(outputDir, { recursive: true });

  const krokiUrl = args.krokiUrl || 'http://localhost:8000';
  const manifest = [];

  if (args.perSection) {
    const parts = buildPerSectionParts(header, sections, { label: args.label, headerNotes: args.headerNotes });
    console.log(`\nPer-section split: ${parts.length} parts (with @split markers)`);

    for (const p of parts) {
      const fileName = `${baseName}_sec${p.id}`;
      const pumlPath = path.join(outputDir, `${fileName}.puml`);
      fs.writeFileSync(pumlPath, p.puml, 'utf-8');
      console.log(`  [${p.partNum}/${parts.length}] Wrote ${pumlPath}`);

      if (args.png) {
        try {
          const png = await fetchPng(krokiUrl, p.puml);
          const pngPath = path.join(outputDir, `${fileName}.png`);
          fs.writeFileSync(pngPath, png);
          console.log(`  [${p.partNum}/${parts.length}] Rendered ${pngPath} (${(png.length / 1024).toFixed(0)} KB)`);
          manifest.push({ part: p.partNum, section: p.id, puml: pumlPath, png: pngPath });
        } catch (err) {
          console.error(`  [${p.partNum}/${parts.length}] PNG render failed: ${err.message}`);
          manifest.push({ part: p.partNum, section: p.id, puml: pumlPath, png: null, error: err.message });
        }
      } else {
        manifest.push({ part: p.partNum, section: p.id, puml: pumlPath });
      }
    }
  } else {
    const groups = buildGroups(sections, args.group, args.maxLines);

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const partNum = i + 1;
      const ids = group.map(s => s.id);
      const fileName = `${baseName}_part${partNum}_sec${ids.join('-')}`;

      const puml = assemblePuml(header, group, partNum, groups.length, { label: args.label, headerNotes: args.headerNotes });
      const pumlPath = path.join(outputDir, `${fileName}.puml`);
      fs.writeFileSync(pumlPath, puml, 'utf-8');
      console.log(`  [${partNum}/${groups.length}] Wrote ${pumlPath}`);

      if (args.png) {
        try {
          const png = await fetchPng(krokiUrl, puml);
          const pngPath = path.join(outputDir, `${fileName}.png`);
          fs.writeFileSync(pngPath, png);
          console.log(`  [${partNum}/${groups.length}] Rendered ${pngPath} (${(png.length / 1024).toFixed(0)} KB)`);
          manifest.push({ part: partNum, sections: ids, puml: pumlPath, png: pngPath });
        } catch (err) {
          console.error(`  [${partNum}/${groups.length}] PNG render failed: ${err.message}`);
          manifest.push({ part: partNum, sections: ids, puml: pumlPath, png: null, error: err.message });
        }
      } else {
        manifest.push({ part: partNum, sections: ids, puml: pumlPath });
      }
    }
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\nDone. ${manifest.length} parts written to ${outputDir}`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
