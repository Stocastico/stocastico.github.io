'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   scripts/lib/yaml.js — minimal YAML subset parser

   Supports the structure used by data/cv.yaml and data/locations.yaml:
     • Flat and nested mappings
     • Block sequences (- item)
     • Sequence of mappings (inline first key + indented continuation keys)
     • Folded (>) and literal (|) block scalars
     • Quoted scalars (single / double)
     • Inline flow sequences ([a, b, c]) — comma-separated, quote-aware
     • Inline comments stripped via stripYamlComments
     • Scalar type coercion: null, bool, int, float, string

   Does NOT support: anchors, aliases, flow mappings {}, multi-doc, tags.
──────────────────────────────────────────────────────────────────────────────*/

/**
 * Strip a trailing YAML comment from a single line.
 * Respects # inside single- or double-quoted strings.
 */
function stripYamlComments(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (c === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (c === '#' && !inSingle && !inDouble) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

/**
 * Split the body of a flow sequence on top-level commas, honouring quotes
 * and nested [] / {} so "a, [b, c], 'd, e'" yields three items.
 */
function splitFlowItems(inner) {
  const items = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "'" && !inDouble) { inSingle = !inSingle; buf += c; continue; }
    if (c === '"' && !inSingle) { inDouble = !inDouble; buf += c; continue; }
    if (!inSingle && !inDouble) {
      if (c === '[' || c === '{') { depth++; buf += c; continue; }
      if (c === ']' || c === '}') { depth--; buf += c; continue; }
      if (c === ',' && depth === 0) { items.push(buf); buf = ''; continue; }
    }
    buf += c;
  }
  items.push(buf);
  return items;
}

/**
 * Parse an inline flow sequence ("[a, b, c]") into an array. Empty "[]" → [].
 * Each item is run through parseScalar, so types/quoting are handled per item.
 */
function parseFlowSequence(str) {
  const inner = str.slice(1, -1).trim();
  if (inner === '') return [];
  return splitFlowItems(inner).map((s) => parseScalar(s.trim()));
}

/**
 * Parse a YAML scalar token to the appropriate JS type.
 */
function parseScalar(str) {
  if (str === 'null' || str === '~') return null;
  if (str === '') return '';
  if (str === 'true')  return true;
  if (str === 'false') return false;
  if (str.startsWith("'") && str.endsWith("'") && str.length >= 2) return str.slice(1, -1);
  if (str.startsWith('"') && str.endsWith('"') && str.length >= 2) return str.slice(1, -1);
  if (str.startsWith('[') && str.endsWith(']')) return parseFlowSequence(str);
  const n = Number(str);
  if (!isNaN(n)) return n;
  return str;
}

/**
 * Find the index of the first mapping colon (': ' or trailing ':') outside quotes.
 */
function findMappingColon(str) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (c === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (c === ':' && !inSingle && !inDouble) {
      if (i === str.length - 1 || str[i + 1] === ' ' || str[i + 1] === '\t') return i;
    }
  }
  return -1;
}

/**
 * Parse a YAML document string into a plain JS object.
 */
