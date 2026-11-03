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

/**
 * 'both' is a read-modify-write: post_inc, or a partial/conditional store such
 * as strict_low_part (see Occurrence.partial). 'note' is a REG_DEAD style
 * annotation, 'debug' a debug_insn / var_location operand, and 'log' a mention
 * outside the insn stream (pass logging, slim listings, ;; dataflow sets).
 * 'decl' is a declaration (GIMPLE locals and parameters): it names the
 * variable but neither reads nor writes it.
 */
export type Role = 'def' | 'use' | 'both' | 'note' | 'debug' | 'log' | 'decl';

export interface Occurrence {
  line: number;
  start: number;     // column
  endLine: number;
  end: number;       // column, exclusive
  role: Role;
  mode?: string;
  flags?: string;    // e.g. "/v/f"
  uid?: number;      // the insn (RTL) or statement (GIMPLE) this occurrence belongs to
  partial?: boolean; // a write that does not kill the whole register
  implicit?: boolean; // not in the RTL: a call clobbering a call-used hard register
}

/** A register (RTL) or SSA name (GIMPLE) and everything that mentions it inside one function. */
export interface VarInfo {
  key: string;       // 'r94' | '_5' | 'x_2'
  occurrences: Occurrence[];
  modes: Set<string>;
  flags: Set<string>;
  hardName?: string; // sp, x0, ...
  userNames?: Set<string>; // the [ n ] debug names
  userName?: string; // the first of userNames
  // GIMPLE
  type?: string;       // declared type: "int", "unsigned long", "struct S *"
  ssa?: boolean;       // an SSA name (one def) rather than a variable
  base?: string;       // the variable an SSA name versions: x for x_3, ivtmp.19 for ivtmp.19_6
  defaultDef?: boolean; // x_3(D): the value on entry (a parameter, or uninitialised)
  virtual?: boolean;   // .MEM_n
  addressTaken?: boolean; // &x appears: stores through pointers and calls are not tracked
  /** "# PT = ...", "# RANGE ..." lines printed before the def. */
  annotations?: string[];
  abnormal?: boolean;  // x_1(ab): occurs in an abnormal PHI (setjmp, nonlocal goto)
  /** Where a non-SSA variable lives when it is not an ordinary local. */
  storage?: 'static' | 'global';
  /** The name to show when the key had to be made unique (a shadowing declaration). */
  display?: string;
  declLine?: number;   // line of its declaration
}

export const ENTRY_BLOCK = 0;
export const EXIT_BLOCK = 1;

export interface BlockInfo {
  index: number;
  line: number;        // first line of the block (its ;; basic block header when present)
  endLine: number;
  insnCount: number;
  noteLine?: number;   // the (note ... [bb N] NOTE_INSN_BASIC_BLOCK) line
  headerLine?: number; // ;; basic block N, loop depth ...
  firstInsnLine?: number;
  preds: number[];
  succs: number[];
  loopDepth?: number;
  count?: string;
}

/** A number in the text that names an insn: prev/next uid, label_ref, log listings. */
export interface UidRef {
  uid: number;
  line: number;
  start: number;
  end: number;
  decl?: boolean; // the uid field of the insn itself
}

/** A number in the text that names a basic block. */
export interface BbRef {
  bb: number;
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
  seq: number; // position in the insn chain
  /** Block used for dataflow when it differs from bb: label-delimited blocks of a GIMPLE dump without <bb N>. */
  flowBb?: number;
}

/** A GIMPLE label (<L7>, <D.5666>) where it is defined or jumped to. */
export interface LabelRef {
  name: string;
  line: number;
  start: number;
  end: number;
  decl?: boolean;
}

