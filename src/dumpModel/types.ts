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

/** 'both' is a read-modify-write such as post_inc; 'note' is a REG_DEAD style annotation. */
export type Role = 'def' | 'use' | 'both' | 'note';

export interface Occurrence {
  line: number;
  start: number;     // column
  endLine: number;
  end: number;       // column, exclusive
  role: Role;
  mode?: string;
  flags?: string;    // e.g. "/v/f"
}

/** A register (RTL) or SSA name (GIMPLE) and everything that mentions it inside one function. */
export interface VarInfo {
  key: string;       // 'r94' | '_5' | 'x_2'
  occurrences: Occurrence[];
  modes: Set<string>;
  flags: Set<string>;
  hardName?: string; // sp, x0, ...
  userName?: string; // the [ n ] debug name
}

export interface BlockInfo {
  index: number;
  line: number;
  endLine: number;
  insnCount: number;
}

/** A number in the text that names an insn: prev/next uid, label_ref. */
export interface UidRef {
  uid: number;
  line: number;
  start: number;
  end: number;
}

export interface InsnInfo {
  uid: number;
  kind: string;
  line: number;
  endLine: number;
  bb?: number;
}

export interface FunctionInfo {
  name: string;
  line: number;
  endLine: number;
  blocks: BlockInfo[];
  vars: Map<string, VarInfo>;
  insns: Map<number, InsnInfo>;
  uidRefs: UidRef[];
}

export interface DumpModel {
  kind: 'rtl' | 'gimple';
  functions: FunctionInfo[];
}

export interface VarHit {
  fn: FunctionInfo;
  variable: VarInfo;
  occurrence: Occurrence;
}

/** The variable occurrence under a position, if any. */
export function findVarAt(model: DumpModel, line: number, col: number): VarHit | undefined {
  let best: VarHit | undefined;
  for (const fn of model.functions) {
    if (line < fn.line || line > fn.endLine)
      continue;
    for (const variable of fn.vars.values()) {
      for (const o of variable.occurrences) {
        const inside = (line > o.line || (line === o.line && col >= o.start)) &&
                       (line < o.endLine || (line === o.endLine && col <= o.end));
        if (!inside)
          continue;
        // Prefer the narrowest match (a reg nested in a subreg).
        const width = (o.endLine - o.line) * 10000 + (o.end - o.start);
        const bestWidth = best ? (best.occurrence.endLine - best.occurrence.line) * 10000 +
                                  (best.occurrence.end - best.occurrence.start) : Infinity;
        if (width < bestWidth)
          best = {fn, variable, occurrence: o};
      }
    }
  }
  return best;
}

export function findFunctionAt(model: DumpModel, line: number): FunctionInfo | undefined {
  return model.functions.find(f => line >= f.line && line <= f.endLine);
}
