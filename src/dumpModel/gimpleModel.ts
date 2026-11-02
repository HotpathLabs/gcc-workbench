/*
 * Copyright (C) 2025 Kishan Parmar
 *
 * This file is part of GCC Workbench.
 *
 * GCC Workbench is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { BlockInfo, DumpModel, FunctionInfo, Occurrence, VarInfo } from './types';

const FUNCTION_LINE = /^;; Function (\S+)/;
const BLOCK_LINE = /^\s*<bb (\d+)>/;

// SSA names: x_3, ivtmp.18_5, _7, .MEM_9 (optionally followed by (D)).
const SSA = String.raw`\.?[A-Za-z_][\w.$]*_\d+|_\d+`;
const SSA_RE = new RegExp(String.raw`(?<![\w.$])(${SSA})(\(D\))?(?![\w$])`, 'g');
const DEF_RE = new RegExp(String.raw`^\s*(?:#\s*)?(${SSA})\s*=(?!=)`);
// "  int _1;" / "  float * _7;" - declares an SSA name, defines nothing.
const DECL_RE = new RegExp(String.raw`^\s*[A-Za-z_][\w \t*]*[ \t*](${SSA})\s*;\s*$`);

/** Blank out string literals so their contents are not mistaken for names. */
function maskStrings(line: string): string {
  return line.replace(/"(?:[^"\\]|\\.)*"/g, m => ' '.repeat(m.length));
}

export function parseGimpleDump(lines: string[]): DumpModel {
  const functions: FunctionInfo[] = [];
  const starts: {name: string; line: number}[] = [];

  lines.forEach((l, i) => {
    const m = FUNCTION_LINE.exec(l);
    if (m) starts.push({name: m[1], line: i});
  });
  if (starts.length === 0)
    starts.push({name: '(dump)', line: 0});

  starts.forEach((s, idx) => {
    const endLine = idx + 1 < starts.length ? starts[idx + 1].line - 1 : lines.length - 1;
    functions.push(parseFunction(lines, s.name, s.line, endLine));
  });

  return {kind: 'gimple', functions};
}

function parseFunction(lines: string[], name: string, line: number, endLine: number): FunctionInfo {
  const vars = new Map<string, VarInfo>();
  const blocks: BlockInfo[] = [];
  const defined = new Set<string>();
  const hasDefault = new Set<string>();

  type Pending = {key: string; occ: Occurrence};
  const pending: Pending[] = [];

  for (let i = line; i <= endLine; i++) {
    const raw = lines[i];
    if (raw.startsWith(';;'))
      continue;

    const bm = BLOCK_LINE.exec(raw);
    if (bm) {
      if (blocks.length) blocks[blocks.length - 1].endLine = i - 1;
      blocks.push({index: Number(bm[1]), line: i, endLine: endLine, insnCount: 0});
      continue;
    }

    const text = maskStrings(raw);
    const isDecl = DECL_RE.test(text) && !text.includes('=');
    const def = isDecl ? null : DEF_RE.exec(text);
    if (blocks.length && /\S/.test(text) && !/^\s*[{}]\s*$/.test(text) && !isDecl)
      blocks[blocks.length - 1].insnCount++;

    SSA_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SSA_RE.exec(text)) !== null) {
      const key = m[1];
      const isDef = !!def && def[1] === key && text.indexOf(key) === m.index &&
                    !defined.has(key + '@' + i);
      const occ: Occurrence = {line: i, start: m.index, endLine: i, end: m.index + key.length,
                               role: isDecl ? 'note' : isDef ? 'def' : 'use'};
      if (isDef) defined.add(key);
      if (m[2]) hasDefault.add(key);
      pending.push({key, occ});
    }
  }

  // An SSA name needs a definition: an LHS, or a (D) default definition
  // (parameters, uninitialised locals). Anything else is a function name.
  const firstDefault = new Map<string, Occurrence>();
  for (const p of pending) {
    if (hasDefault.has(p.key) && !defined.has(p.key) && !firstDefault.has(p.key) && p.occ.role === 'use')
      firstDefault.set(p.key, p.occ);
  }
  for (const [, occ] of firstDefault) occ.role = 'def';

  for (const p of pending) {
    if (!defined.has(p.key) && !hasDefault.has(p.key))
      continue;
    let v = vars.get(p.key);
    if (!v) {
      v = {key: p.key, occurrences: [], modes: new Set(), flags: new Set()};
      vars.set(p.key, v);
    }
    v.occurrences.push(p.occ);
  }

  return {name, line, endLine, blocks, vars, insns: new Map(), uidRefs: []};
}