export interface FunctionInfo {
  name: string;
  line: number;
  endLine: number;
  blocks: BlockInfo[];
  vars: Map<string, VarInfo>;
  insns: Map<number, InsnInfo>;
  uidRefs: UidRef[];
  bbRefs?: BbRef[];
  /** Whether preds/succs come from the dump's ;; pred/succ lines or were derived from jumps. */
  cfgSource?: 'dump' | 'computed';
  /** A derived CFG for a dump that may be in cfglayout mode, where fallthrough need not be the next block. */
  cfgUncertain?: boolean;
  entryDefsLine?: number; // ;;  entry block defs
  exitUsesLine?: number;  // ;;  exit block uses
  /** The line a block number jumps to: its NOTE_INSN_BASIC_BLOCK, else its first insn or header. */
  blockTargets?: Map<number, number>;
  /** The dataflow sets GCC printed (regnos): blocks.get(bb).get('lr in'), function.get('exit block uses'). */
  dumpDataflow?: {blocks: Map<number, Map<string, number[]>>; function: Map<string, number[]>};
  // GIMPLE
  labelRefs?: LabelRef[];
  labels?: Map<string, number>; // label name -> line of "<L7>:"
  /** Blocks for dataflow when they are not the dump's own (a dump without <bb N>). */
  flowBlocks?: BlockInfo[];
  /** The line holding the function body's opening brace and the signature line. */
  signatureLine?: number;
  /** Statement kind label for links: 'insn' (RTL) or 'line' (GIMPLE). */
  stmtKind?: 'insn' | 'stmt';
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

const within = (line: number, col: number, l0: number, c0: number, l1: number, c1: number) =>
    (line > l0 || (line === l0 && col >= c0)) && (line < l1 || (line === l1 && col <= c1));

/** The variable occurrence under a position, if any. */
export function findVarAt(model: DumpModel, line: number, col: number): VarHit | undefined {
  let best: VarHit | undefined;
  let bestWidth = Infinity;
  for (const fn of model.functions) {
    if (line < fn.line || line > fn.endLine)
      continue;
    for (const variable of fn.vars.values()) {
      for (const o of variable.occurrences) {
        if (o.implicit || !within(line, col, o.line, o.start, o.endLine, o.end))
          continue;
        // Prefer the narrowest match (a reg nested in a subreg).
        const width = (o.endLine - o.line) * 10000 + (o.end - o.start);
        if (width < bestWidth) {
          best = {fn, variable, occurrence: o};
          bestWidth = width;
        }
      }
    }
  }
  return best;
}

/** What sits under a position. Registers win over the numbers around them. */
export type Target =
  | {kind: 'var'; hit: VarHit}
  | {kind: 'uid'; fn: FunctionInfo; ref: UidRef}
  | {kind: 'bb'; fn: FunctionInfo; ref: BbRef}
  | {kind: 'label'; fn: FunctionInfo; ref: LabelRef};

/**
 * Everything clickable, bucketed by line, so a hover or highlight request
 * looks at one line instead of every occurrence in the dump.
 */
export class PositionIndex {
  private vars = new Map<number, VarHit[]>();
  private uids = new Map<number, {fn: FunctionInfo; ref: UidRef}[]>();
  private bbs = new Map<number, {fn: FunctionInfo; ref: BbRef}[]>();
  private labels = new Map<number, {fn: FunctionInfo; ref: LabelRef}[]>();

  constructor(model: DumpModel) {
    const add = <T>(map: Map<number, T[]>, line: number, item: T) => {
      const list = map.get(line);
      if (list) list.push(item); else map.set(line, [item]);
    };
    for (const fn of model.functions) {
      for (const variable of fn.vars.values())
        for (const occurrence of variable.occurrences)
          if (!occurrence.implicit) for (let l = occurrence.line; l <= occurrence.endLine; l++) add(this.vars, l, {fn, variable, occurrence});
      for (const ref of fn.uidRefs) add(this.uids, ref.line, {fn, ref});
      for (const ref of fn.bbRefs ?? []) add(this.bbs, ref.line, {fn, ref});
      for (const ref of fn.labelRefs ?? []) add(this.labels, ref.line, {fn, ref});
    }
  }

  varAt(line: number, col: number): VarHit | undefined {
    let best: VarHit | undefined;
    let bestWidth = Infinity;
    for (const h of this.vars.get(line) ?? []) {
      const o = h.occurrence;
      if (!within(line, col, o.line, o.start, o.endLine, o.end)) continue;
      const width = (o.endLine - o.line) * 10000 + (o.end - o.start);
      if (width < bestWidth) { best = h; bestWidth = width; }
    }
    return best;
  }

  targetAt(line: number, col: number): Target | undefined {
    const hit = this.varAt(line, col);
    if (hit) return {kind: 'var', hit};
    const bb = this.bbs.get(line)?.find(x => col >= x.ref.start && col <= x.ref.end);
    if (bb) return {kind: 'bb', ...bb};
    const uid = this.uids.get(line)?.find(x => col >= x.ref.start && col <= x.ref.end);
    if (uid) return {kind: 'uid', ...uid};
    const label = this.labels.get(line)?.find(x => col >= x.ref.start && col <= x.ref.end);
    if (label) return {kind: 'label', ...label};
    return undefined;
  }
}

export function findFunctionAt(model: DumpModel, line: number): FunctionInfo | undefined {
  return model.functions.find(f => line >= f.line && line <= f.endLine);
}

export function findUidRefAt(fn: FunctionInfo, line: number, col: number): UidRef | undefined {
  return fn.uidRefs.find(r => r.line === line && col >= r.start && col <= r.end);
}

export function findBbRefAt(fn: FunctionInfo, line: number, col: number): BbRef | undefined {
  return fn.bbRefs?.find(r => r.line === line && col >= r.start && col <= r.end);
}

export const isWrite = (o: Occurrence) => o.role === 'def' || o.role === 'both';
export const isRead = (o: Occurrence) => o.role === 'use' || o.role === 'both' || o.role === 'debug';
/** A write that makes earlier values of the register dead. */
export const kills = (o: Occurrence) => isWrite(o) && !o.partial;

export interface Reach {
  occurrences: Occurrence[];
  /** The value can come from outside the function (an argument or other live-in). */
  fromEntry: boolean;
  /** No def kills the value before the end of the function. */
  toExit: boolean;
}

/**
 * Reaching definitions / reached uses for one register, on demand.
 *
 * Within an insn every operand is read before any is written, so the defs of
 * the insn containing a use do not reach it, and the uses of an insn
 * containing a def are not reached by it.
 */
export class FlowQuery {
  private byBlock = new Map<number, Occurrence[]>(); // occurrences in chain order
  private blocks = new Map<number, BlockInfo>();