function parseYaml(text) {
  if (!text || !text.trim()) return {};

  /* Normalize CRLF/CR to LF so ':' at end-of-line is parsed correctly on Windows-origin files. */
  const normalized = text.replace(/\r\n?/g, '\n');
  const rawLines = normalized.split('\n');
  let pos = 0;

  /** Return parsed line info at index idx, or null if out of range. */
  function getLine(idx) {
    if (idx >= rawLines.length) return null;
    const stripped = stripYamlComments(rawLines[idx]);
    const trimmed  = stripped.trimStart();
    return { indent: stripped.length - trimmed.length, content: trimmed, empty: !trimmed };
  }

  /** Find next non-empty line without advancing pos. */
  function peekNonEmpty() {
    for (let p = pos; p < rawLines.length; p++) {
      const l = getLine(p);
      if (l && !l.empty) return l;
    }
    return null;
  }

  /**
   * Parse a block scalar (type '>' or '|') whose key was at keyIndent.
   * Advances pos past all body lines.
   */
  function parseBlockScalar(type, keyIndent) {
    const bodyIndent = keyIndent + 2;
    const bodyLines  = [];

    while (pos < rawLines.length) {
      const raw     = rawLines[pos];
      const trimmed = raw.trimStart();
      const indent  = raw.length - trimmed.length;

      if (!trimmed) {           /* blank line — keep as empty entry */
        bodyLines.push('');
        pos++;
        continue;
      }
      if (indent < bodyIndent) break;   /* dedent → end of block scalar */
      bodyLines.push(trimmed);
      pos++;
    }

    /* Trim trailing blank lines */
    while (bodyLines.length && bodyLines[bodyLines.length - 1] === '') bodyLines.pop();

    if (type === '|') {
      return bodyLines.join('\n');
    }

    /* Folded: consecutive non-empty lines → join with space; blank lines → '\n' */
    const segments = [];
    let   current  = [];
    for (const ln of bodyLines) {
      if (ln === '') {
        if (current.length) { segments.push(current.join(' ')); current = []; }
      } else {
        current.push(ln);
      }
    }
    if (current.length) segments.push(current.join(' '));
    return segments.join('\n');
  }

  /**
   * Parse a mapping block at exactly baseIndent.
   * Returns an object; stops when a line at < baseIndent (or != baseIndent) is seen.
   */
  function parseMapping(baseIndent) {
    const obj = {};

    while (pos < rawLines.length) {
      const line = getLine(pos);
      if (!line || line.empty) { pos++; continue; }
      if (line.indent < baseIndent) break;   /* dedent */
      if (line.indent > baseIndent) break;   /* unexpected deeper line */
      if (line.content.startsWith('- ') || line.content === '-') break; /* seq item */

      const ci = findMappingColon(line.content);
      if (ci === -1) { pos++; continue; }   /* malformed, skip */

      const key  = line.content.slice(0, ci).trim();
      const rest = line.content.slice(ci + 1).trim();
      pos++;

      if (rest === '>' || rest === '|') {
        obj[key] = parseBlockScalar(rest, line.indent);
      } else if (rest === '') {
        const ahead = peekNonEmpty();
        if (ahead && ahead.indent > line.indent) {
          if (ahead.content.startsWith('- ') || ahead.content === '-') {
            obj[key] = parseSequence(ahead.indent);
          } else {
            obj[key] = parseMapping(ahead.indent);
          }
        } else {
          obj[key] = null;
        }
      } else {
        obj[key] = parseScalar(rest);
      }
    }

    return obj;
  }

  /**
   * Parse a sequence block where '-' items are at exactly baseIndent.
   * Returns an array; stops when a line at < baseIndent is seen.
   */
  function parseSequence(baseIndent) {
    const arr = [];

    while (pos < rawLines.length) {
      const line = getLine(pos);
      if (!line || line.empty) { pos++; continue; }
      if (line.indent < baseIndent) break;
      if (line.indent > baseIndent) break;
      if (!line.content.startsWith('- ') && line.content !== '-') break;

      const itemContent = (line.content === '-') ? '' : line.content.slice(2).trim();
      const itemIndent  = line.indent;
      pos++;

      if (itemContent === '') {
        /* Whole item on subsequent lines */
        const ahead = peekNonEmpty();
        if (ahead && ahead.indent > itemIndent) {
          arr.push(
            (ahead.content.startsWith('- ') || ahead.content === '-')
              ? parseSequence(ahead.indent)
              : parseMapping(ahead.indent)
          );
        } else {
          arr.push(null);
        }
        continue;
      }

      if (itemContent === '>' || itemContent === '|') {
        arr.push(parseBlockScalar(itemContent, itemIndent));
        continue;
      }

      const ci = findMappingColon(itemContent);
      if (ci === -1) {
        /* Plain scalar item */
        arr.push(parseScalar(itemContent));
        continue;
      }

      /* Mapping item — first key is inline on the '-' line */
      const firstKey = itemContent.slice(0, ci).trim();
      const firstVal = itemContent.slice(ci + 1).trim();
      const item     = {};

      if (firstVal === '>' || firstVal === '|') {
        item[firstKey] = parseBlockScalar(firstVal, itemIndent);
      } else if (firstVal === '') {
        const ahead = peekNonEmpty();
        if (ahead && ahead.indent > itemIndent) {
          item[firstKey] = (ahead.content.startsWith('- ') || ahead.content === '-')
            ? parseSequence(ahead.indent)
            : parseMapping(ahead.indent);
        } else {
          item[firstKey] = null;
        }
      } else {
        item[firstKey] = parseScalar(firstVal);
      }

      /* Continuation keys for this mapping item (indent == itemIndent + 2) */
      const keyIndent = itemIndent + 2;
      while (pos < rawLines.length) {
        const kl = getLine(pos);
        if (!kl || kl.empty) { pos++; continue; }
        if (kl.indent < keyIndent) break;
        if (kl.content.startsWith('- ') || kl.content === '-') break;

        const kci = findMappingColon(kl.content);
        if (kci === -1) { pos++; continue; }

        const k = kl.content.slice(0, kci).trim();
        const v = kl.content.slice(kci + 1).trim();
        pos++;

        if (v === '>' || v === '|') {
          item[k] = parseBlockScalar(v, kl.indent);
        } else if (v === '') {
          const ahead = peekNonEmpty();
          if (ahead && ahead.indent > kl.indent) {
            item[k] = (ahead.content.startsWith('- ') || ahead.content === '-')
              ? parseSequence(ahead.indent)
              : parseMapping(ahead.indent);
          } else {
            item[k] = null;
          }
        } else {
          item[k] = parseScalar(v);
        }
      }

      arr.push(item);
    }

    return arr;
  }

  /* Skip leading empty/comment lines then parse root mapping */
  while (pos < rawLines.length) {
    const l = getLine(pos);
    if (l && !l.empty) break;
    pos++;
  }
  if (pos >= rawLines.length) return {};

  return parseMapping(0);
}

module.exports = { stripYamlComments, parseScalar, parseFlowSequence, parseYaml };
