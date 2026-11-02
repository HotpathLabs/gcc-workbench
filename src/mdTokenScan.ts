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

export type MdKind = 'iterator' | 'attribute';

export interface MdToken {
  line: number;
  start: number;
  length: number;
  kind: MdKind;
}

/** What a name is, as far as the machine description index knows. */
export type MdLookup = (name: string) => MdKind | undefined;

/** Per character: 0 = code, 1 = inside a string, 2 = comment. */
function classify(text: string): Uint8Array {
  const mask = new Uint8Array(text.length);
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    if (!inString && text[i] === ';') {
      mask.fill(2, i);
      break;
    }
    if (text[i] === '"' && text[i - 1] !== '\\') {
      inString = !inString;
      mask[i] = 1;
    } else if (inString) {
      mask[i] = 1;
    }
  }
  return mask;
}

/**
 * Finds iterator and iterator-attribute references in machine description text.
 *
 *  - iterators:  any bare identifier in code, or <ITER> / <ITER:attr> in a string
 *  - attributes: <attr> / <ITER:attr> and the name after define_*_attr
 */
export function scanMdTokens(lines: string[], lookup: MdLookup): MdToken[] {
  const out: MdToken[] = [];
  // <ITER:attr> | <name> | bare identifier
  const re = /<([A-Za-z_]\w*):([A-Za-z_]\w*)>|<([A-Za-z_]\w*)>|[A-Za-z_]\w*/g;

  lines.forEach((text, line) => {
    const mask = classify(text);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (mask[m.index] === 2)
        break;

      const add = (offset: number, name: string, kind: MdKind) =>
          out.push({line, start: m!.index + offset, length: name.length, kind});

      if (m[1] !== undefined) {
        if (lookup(m[1]) === 'iterator')
          add(1, m[1], 'iterator');
        if (lookup(m[2]) === 'attribute')
          add(1 + m[1].length + 1, m[2], 'attribute');
      } else if (m[3] !== undefined) {
        const kind = lookup(m[3]);
        if (kind)
          add(1, m[3], kind);
      } else if (mask[m.index] === 0) {
        const kind = lookup(m[0]);
        if (kind === 'iterator' ||
            (kind === 'attribute' && /\(define_\w+_attr\s+$/.test(text.slice(0, m.index))))
          add(0, m[0], kind);
      }
    }
  });
  return out;
}
