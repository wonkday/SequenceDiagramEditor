// Shared diagram format conversion functions
// Used by PlantUML, Mermaid, and Gliffy editors
window.DiagramConverters = (function () {

  // =========================================================================
  // PlantUML -> Mermaid
  // =========================================================================
  function plantumlToMermaid(puml) {
    const lines = puml.split('\n');
    const out = ['sequenceDiagram'];

    let inNote = false;
    let noteHeader = null;
    let noteBody = [];
    let lastTo = null;
    const activeSet = new Set();
    const participantAliases = [];

    function flushNote() {
      if (noteHeader && noteBody.length > 0) {
        out.push(`    ${noteHeader}: ${noteBody.join('<br/>')}`);
      } else if (noteBody.length > 0) {
        for (const nl of noteBody) out.push(`    %% ${nl}`);
      }
      inNote = false;
      noteHeader = null;
      noteBody = [];
    }

    for (let line of lines) {
      let l = line.trim();
      if (!l || /^@start|^@end/i.test(l)) continue;
      if (/^title\b/i.test(l)) continue;
      if (/^skinparam\b/i.test(l)) continue;
      if (/^\|\|\|$/.test(l)) continue;

      const sectionMatch = l.match(/^==\s*(.+?)\s*==\s*$/);
      if (sectionMatch) {
        out.push(`    %% == ${sectionMatch[1]} ==`);
        if (participantAliases.length >= 2) {
          out.push(`    Note over ${participantAliases[0]},${participantAliases[participantAliases.length - 1]}: == ${sectionMatch[1]} ==`);
        }
        continue;
      }

      if (/^end\s*note/i.test(l)) { flushNote(); continue; }
      if (inNote) { if (l) noteBody.push(l); continue; }

      const aliasMatch = l.match(/^(participant|actor|database)\s+"([^"]+)"\s+as\s+(\S+)(\s+#[0-9A-Fa-f]+)?/i);
      if (aliasMatch) {
        const type = aliasMatch[1].toLowerCase() === 'database' ? 'participant' : aliasMatch[1];
        participantAliases.push(aliasMatch[3]);
        out.push(`    ${type} ${aliasMatch[3]} as ${aliasMatch[2]}`);
        continue;
      }

      if (/^(participant|actor|database)\s+/i.test(l)) {
        const m = l.match(/^(participant|actor|database)\s+(.+?)(\s+#[0-9A-Fa-f]+)?$/i);
        if (m) {
          const type = m[1].toLowerCase() === 'database' ? 'participant' : m[1];
          const name = m[2].trim();
          const alias = name.includes(' as ') ? name.split(' as ')[0].trim() : name;
          participantAliases.push(alias);
          out.push(`    ${type} ${name}`);
        }
        continue;
      }

      const noteInline = l.match(/^note\s+(right\s+of|left\s+of|over)\s+(.+?)\s*:\s*(.+)/i);
      if (noteInline) {
        out.push(`    Note ${noteInline[1]} ${noteInline[2]}: ${noteInline[3]}`);
        continue;
      }

      const noteMultiOf = l.match(/^note\s+(right\s+of|left\s+of|over)\s+(.+)/i);
      if (noteMultiOf) {
        inNote = true;
        noteHeader = `Note ${noteMultiOf[1]} ${noteMultiOf[2]}`;
        noteBody = [];
        continue;
      }

      if (/^note\s+(right|left)\s*$/i.test(l)) {
        const dir = l.match(/^note\s+(right|left)/i)[1].toLowerCase();
        inNote = true;
        noteHeader = lastTo ? `Note ${dir} of ${lastTo}` : null;
        noteBody = [];
        continue;
      }

      if (/^group\b/i.test(l)) {
        out.push('    ' + l.replace(/^group\b/i, 'critical'));
        continue;
      }

      if (/^(alt|else|opt|loop|par|critical|break|end)\b/i.test(l)) {
        out.push('    ' + l);
        continue;
      }

      const actMatch = l.match(/^(activate|deactivate)\s+(\S+)/i);
      if (actMatch) {
        const action = actMatch[1].toLowerCase();
        const who = actMatch[2];
        if (action === 'activate' && !activeSet.has(who)) {
          activeSet.add(who);
          out.push('    ' + l);
        } else if (action === 'deactivate' && activeSet.has(who)) {
          activeSet.delete(who);
          out.push('    ' + l);
        }
        continue;
      }

      const arrowMatch = l.match(/^(\S+)\s*(--?>?>?|<--?<?|\.\.>|-\\\\>|-\/>|->>)\s*(\S+)\s*:\s*(.*)$/);
      if (arrowMatch) {
        const [, from, arrow, to, msg] = arrowMatch;
        lastTo = to;
        let mermaidArrow;
        if (arrow === '-->') mermaidArrow = '-->>';
        else if (arrow === '->>') mermaidArrow = '-)';
        else mermaidArrow = '->>';
        out.push(`    ${from}${mermaidArrow}${to}: ${msg}`);
        continue;
      }

      if (l) out.push('    %% ' + l);
    }

    return out.join('\n');
  }

  // =========================================================================
  // Mermaid -> PlantUML
  // =========================================================================
  function mermaidToPlantUml(src) {
    const lines = src.split('\n');
    const out = ['@startuml'];

    for (let line of lines) {
      let l = line.trim();
      if (!l || /^sequenceDiagram$/i.test(l)) continue;
      const sectionComment = l.match(/^%%\s*==\s*(.+?)\s*==\s*$/);
      if (sectionComment) {
        out.push(`== ${sectionComment[1]} ==`);
        continue;
      }
      if (/^%%/.test(l)) continue;

      const aliasMatch = l.match(/^(participant|actor)\s+(\S+)\s+as\s+(.+)/i);
      if (aliasMatch) {
        out.push(`${aliasMatch[1]} "${aliasMatch[3].trim()}" as ${aliasMatch[2]}`);
        continue;
      }
      if (/^(participant|actor)\s+/i.test(l)) { out.push(l); continue; }

      const noteMatch = l.match(/^Note\s+(right\s+of|left\s+of|over)\s+(.+)/i);
      if (noteMatch) {
        if (/:\s*==\s*.+\s*==\s*$/.test(l)) continue;
        out.push(`note ${noteMatch[1]} ${noteMatch[2]}`);
        continue;
      }
      if (/^end\s*note/i.test(l)) { out.push('end note'); continue; }
      if (/^(alt|else|opt|loop|par|critical|break|group|end)\b/i.test(l)) { out.push(l); continue; }
      if (/^(activate|deactivate)\s+/i.test(l)) { out.push(l); continue; }

      const arrowMatch = l.match(/^(\S+?)(--?>>|--?>|-)([)>])(\S+?):\s*(.*)$/);
      if (arrowMatch) {
        const [, from, arrowStart, arrowEnd, to, msg] = arrowMatch;
        const full = arrowStart + arrowEnd;
        const puml = full === '-->>' ? '-->' : full === '-)' ? '->>' : '->';
        out.push(`${from} ${puml} ${to} : ${msg}`);
        continue;
      }
      const s = l.match(/^(\S+?)->>(\S+?):\s*(.*)$/);
      if (s) { out.push(`${s[1]} -> ${s[2]} : ${s[3]}`); continue; }
      const d = l.match(/^(\S+?)-->>(\S+?):\s*(.*)$/);
      if (d) { out.push(`${d[1]} --> ${d[2]} : ${d[3]}`); continue; }
      const a = l.match(/^(\S+?)-\)(\S+?):\s*(.*)$/);
      if (a) { out.push(`${a[1]} ->> ${a[2]} : ${a[3]}`); continue; }
      if (l) out.push(l);
    }

    out.push('@enduml');
    return out.join('\n');
  }

  // =========================================================================
  // Gliffy JSON -> PlantUML
  // =========================================================================
  function stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
  }

  function extractText(obj) {
    if (!obj || !obj.children) return '';
    for (const child of obj.children) {
      if (child && child.graphic && child.graphic.type === 'Text' && child.graphic.Text) {
        return stripHtml(child.graphic.Text.html || '');
      }
    }
    return '';
  }

  function gliffyJsonToPlantUml(jsonStr) {
    let data;
    try {
      data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    } catch (e) {
      return '@startuml\n\' Error: Invalid Gliffy JSON\n@enduml';
    }

    const objects = (data.stage && data.stage.objects) || [];
    const participants = [];
    const messages = [];
    const notes = [];
    const idMap = {};

    for (const obj of objects) {
      if (!obj || obj.hidden) continue;
      idMap[obj.id] = obj;
      const uid = (obj.uid || '').toLowerCase();
      const gType = obj.graphic && obj.graphic.type;
      const text = extractText(obj);

      if (uid.includes('uml') && uid.includes('sequence') && uid.includes('lifeline')) {
        participants.push({ id: obj.id, name: text || `P${obj.id}`, x: obj.x });
      } else if (uid.includes('uml') && uid.includes('sequence') && uid.includes('actor')) {
        participants.push({ id: obj.id, name: text || `Actor${obj.id}`, x: obj.x, isActor: true });
      } else       if (gType === 'Line') {
        const line = obj.graphic.Line;
        const constraints = obj.constraints || {};
        let startNode = constraints.startConstraint &&
          constraints.startConstraint.StartPositionConstraint &&
          constraints.startConstraint.StartPositionConstraint.nodeId;
        let endNode = constraints.endConstraint &&
          constraints.endConstraint.EndPositionConstraint &&
          constraints.endConstraint.EndPositionConstraint.nodeId;
        const label = extractText(obj);
        const isDashed = line && line.dashStyle && line.dashStyle !== null;
        const cp = (line && line.controlPath) || [];
        const lineStartX = obj.x + (cp[0] ? cp[0][0] : 0);
        const lineEndX = obj.x + (cp[1] ? cp[1][0] : 0);
        messages.push({ objId: obj.id, from: startNode, to: endNode, label, y: obj.y, isDashed, lineStartX, lineEndX });
      } else if (uid.includes('note')) {
        notes.push({ text, y: obj.y, x: obj.x });
      } else if (uid.includes('rectangle') || uid.includes('basic')) {
        if (text && !uid.includes('line') && !uid.includes('arrow')) {
          participants.push({ id: obj.id, name: text, x: obj.x });
        }
      }
    }

    participants.sort((a, b) => a.x - b.x);
    messages.sort((a, b) => a.y - b.y);

    function findNearestParticipant(xPos) {
      let best = null, bestDist = Infinity;
      for (const p of participants) {
        const center = p.x + 60;
        const dist = Math.abs(xPos - center);
        if (dist < bestDist) { bestDist = dist; best = p; }
      }
      return best;
    }

    const out = ['@startuml'];
    const aliasMap = {};

    for (const p of participants) {
      const alias = p.name.replace(/[^a-zA-Z0-9_]/g, '') || `P${p.id}`;
      aliasMap[p.id] = alias;
      const keyword = p.isActor ? 'actor' : 'participant';
      if (alias !== p.name) {
        out.push(`${keyword} "${p.name}" as ${alias}`);
      } else {
        out.push(`${keyword} ${alias}`);
      }
    }

    out.push('');

    const sectionDefs = data.sections || [];
    const sectionByObjId = {};
    for (const sec of sectionDefs) {
      for (const oid of (sec.objectIds || [])) {
        sectionByObjId[oid] = sec;
      }
    }
    let currentSecId = null;

    for (const msg of messages) {
      const sec = sectionByObjId[msg.objId];
      if (sec && sec.id !== currentSecId) {
        currentSecId = sec.id;
        const marker = sec.title ? `Section ${sec.id}: ${sec.title}` : `Section ${sec.id}`;
        out.push(`== ${marker} ==`);
      }
      let fromAlias = aliasMap[msg.from];
      let toAlias = aliasMap[msg.to];
      if (!fromAlias && msg.lineStartX != null) {
        const p = findNearestParticipant(msg.lineStartX);
        if (p) fromAlias = aliasMap[p.id];
      }
      if (!toAlias && msg.lineEndX != null) {
        const p = findNearestParticipant(msg.lineEndX);
        if (p) toAlias = aliasMap[p.id];
      }
      if (!fromAlias || !toAlias) continue;
      const arrow = msg.isDashed ? '-->' : '->';
      out.push(`${fromAlias} ${arrow} ${toAlias} : ${msg.label || ''}`);
    }

    if (notes.length > 0) {
      out.push('');
      for (const n of notes) {
        if (n.text) out.push(`note right : ${n.text}`);
      }
    }

    out.push('@enduml');
    return out.join('\n');
  }

  // =========================================================================
  // Gliffy JSON -> Mermaid (convenience)
  // =========================================================================
  function gliffyJsonToMermaid(jsonStr) {
    return plantumlToMermaid(gliffyJsonToPlantUml(jsonStr));
  }

  // =========================================================================
  // PlantUML -> Gliffy JSON
  // =========================================================================
  function plantumlToGliffyJson(puml) {
    const lines = puml.split('\n');
    const participants = [];
    const messages = [];
    let inSkinparamBlock = false;
    let inNote = false;
    const sections = [];
    let currentSection = null;

    for (const line of lines) {
      const l = line.trim();
      if (!l || /^@start|^@end|^title\b/i.test(l)) continue;
      if (/^skinparam\b/i.test(l)) {
        if (l.includes('{')) inSkinparamBlock = true;
        continue;
      }
      if (inSkinparamBlock) {
        if (l.includes('}')) inSkinparamBlock = false;
        continue;
      }
      if (/^\|\|\|$/.test(l)) continue;
      const secMatch = l.match(/^==\s*(.+?)\s*==\s*$/);
      if (secMatch) {
        if (currentSection) sections.push(currentSection);
        const sm = secMatch[1].match(/^Section\s+([\w]+)[:\s]*(.*)/i);
        currentSection = {
          id: sm ? sm[1] : String(sections.length + 1),
          title: sm ? sm[2].trim() : secMatch[1],
          objectIds: [],
        };
        continue;
      }
      if (/^end\s*note/i.test(l)) { inNote = false; continue; }
      if (inNote) continue;
      if (/^note\b/i.test(l)) {
        if (!l.includes(':')) inNote = true;
        continue;
      }
      if (/^(activate|deactivate|alt|else|opt|loop|end|group|critical|break|par)\b/i.test(l)) continue;

      const pMatch = l.match(/^(participant|actor|database)\s+"([^"]+)"\s+as\s+(\S+)/i);
      if (pMatch) {
        const alias = pMatch[3].replace(/#[0-9A-Fa-f]+$/, '');
        participants.push({ type: pMatch[1].toLowerCase(), label: pMatch[2], alias });
        continue;
      }
      const pSimple = l.match(/^(participant|actor|database)\s+(\S+)/i);
      if (pSimple) {
        const alias = pSimple[2].replace(/#[0-9A-Fa-f]+$/, '');
        participants.push({ type: pSimple[1].toLowerCase(), label: alias, alias });
        continue;
      }

      const arrowMatch = l.match(/^(\S+)\s*(--?>?>?|->>)\s*(\S+)\s*:\s*(.*)$/);
      if (arrowMatch) {
        const msgIdx = messages.length;
        messages.push({
          from: arrowMatch[1],
          to: arrowMatch[3],
          label: arrowMatch[4],
          isDashed: arrowMatch[2].startsWith('--'),
        });
        if (currentSection) currentSection.objectIds.push(msgIdx);
      }
    }
    if (currentSection) sections.push(currentSection);

    const SPACING_X = 180;
    const SPACING_Y = 60;
    const HEADER_H = 40;
    const LIFELINE_TOP = 80;
    const BOX_W = 120;
    let nextId = 0;
    const layerId = 'layer0';
    const objects = [];
    const aliasToIdx = {};
    const aliasToId = {};

    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const pId = nextId++;
      aliasToIdx[p.alias] = i;
      aliasToId[p.alias] = pId;
      const x = 40 + i * SPACING_X;

      objects.push({
        x, y: 20, rotation: 0, id: pId,
        uid: 'com.gliffy.shape.uml.uml_v2.sequence.lifeline',
        width: BOX_W, height: HEADER_H, lockAspectRatio: false, lockShape: false,
        order: objects.length, hidden: false,
        graphic: {
          type: 'Shape',
          Shape: {
            tid: 'com.gliffy.stencil.rectangle.basic_v1',
            strokeWidth: 2, strokeColor: '#333333', fillColor: '#E3F2FD',
            gradient: false, dropShadow: false, state: 0, opacity: 1,
          },
        },
        children: [{
          x: 2, y: 0, rotation: 0, id: nextId++, uid: null,
          width: 116, height: 14, lockAspectRatio: false, lockShape: false,
          order: 'auto', hidden: false,
          graphic: {
            type: 'Text',
            Text: {
              tid: null, valign: 'middle', overflow: 'none', vposition: 'none', hposition: 'none',
              html: `<p style="text-align:center;"><span style="font-size:12px;">${p.label}</span></p>`,
              paddingLeft: 0, paddingRight: 0, paddingBottom: 8, paddingTop: 8,
              outerPaddingLeft: 6, outerPaddingRight: 6, outerPaddingBottom: 2, outerPaddingTop: 6,
            },
          },
          children: null, layerId,
        }],
        layerId, linkMap: [],
      });
    }

    const msgIdxToObjId = {};
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const fromIdx = aliasToIdx[msg.from];
      const toIdx = aliasToIdx[msg.to];
      if (fromIdx === undefined || toIdx === undefined) continue;

      const fromId = aliasToId[msg.from];
      const toId = aliasToId[msg.to];
      const halfBox = BOX_W / 2;
      const fromX = 40 + fromIdx * SPACING_X + halfBox;
      const toX = 40 + toIdx * SPACING_X + halfBox;
      const y = LIFELINE_TOP + i * SPACING_Y;
      const lineW = Math.abs(toX - fromX) || 80;
      const goesRight = toX >= fromX;
      const lineObjId = nextId++;
      msgIdxToObjId[i] = lineObjId;

      const lineObj = {
        x: Math.min(fromX, toX), y, rotation: 0, id: lineObjId,
        uid: 'com.gliffy.shape.uml.uml_v2.sequence.message',
        width: lineW, height: 1,
        lockAspectRatio: false, lockShape: false,
        order: objects.length, hidden: false,
        graphic: {
          type: 'Line',
          Line: {
            strokeWidth: 1, strokeColor: '#000000', fillColor: 'none',
            dashStyle: msg.isDashed ? [4, 4] : null,
            startArrow: 0, endArrow: 2,
            startArrowRotation: 'auto', endArrowRotation: 'auto',
            ortho: false, interpolationType: 'linear', cornerRadius: null,
            controlPath: goesRight ? [[0, 0], [lineW, 0]] : [[lineW, 0], [0, 0]],
            lockSegments: {},
          },
        },
        constraints: {
          startConstraint: {
            type: 'StartPositionConstraint',
            StartPositionConstraint: {
              nodeId: fromId, px: 0.5, py: 0.5,
            },
          },
          endConstraint: {
            type: 'EndPositionConstraint',
            EndPositionConstraint: {
              nodeId: toId, px: 0.5, py: 0.5,
            },
          },
        },
        children: msg.label ? [{
          x: 0, y: 0, rotation: 0, id: nextId++, uid: null,
          width: 100, height: 14, lockAspectRatio: false, lockShape: false,
          order: 'auto', hidden: false,
          graphic: {
            type: 'Text',
            Text: {
              tid: null, valign: 'middle', overflow: 'both', vposition: 'none', hposition: 'none',
              html: `<p style="text-align:center;"><span style="font-size:11px;">${msg.label}</span></p>`,
              paddingLeft: 0, paddingRight: 0, paddingBottom: 2, paddingTop: 2,
              outerPaddingLeft: 6, outerPaddingRight: 6, outerPaddingBottom: 2, outerPaddingTop: 6,
            },
          },
          children: null, layerId,
        }] : [],
        layerId, linkMap: [],
      };
      objects.push(lineObj);
    }

    const resolvedSections = sections.map(sec => ({
      id: sec.id,
      title: sec.title,
      objectIds: sec.objectIds.map(idx => msgIdxToObjId[idx]).filter(id => id !== undefined),
    }));

    const totalW = Math.max(400, 40 + participants.length * SPACING_X + 40);
    const totalH = Math.max(300, LIFELINE_TOP + messages.length * SPACING_Y + 80);

    const result = {
      contentType: 'application/gliffy+json',
      version: '1.3',
      metadata: {
        title: 'Sequence Diagram', revision: 0, exportBorder: false,
        loadPosition: 'default',
        libraries: ['com.gliffy.libraries.uml.uml_v2.sequence'],
        autosaveDisabled: false,
      },
      embeddedResources: { index: 0, resources: [] },
      stage: {
        objects,
        background: '#FFFFFF',
        width: totalW, height: totalH, maxWidth: 5000, maxHeight: 5000,
        nodeIndex: nextId, autoFit: true, exportBorder: false,
        gridOn: true, snapToGrid: true, drawingGuidesOn: true,
        shapeStyles: {}, lineStyles: {}, textStyles: {}, themeData: null,
        viewportType: 'default',
        layers: [{ guid: layerId, order: 0, name: 'Layer 0', active: true, locked: false, visible: true, nodeIndex: nextId }],
        fitBB: { min: { x: 20, y: 20 }, max: { x: totalW, y: totalH } },
        printModel: { pageSize: 'Letter', portrait: true, fitToOnePage: false, displayPageBreaks: false },
      },
    };
    if (resolvedSections.length > 0) result.sections = resolvedSections;
    return JSON.stringify(result, null, 2);
  }

  // =========================================================================
  // Mermaid -> Gliffy JSON (convenience)
  // =========================================================================
  function mermaidToGliffyJson(src) {
    return plantumlToGliffyJson(mermaidToPlantUml(src));
  }

  // =========================================================================
  // Cross-editor navigation helper
  // =========================================================================
  function convertAndNavigate(content, targetEditor) {
    localStorage.setItem('convert-payload', JSON.stringify({
      target: targetEditor,
      content: content,
      timestamp: Date.now(),
    }));
    window.location.href = targetEditor === 'plantuml' ? '/' :
      targetEditor === 'mermaid' ? '/mermaid' : '/gliffy';
  }

  function checkConvertPayload() {
    const raw = localStorage.getItem('convert-payload');
    if (!raw) return null;
    localStorage.removeItem('convert-payload');
    try {
      const payload = JSON.parse(raw);
      if (Date.now() - payload.timestamp < 30000) return payload;
    } catch (e) { /* ignore */ }
    return null;
  }

  // =========================================================================
  // Gliffy JSON info extraction (for info panel)
  // =========================================================================
  function extractGliffyInfo(jsonStr) {
    let data;
    try {
      data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    } catch (e) {
      return { valid: false, error: 'Invalid JSON' };
    }
    if (!data.stage || !data.stage.objects) {
      return { valid: false, error: 'Not a Gliffy diagram (no stage.objects)' };
    }
    const objects = data.stage.objects;
    let shapes = 0, lines = 0, texts = 0;
    const participantNames = [];
    const messageLabels = [];

    for (const obj of objects) {
      if (!obj || obj.hidden) continue;
      const gType = obj.graphic && obj.graphic.type;
      const text = extractText(obj);
      if (gType === 'Line') {
        lines++;
        if (text) messageLabels.push(text);
      } else if (gType === 'Shape') {
        shapes++;
        if (text) participantNames.push(text);
      }
    }

    return {
      valid: true,
      title: (data.metadata && data.metadata.title) || 'Untitled',
      version: data.version || '?',
      objectCount: objects.length,
      shapes, lines,
      participants: participantNames,
      messages: messageLabels,
    };
  }

  return {
    plantumlToMermaid,
    mermaidToPlantUml,
    gliffyJsonToPlantUml,
    gliffyJsonToMermaid,
    plantumlToGliffyJson,
    mermaidToGliffyJson,
    convertAndNavigate,
    checkConvertPayload,
    extractGliffyInfo,
  };

})();