  constructor(private fn: FunctionInfo, v: VarInfo) {
    for (const b of fn.flowBlocks ?? fn.blocks)
      this.blocks.set(b.index, b);
    for (const o of v.occurrences) {
      if (o.uid === undefined || o.role === 'note' || o.role === 'log' || o.role === 'decl')
        continue;
      const bb = this.bbOf(o);
      if (bb === undefined)
        continue;
      let list = this.byBlock.get(bb);
      if (!list) this.byBlock.set(bb, list = []);
      list.push(o);
    }
    for (const list of this.byBlock.values())
      list.sort((a, b) => this.seq(a) - this.seq(b) || a.line - b.line || a.start - b.start);
  }

  private seq(o: Occurrence): number { return this.fn.insns.get(o.uid!)!.seq; }
  private bbOf(o: Occurrence): number | undefined {
    const insn = o.uid === undefined ? undefined : this.fn.insns.get(o.uid);
    return insn?.flowBb ?? insn?.bb;
  }

  /** Whether the query can be answered (the occurrence sits in a known block). */
  supports(o: Occurrence): boolean { return this.bbOf(o) !== undefined && this.blocks.has(this.bbOf(o)!); }

  reachingDefs(at: Occurrence): Reach {
    const out: Occurrence[] = [];
    let fromEntry = false;
    const start = this.bbOf(at)!;
    const atSeq = this.seq(at);

    // Walk backwards through a block; returns true when a killing def was found.
    const scan = (bb: number, before: number): boolean => {
      const list = this.byBlock.get(bb) ?? [];
      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i];
        if (this.seq(o) >= before || !isWrite(o))
          continue;
        out.push(o);
        if (kills(o))
          return true;
      }
      return false;
    };

    const visited = new Set<number>();
    const work: number[] = [];
    const preds = (bb: number) => {
      const b = this.blocks.get(bb);
      if (!b || b.preds.length === 0 || b.preds.includes(ENTRY_BLOCK)) fromEntry = true;
      for (const p of b?.preds ?? [])
        if (p !== ENTRY_BLOCK) work.push(p);
    };
    if (!scan(start, atSeq)) preds(start);
    while (work.length) {
      const bb = work.pop()!;
      if (visited.has(bb)) continue;
      visited.add(bb);
      if (!scan(bb, Infinity)) preds(bb);
    }
    return {occurrences: out.sort((a, b) => a.line - b.line || a.start - b.start), fromEntry, toExit: false};
  }

  reachedUses(def: Occurrence): Reach {
    const out: Occurrence[] = [];
    let toExit = false;
    const start = this.bbOf(def)!;
    const defSeq = this.seq(def);

    // Walk forwards through a block; returns true when a killing def ends the value's life.
    const scan = (bb: number, after: number): boolean => {
      const list = this.byBlock.get(bb) ?? [];
      let killedAt: number | undefined;
      for (const o of list) {
        const s = this.seq(o);
        if (s <= after) continue;
        if (killedAt !== undefined && s > killedAt) break;
        if (isRead(o) && out.indexOf(o) < 0) out.push(o);
        if (kills(o)) killedAt = s;
      }
      return killedAt !== undefined;
    };

    const visited = new Set<number>();
    const work: number[] = [];
    const succs = (bb: number) => {
      const b = this.blocks.get(bb);
      if (!b || b.succs.length === 0 || b.succs.includes(EXIT_BLOCK)) toExit = true;
      for (const s of b?.succs ?? [])
        if (s !== EXIT_BLOCK) work.push(s);
    };
    if (!scan(start, defSeq)) succs(start);
    while (work.length) {
      const bb = work.pop()!;
      if (visited.has(bb)) continue;
      visited.add(bb);
      if (!scan(bb, -Infinity)) succs(bb);
    }
    return {occurrences: out.sort((a, b) => a.line - b.line || a.start - b.start), fromEntry: false, toExit};
  }
}
