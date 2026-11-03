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

import { BbRef, BlockInfo, DumpModel, ENTRY_BLOCK, EXIT_BLOCK, FunctionInfo, InsnInfo, Occurrence, Role, UidRef, VarInfo } from './types';

/** Top-level forms that start a real insn; anything else at column 0 is pass logging. */
// sched2 marks the first insn of each cycle with a mode: (insn:TI 8 3 9 ...), (insn/f:TI 26 ...).
const TOP_LEVEL = /^\((insn|jump_insn|call_insn|debug_insn|note|code_label|barrier|jump_table_data)(\/[a-z]+)*(?::[A-Z]+)?[\s)]/;
/** C++ names contain spaces and parens: ";; Function int f(int) (_Z1fi, funcdef_no=0, ...)". */
const FUNCTION_LINE = /^;; Function (.+?) \([^\s,()]+, funcdef_no=/;
const FUNCTION_LINE_SHORT = /^;; Function (\S+)/;
const JUMP_ARROW = /^\s+->\s*\d+\)?\s*$/;

interface Node {
  kind: 'list' | 'brack' | 'atom' | 'str';
  text: string;
  start: number; // offset
  end: number;   // offset, exclusive
  items: Node[];
}

/** Real RTL nests a few dozen levels; deeper input is flattened so the recursive walk stays bounded. */
const MAX_DEPTH = 200;

function tokenize(text: string): Node {
  const root: Node = {kind: 'list', text: '', start: 0, end: text.length, items: []};
  const stack: Node[] = [root];
  const re = /"(?:[^"\\]|\\.)*"|[()\[\]]|[^\s()\[\]"]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const top = stack[stack.length - 1];
    const t = m[0];
    if ((t === '(' || t === '[') && stack.length >= MAX_DEPTH) {
      continue;
    } else if (t === '(' || t === '[') {
      const n: Node = {kind: t === '(' ? 'list' : 'brack', text: '', start: m.index, end: m.index + 1, items: []};
      top.items.push(n);
      stack.push(n);
    } else if (t === ')' || t === ']') {
      const opener = t === ')' ? 'list' : 'brack';
      // Tolerate mismatches such as MEM[(const int *)_5]: close the nearest matching opener.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].kind === opener) {
          stack[i].end = m.index + 1;
          stack.length = i;
          break;
        }
      }
    } else {
      top.items.push({kind: t[0] === '"' ? 'str' : 'atom', text: t, start: m.index, end: m.index + t.length, items: []});
    }
  }
  return root;
}

interface Head { code: string; flags: string; mode?: string }

function headOf(n: Node): Head | undefined {
  if (n.kind !== 'list' || n.items.length === 0 || n.items[0].kind !== 'atom')
    return undefined;
  const m = /^([a-z_0-9]+)((?:\/[a-z]+)*)(?::([A-Za-z0-9_]+))?$/.exec(n.items[0].text);
  return m ? {code: m[1], flags: m[2], mode: m[3]} : undefined;
}

const isInt = (n: Node | undefined) => !!n && n.kind === 'atom' && /^-?\d+$/.test(n.text);

const SCALAR_BYTES: Record<string, number> = {
  BI: 1, QI: 1, HI: 2, PSI: 4, SI: 4, PDI: 8, DI: 8, TI: 16, OI: 32, XI: 64,
  HF: 2, BF: 2, SF: 4, DF: 8, XF: 16, TF: 16, KF: 16, IF: 16, SD: 4, DD: 8, TD: 16,
  QQ: 1, HQ: 2, SQ: 4, DQ: 8, TQ: 16, UQQ: 1, UHQ: 2, USQ: 4, UDQ: 8, UTQ: 16,
  HA: 2, SA: 4, DA: 8, TA: 16, UHA: 2, USA: 4, UDA: 8, UTA: 16,
};

/** Byte size of a machine mode, or undefined when it cannot be told from the name (CC, SVE, ...). */
export function modeBytes(mode: string | undefined): number | undefined {
  if (!mode) return undefined;
  if (SCALAR_BYTES[mode] !== undefined) return SCALAR_BYTES[mode];
  const vec = /^V(?:(\d+)x)?(\d+)([A-Z]+)$/.exec(mode); // V4SI, and tuples such as V2x4SI
  if (vec) {
    const e = SCALAR_BYTES[vec[3]];
    return e === undefined ? undefined : e * Number(vec[2]) * Number(vec[1] ?? 1);
  }
  const cplx = /^C([A-Z]+)$/.exec(mode);
  if (cplx && SCALAR_BYTES[cplx[1]] !== undefined) return 2 * SCALAR_BYTES[cplx[1]];
  return undefined;
}

/**
 * How many hard registers a value occupies (GCC's hard_regno_nregs), where the dump tells:
 * tuple modes (V2x4SI in v28 is v28-v29) and values wider than a word in general registers
 * (TI in x0 is x0-x1). Other register files keep one register.
 */
export function hardRegSpan(regno: number, name: string, mode: string | undefined, wordBytes: number): number {
  if (!mode) return 1;
  const tuple = /^V(\d+)x\d+[A-Z]+$/.exec(mode);
  if (tuple) return Number(tuple[1]);
  const bytes = modeBytes(mode);
  if (bytes === undefined || bytes <= wordBytes) return 1;
  // aarch64 x0-x30; x86 ax..bp, r8-r15; riscv ABI names; arm r0-r12, ip, fp, lr; rs6000 GPRs print their number.
  const gpr = /^(?:x(?:[12]?\d|30)|[re]?(?:ax|bx|cx|dx|si|di|bp)|r(?:\d|1[0-5])|zero|ra|gp|tp|[ast]\d+|ip|fp|lr)$/.test(name)
      || (regno < 32 && name === String(regno));
  return gpr ? Math.ceil(bytes / wordBytes) : 1;
}

const AUTO_MODIFY = new Set(['pre_inc', 'pre_dec', 'post_inc', 'post_dec', 'pre_modify', 'post_modify']);
const EXTRACT = new Set(['zero_extract', 'sign_extract']);

interface PendingInsn {
  info: InsnInfo;
  occurrences: Occurrence[];
}

class FunctionBuilder {
  vars = new Map<string, VarInfo>();
  insns = new Map<number, PendingInsn>();
  uidRefs: UidRef[] = [];
  bbRefs: BbRef[] = [];
  labelTargets = new Map<number, number[]>(); // insn uid -> label uids it can jump to
  returns = new Set<number>();
  /** CFG edges as the dump prints them. */
  dumpSuccs = new Map<number, Set<number>>();
  dumpPreds = new Map<number, Set<number>>();
  headers = new Map<number, {line: number; loopDepth?: number; count?: string}>();
  summaryLines = new Map<number, number>(); // ( 0 )->[2]->( 3 5 ) lines
  logLines: number[] = [];
  slimLines: number[] = []; // the insn chain of a -slim dump
  chainStart?: number;      // where the last print of the insn chain begins
  entryDefsLine?: number;
  exitUsesLine?: number;
  /** GCC's own dataflow sets, as printed: per block ('lr in', 'live out', 'artificial_uses', ...) and per function. */
  dfBlock = new Map<number, Map<string, number[]>>();
  dfFunction = new Map<string, number[]>();

  constructor(readonly name: string, readonly line: number) {}

  variable(regno: number): VarInfo {
    const key = 'r' + regno;
    let v = this.vars.get(key);
    if (!v) {
      v = {key, occurrences: [], modes: new Set(), flags: new Set()};
      this.vars.set(key, v);
    }
    return v;
  }

  edge(from: number, to: number) {
    if (!this.dumpSuccs.has(from)) this.dumpSuccs.set(from, new Set());
    if (!this.dumpPreds.has(to)) this.dumpPreds.set(to, new Set());
    this.dumpSuccs.get(from)!.add(to);
    this.dumpPreds.get(to)!.add(from);
  }
}

/** Walks one parenthesised chunk (an insn, or RTL printed by pass logging). */
class ChunkWalker {
  private readonly lineStarts: number[] = [];
  /** The insn being walked; undefined for logged RTL. */
  uid?: number;
  /** Occurrences recorded by this chunk. */
  readonly recorded: Occurrence[] = [];
  /** Labels the insn can jump to, and whether it returns; committed only for the copy of a uid that wins. */
  readonly labels: number[] = [];
  returns = false;
  private conditional = 0;

  constructor(private readonly text: string, private readonly baseLine: number,
              private readonly fn: FunctionBuilder, private readonly wordBytes: number) {
    this.lineStarts.push(0);
    for (let i = 0; i < text.length; i++)
      if (text[i] === '\n')
        this.lineStarts.push(i + 1);
  }

  pos(offset: number): {line: number; col: number} {
    let lo = 0, hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return {line: this.baseLine + lo, col: offset - this.lineStarts[lo]};
  }

  uidRef(n: Node, decl = false) {
    const a = this.pos(n.start);
    this.fn.uidRefs.push({uid: Number(n.text), line: a.line, start: a.col, end: a.col + n.text.length, decl: decl || undefined});
  }

  bbRef(n: Node) {
    const a = this.pos(n.start);
    this.fn.bbRefs.push({bb: Number(n.text), line: a.line, start: a.col, end: a.col + n.text.length});
  }

  private record(n: Node, head: Head, role: Role, partial = false) {
    const regno = Number(n.items[1]?.text);
    if (!Number.isInteger(regno))
      return;
    const v = this.fn.variable(regno);
    if (head.mode) v.modes.add(head.mode);
    head.flags.split('/').filter(Boolean).forEach(f => v.flags.add(f));

    const rest = n.items.slice(2);
    const name = rest.find(i => i.kind === 'atom');
    if (name && !v.hardName && !/^\d/.test(name.text)) v.hardName = name.text;
    const brack = rest.find(i => i.kind === 'brack');
    if (brack) {
      const inner = this.text.slice(brack.start + 1, brack.end - 1).replace(/\s+/g, ' ').trim();
      if (inner) {
        (v.userNames ??= new Set()).add(inner);
        v.userName ??= inner;
      }
    }

    if (this.conditional > 0 && role === 'def') { role = 'both'; partial = true; }
    const a = this.pos(n.start), b = this.pos(n.end - 1);
    const occ: Occurrence = {line: a.line, start: a.col, endLine: b.line, end: b.col + 1, role,
                             mode: head.mode, flags: head.flags || undefined, uid: this.uid,
                             partial: partial || undefined};
    v.occurrences.push(occ);
    this.recorded.push(occ);
    // The other hard registers of a multi-register value, at the same text.
    if (name) for (let k = 1; k < hardRegSpan(regno, name.text, head.mode, this.wordBytes); k++) {
      const extra: Occurrence = {...occ, implicit: true};
      this.fn.variable(regno + k).occurrences.push(extra);
      this.recorded.push(extra);
    }
  }

  walk(n: Node, role: Role): void {
    if (n.kind === 'brack') { n.items.forEach(c => this.walk(c, role)); return; }
    const head = headOf(n);
    if (!head) { n.items.forEach(c => this.walk(c, role)); return; }
    // Under a REG note, a debug insn or logged RTL nothing is really read or written.
    const passive = role === 'note' || role === 'debug' || role === 'log';
    const args = n.items.slice(1);

    switch (head.code) {
      case 'reg':
        this.record(n, head, role);
        return;
      case 'set':
        if (passive) break;
        if (args[0]) this.dest(args[0]);
        if (args[1]) this.walk(args[1], 'use');
        return;
      case 'clobber':
      case 'clobber_high':
        if (passive) break;
        if (args[0]) this.dest(args[0]);
        return;
      case 'cond_exec':
        if (passive) break;
        if (args[0]) this.walk(args[0], 'use');
        this.conditional++;
        args.slice(1).forEach(c => this.walk(c, role));
        this.conditional--;
        return;
      case 'label_ref':
        if (isInt(args[0])) {
          this.uidRef(args[0]);
          if (!passive) this.labels.push(Number(args[0].text));
        }
        return;
      case 'insn_list':
        // REG_DEP_TRUE / REG_LABEL_* lists name insns by uid.
        args.forEach(c => { if (isInt(c)) this.uidRef(c); else this.walk(c, 'note'); });
        return;
      case 'expr_list':
      case 'int_list':
        // REG_DEAD and friends annotate an insn; they are not reads or writes.
        args.forEach(c => this.walk(c, head.mode && head.mode.startsWith('REG_') ? 'note' : role));
        return;
      case 'return':
      case 'simple_return':
        if (!passive) this.returns = true;
        return;
      case 'var_location':
      case 'debug_implicit_ptr':
      case 'debug_parameter_ref':
      case 'entry_value':
        args.forEach(c => this.walk(c, passive ? role : 'debug'));
        return;
      default:
        if (AUTO_MODIFY.has(head.code) && !passive) {
          // The address register is read and written; pre/post_modify's offset is read.
          args.forEach((c, i) => {
            const h = headOf(c);
            if (i === 0 && h?.code === 'reg') this.record(c, h, 'both');
            else this.walk(c, 'use');
          });
          return;
        }
    }
    args.forEach(c => this.walk(c, role));
  }

  /** The destination of a set/clobber: the reg itself is written, anything under a mem is read. */
  private dest(n: Node): void {
    if (n.kind === 'brack') { n.items.forEach(c => this.dest(c)); return; }
    const head = headOf(n);
    if (!head) return;
    const args = n.items.slice(1);
    switch (head.code) {
      case 'reg':
        this.record(n, head, 'def');
        return;
      case 'subreg': {
        const inner = args[0];
        const ih = inner && headOf(inner);
        if (!inner || !ih) return;
        if (ih.code !== 'reg') { this.dest(inner); return; }
        // A store to part of a multi-word register keeps the other words (df's read_modify_subreg_p).
        const isize = modeBytes(ih.mode), osize = modeBytes(head.mode);
        const partial = isize === undefined || osize === undefined || (isize > osize && isize > this.wordBytes);
        this.record(inner, ih, partial ? 'both' : 'def', partial);
        args.slice(1).forEach(c => this.walk(c, 'use'));
        return;
      }
      case 'strict_low_part':
        if (args[0]) this.partialDest(args[0]);
        return;
      case 'parallel':
      case 'concat':
      case 'concatn':
        args.forEach(c => this.dest(c));
        return;
      case 'expr_list': // (parallel [(expr_list (reg) (const_int offset))]) for multi-reg values
        if (args[0]) this.dest(args[0]);
        args.slice(1).forEach(c => this.walk(c, 'use'));
        return;
      case 'pc':
      case 'cc0':
      case 'scratch':
        return;
    }
    if (EXTRACT.has(head.code)) {
      if (args[0]) this.partialDest(args[0]);
      args.slice(1).forEach(c => this.walk(c, 'use'));
      return;
    }
    this.walk(n, 'use'); // mem: the address is read
  }

  /** A field of the register is written and the rest kept. */
  private partialDest(n: Node): void {
    const head = headOf(n);
    if (!head) return;
    if (head.code === 'reg') { this.record(n, head, 'both', true); return; }
    if (head.code === 'subreg') {
      const inner = n.items[1];
      const ih = inner && headOf(inner);
      if (ih?.code === 'reg') this.record(inner, ih, 'both', true);
      else if (inner) this.partialDest(inner);
      n.items.slice(2).forEach(c => this.walk(c, 'use'));
      return;
    }
    this.walk(n, 'use');
  }

  /** The insn header: uid prev next bb pattern ... */
  insn(tree: Node, kind: string): {uid?: number; bb?: number} {
    const list = tree.items[0];
    if (!list || list.kind !== 'list')
      return {};
    const items = list.items;
    const uid = isInt(items[1]) ? Number(items[1].text) : undefined;
    this.uid = uid;
    if (uid !== undefined) this.uidRef(items[1], true);
    for (const r of [items[2], items[3]])
      if (isInt(r) && Number(r.text) > 0) this.uidRef(r);
    if (kind === 'barrier')
      return {uid};

    // The bb field is left out for insns outside any block (after free_cfg, jump table labels):
    // "(insn 5 4 6 (set ...))", "(code_label 29 28 30 27 \"\" [2 uses])" where 27 is the label number.
    let bb: number | undefined;
    if (kind === 'code_label') bb = isInt(items[4]) && isInt(items[5]) ? Number(items[4].text) : undefined;
    else if (kind === 'note' && /^NOTE_INSN_EH_REGION_(?:BEG|END)$/.test(items.find((c, k) => k > 3 && !isInt(c))?.text ?? ''))
      // "(note 88 22 23 0 NOTE_INSN_EH_REGION_BEG)": the last number is the EH region, not a block.
      bb = isInt(items[4]) && isInt(items[5]) ? Number(items[4].text) : undefined;
    else if (kind !== 'jump_table_data') bb = isInt(items[4]) ? Number(items[4].text) : undefined;
    if (bb !== undefined) this.bbRef(items[4]);
    const rest = items.slice(bb !== undefined ? 5 : 4);

    if (kind === 'insn' || kind === 'jump_insn' || kind === 'call_insn' || kind === 'debug_insn') {
      const pattern = rest[0];
      if (pattern) this.walk(pattern, kind === 'debug_insn' ? 'debug' : 'use');
      // After the pattern: location string, insn code, {name}, REG notes, call usage.
      rest.slice(1).forEach(c => { if (c.kind === 'list') this.walk(c, 'use'); });
    } else if (kind === 'note') {
      for (const c of rest) {
        if (c.kind === 'brack' && c.items[0]?.text === 'bb' && isInt(c.items[1])) this.bbRef(c.items[1]);
        else if (c.kind === 'list') this.walk(c, 'debug'); // NOTE_INSN_VAR_LOCATION
      }
    } else if (kind === 'jump_table_data') {
      rest.forEach(c => this.walk(c, 'use'));
    }

    // " -> 36)": JUMP_LABEL, printed after the notes of a jump_insn.
    for (const seq of [items, tree.items])
      seq.forEach((c, i) => { if (c.text === '->' && isInt(seq[i + 1])) this.uidRef(seq[i + 1]); });
    return {uid, bb};
  }
}

/** Last line of the parenthesised form starting at line i. */
function chunkEnd(lines: string[], i: number): number {
  let depth = 0;
  let end = i;
  for (;;) {
    const text = lines[end];
    let inStr = false;
    for (let k = 0; k < text.length; k++) {
      const ch = text[k];
      if (inStr) { if (ch === '\\') k++; else if (ch === '"') inStr = false; }
      else if (ch === '"') inStr = true;
      else if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
    const next = lines[end + 1];
    if (next === undefined) return end;
    const continues = depth > 0 ? next.length > 0 && /\s/.test(next[0]) : JUMP_ARROW.test(next);
    if (!continues) return end;
    end++;
  }
}

const CFG_LINE = /^;;\s+(?:(pred|succ):)?\s+(ENTRY|EXIT|\d+)\s/;
const BB_HEADER = /^;; basic block (\d+), loop depth (\d+)(?:, count (.*?)(?:, maybe hot|, probably never executed|$))?/;
// df_print_bb_index marks EH edges: ( 2 )->[3]->( 5(EH) 4 )
const DF_GRAPH = /^\(((?:\d+(?:\(EH\))?| )*)\)->\[(\d+)\]->\(((?:\d+(?:\(EH\))?| )*)\)\s*$/;
const DF_REGSET = /^;; +(?:(?:lr|live) +(?:in|use|def|out|gen|kill)|entry block defs|exit block uses|hardware regs used|regular block artificial uses|eh block artificial uses|regs ever live|fully invalidated by EH)\s*\t/;
const BB_ARTIFICIAL = /^;; bb (\d+) artificial_(?:defs|uses):/;

const blockNo = (s: string) => (s === 'ENTRY' ? ENTRY_BLOCK : s === 'EXIT' ? EXIT_BLOCK : Number(s));


export interface RtlParseOptions {
  /** Derive the CFG from jumps and barriers even when the dump prints ;; succ lines (for checking one against the other). */
  computeCfg?: boolean;
}

export function parseRtlDump(lines: string[], options: RtlParseOptions = {}): DumpModel {
  const builders: {b: FunctionBuilder; endLine: number}[] = [];
  let current: FunctionBuilder | undefined;
  // 64-bit targets use DImode pointers; it decides which subreg stores are partial.
  // aarch64 (x0-x30) and x86-64 (r13-r15) registers say so by name.
  const wordBytes = lines.some(l => /\(reg\/f:DI |\bsp:DI\b|\[r\d+:DI\b|:[A-Z][A-Za-z0-9]* \d+ (?:x(?:[12]?\d|30)|r1[3-5])[\s)]|(?<![\w.])x(?:[12]?\d|30):[A-Z]/.test(l)) ? 8 : 4;

  const finish = (endLine: number) => {
    if (current) builders.push({b: current, endLine: Math.max(endLine, current.line)});
    current = undefined;
  };
  const fn = (line: number) => (current ??= new FunctionBuilder('(dump)', line));

  let cfgMode: 'pred' | 'succ' | undefined;
  let headerBb: number | undefined;
  let dfBb: number | undefined; // the block the next ;; lr / live lines describe
  // After free_cfg insns have no bb field, but "[bb N] NOTE_INSN_BASIC_BLOCK" still starts each
  // block; like the -slim chain, take the block from those notes.
  let noteBb: number | undefined;
  let noteLabels: InsnInfo[] = [];
  // In -slim dumps the final insn chain is printed as "   12: r99:SI=r104:SI" lines right after
  // the ;; dataflow block; the same form inside "Trying 3 -> 11:" listings is pass logging.
  let inSlimChain = false;
  let prevText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(';; Function ')) {
      const fm = FUNCTION_LINE.exec(line) ?? FUNCTION_LINE_SHORT.exec(line);
      if (fm) {
        finish(i - 1);
        current = new FunctionBuilder(fm[1], i);
        cfgMode = undefined;
        headerBb = undefined;
        inSlimChain = false;
        dfBb = undefined;
        noteBb = undefined;
        noteLabels = [];
        prevText = line;
        continue;
      }
    }

    if (line.startsWith(';;')) {
      if (current) commentLine(current, line, i);
      inSlimChain = false;
      prevText = line;
      continue;
    }

    if (line.startsWith('(')) {
      const end = chunkEnd(lines, i);
      const b = fn(i);
      const text = lines.slice(i, end + 1).join('\n');
      const walker = new ChunkWalker(text, i, b, wordBytes);
      const tm = TOP_LEVEL.exec(line);
      const df = !tm && DF_GRAPH.exec(line);
      try {
        if (df) {
          dfGraph(b, line, i, df);
        } else if (tm) {
          const kind = tm[1];
          const {uid, bb} = walker.insn(tokenize(text), kind);
          // The first insn of a chain has no previous insn: "(note 1 0 4 NOTE_INSN_DELETED)".
          if (/^\S+ \d+ 0 /.test(line)) b.chainStart = i;
          if (uid !== undefined) {
            const old = b.insns.get(uid);
            if (old) demote(b, old);
            let insnBb = bb;
            if (bb === undefined && kind !== 'barrier' && kind !== 'jump_table_data') {
              const nb = kind === 'note' ? /\[bb (\d+)\] NOTE_INSN_BASIC_BLOCK/.exec(text) : null;
              if (nb) {
                noteBb = Number(nb[1]);
                noteLabels.forEach(l => { l.bb = noteBb; });
                noteLabels = [];
              }
              insnBb = noteBb;
            }
            if (kind === 'barrier') noteBb = undefined;
            const info: InsnInfo = {uid, kind, line: i, endLine: end, bb: insnBb, seq: 0};
            if (kind === 'code_label' && bb === undefined) noteLabels.push(info);
            b.insns.set(uid, {info, occurrences: walker.recorded});
            b.labelTargets.set(uid, walker.labels);
            if (walker.returns) b.returns.add(uid); else b.returns.delete(uid);
          }
        } else {
          tokenize(text).items.forEach(n => walker.walk(n, 'log')); // "Failed to match this instruction:"
        }
      } catch {
        // A malformed form loses its own references, not the rest of the dump.
      }
      i = end;
      inSlimChain = false;
      prevText = line;
      continue;
    }

    if (current && SLIM_INSN.test(line) &&
        (inSlimChain || prevText.startsWith(';;') || /^\s*\d+: NOTE_INSN_/.test(line))) {
      // Blocks may be separated by blank lines; a new chain does not follow another chain's lines.
      if (!inSlimChain && !SLIM_INSN.test(prevText) && !/^ {6,}\S/.test(prevText)) current.chainStart = i;
      inSlimChain = true;
      current.slimLines.push(i);
    } else if (current && inSlimChain && /^ {6,}\S/.test(line)) {
      current.slimLines.push(i);
    } else {
      inSlimChain = false;
      if (current && line.length > 0) current.logLines.push(i);
    }
    if (line.trim()) prevText = line;
  }
  finish(lines.length - 1);

  // Hard register names are only spelled out in full RTL; slim log forms (x0:SI) need them.
  const hardRegs = new Map<string, number>();
  for (const {b} of builders)
    for (const v of b.vars.values())
      if (v.hardName && !hardRegs.has(v.hardName)) hardRegs.set(v.hardName, Number(v.key.slice(1)));

  return {kind: 'rtl', functions: builders.map(({b, endLine}) => build(b, endLine, lines, hardRegs, wordBytes, options))};

  // ---- ;; lines -------------------------------------------------------------

  function commentLine(b: FunctionBuilder, line: string, i: number) {
    const hm = BB_HEADER.exec(line);
    if (hm) {
      headerBb = dfBb = Number(hm[1]);
      b.headers.set(headerBb, {line: i, loopDepth: Number(hm[2]), count: hm[3]?.trim()});
      b.bbRefs.push({bb: headerBb, line: i, start: line.indexOf(hm[1], 15), end: line.indexOf(hm[1], 15) + hm[1].length});
      cfgMode = undefined;
      return;
    }
    if (line.startsWith(';;  prev block ')) {
      for (const m of line.matchAll(/block (\d+)/g))
        b.bbRefs.push({bb: Number(m[1]), line: i, start: m.index! + 6, end: m.index! + 6 + m[1].length});
      return;
    }
    const cm = CFG_LINE.exec(line);
    if (cm && (cm[1] || cfgMode)) {
      if (cm[1]) cfgMode = cm[1] as 'pred' | 'succ';
      const s = cm.index + cm[0].length - 1 - cm[2].length;
      const other = blockNo(cm[2]);
      if (/^\d+$/.test(cm[2])) b.bbRefs.push({bb: other, line: i, start: s, end: s + cm[2].length});
      if (headerBb !== undefined) {
        if (cfgMode === 'succ') b.edge(headerBb, other); else b.edge(other, headerBb);
      }
      return;
    }
    cfgMode = undefined;

    const am = BB_ARTIFICIAL.exec(line);
    if (am) {
      b.bbRefs.push({bb: Number(am[1]), line: i, start: 6, end: 6 + am[1].length});
      const regs: number[] = [];
      for (const m of line.matchAll(/[du]-?\d+\((\d+)\)/g)) {
        const s = m.index! + m[0].indexOf('(') + 1;
        logReg(b, Number(m[1]), i, s, s + m[1].length);
        regs.push(Number(m[1]));
      }
      dfSet(b, Number(am[1]), /artificial_defs/.test(line) ? 'artificial defs' : 'artificial uses', regs);
      return;
    }
    if (DF_REGSET.test(line)) {
      if (/entry block defs/.test(line)) b.entryDefsLine = i;
      if (/exit block uses/.test(line)) b.exitUsesLine = i;
      const tab = line.indexOf('\t');
      const regs: number[] = [];
      for (const m of line.slice(tab).matchAll(/(?<=\s)(\d+)(?: \[([^\]]+)\])?/g)) {
        const s = tab + m.index!;
        const v = logReg(b, Number(m[1]), i, s, s + m[0].length);
        if (m[2] && !v.hardName) v.hardName = m[2];
        regs.push(Number(m[1]));
      }
      const name = line.slice(3, tab).trim().replace(/\s+/g, ' ');
      if (/^(?:lr|live) /.test(name)) { if (dfBb !== undefined) dfSet(b, dfBb, name, regs); }
      else b.dfFunction.set(name, regs);
      return;
    }
    if (line.startsWith(';;  ref usage')) {
      for (const m of line.matchAll(/\br(\d+)=\{/g))
        logReg(b, Number(m[1]), i, m.index! + 1, m.index! + 1 + m[1].length);
    }
  }

  function dfGraph(b: FunctionBuilder, line: string, i: number, m: RegExpExecArray) {
    const bb = Number(m[2]);
    dfBb = bb;
    b.summaryLines.set(bb, i);
    for (const n of line.matchAll(/\d+/g))
      b.bbRefs.push({bb: Number(n[0]), line: i, start: n.index!, end: n.index! + n[0].length});
    for (const p of m[1].matchAll(/\d+/g)) b.edge(Number(p[0]), bb);
    for (const s of m[3].matchAll(/\d+/g)) b.edge(bb, Number(s[0]));
  }
}

/** A uid printed twice (pass logging, then the final chain): the later print is the insn. */
function demote(b: FunctionBuilder, old: PendingInsn) {
  b.labelTargets.delete(old.info.uid);
  b.returns.delete(old.info.uid);
  old.occurrences.forEach(o => { o.role = 'log'; o.uid = undefined; o.partial = undefined; });
  for (const r of b.uidRefs)
    if (r.decl && r.uid === old.info.uid && r.line >= old.info.line && r.line <= old.info.endLine) r.decl = undefined;
}

/** Later prints (the final chain) replace earlier ones (the summary before the pass ran). */
function dfSet(b: FunctionBuilder, bb: number, name: string, regs: number[]) {
  if (!b.dfBlock.has(bb)) b.dfBlock.set(bb, new Map());
  b.dfBlock.get(bb)!.set(name, regs);
}

function logReg(b: FunctionBuilder, regno: number, line: number, start: number, end: number): VarInfo {
  const v = b.variable(regno);
  v.occurrences.push({line, start, endLine: line, end, role: 'log'});
  return v;
}

// Slim RTL in pass logs: "   12: pc={(cc:CC<=0)?L36:pc}", "Trying 3, 11 -> 12:", "insn_cost 4 for 6:".
const LOG_UIDS: RegExp[] = [
  /(?:^|\s)(\d+): /g,
  /\binsns? (\d+)\b/g,
  /\buid\s*=?\s*(\d+)/g,
  /\bi[0-3]\s+(\d+)\b/g,
];
const TRYING = /^Trying ([\d, ]+) -> (\d+):/;
const SLIM_REG = /(?<![\w.])([a-z][a-z0-9_]*):([A-Z][A-Za-z0-9_]*)\b/g; // modes include V2x4SI, VNx4SI
const SLIM_LABEL = /(?<![\w.])L(\d+)\b/g;

function scanLogLine(b: FunctionBuilder, text: string, line: number, hardRegs: Map<string, number>, uids: Set<number>) {
  const seen = new Set<number>();
  const uidAt = (value: string, start: number) => {
    const uid = Number(value);
    if (seen.has(start) || !uids.has(uid)) return;
    seen.add(start);
    b.uidRefs.push({uid, line, start, end: start + value.length});
  };
  const tm = TRYING.exec(text);
  if (tm) for (const m of text.slice(0, tm[0].length).matchAll(/\d+/g)) uidAt(m[0], m.index!);
  // Every pattern ends with its number, so it sits at the last occurrence of the group.
  for (const re of LOG_UIDS)
    for (const m of text.matchAll(re)) uidAt(m[1], m.index! + m[0].lastIndexOf(m[1]));
  if (/^\s+\d+: /.test(text))
    for (const m of text.matchAll(SLIM_LABEL)) uidAt(m[1], m.index! + 1);

  for (const m of text.matchAll(SLIM_REG)) {
    const name = m[1];
    const regno = /^r\d+$/.test(name) ? Number(name.slice(1)) : hardRegs.get(name);
    if (regno === undefined) continue;
    const v = b.variable(regno);
    v.occurrences.push({line, start: m.index!, endLine: line, end: m.index! + name.length, role: 'log', mode: m[2]});
  }
}

const SLIM_INSN = /^\s{0,5}(\d+): /;

const DEPTH_OPEN = '([{';
const DEPTH_CLOSE = ')]}';

/** Index of the operator '=' of a slim SET (not part of ==, <=, >=, !=) at bracket depth 0. */
function slimAssign(text: string, from: number, to: number): number {
  let depth = 0;
  for (let k = from; k < to; k++) {
    const ch = text[k];
    if (DEPTH_OPEN.includes(ch)) depth++;
    else if (DEPTH_CLOSE.includes(ch)) depth--;
    else if (ch === '=' && depth === 0 && !'<>!='.includes(text[k - 1]) && text[k + 1] !== '=') return k;
  }
  return -1;
}

/** Splits "{a;b;}" into its top-level elements as [start, end) column ranges. */
function slimElements(text: string, from: number, to: number): [number, number][] {
  if (text[from] !== '{' || text[to - 1] !== '}') return [[from, to]];
  const out: [number, number][] = [];
  let depth = 0, start = from + 1;
  for (let k = from + 1; k < to - 1; k++) {
    const ch = text[k];
    if (DEPTH_OPEN.includes(ch)) depth++;
    else if (DEPTH_CLOSE.includes(ch)) depth--;
    else if (ch === ';' && depth === 0) { if (k > start) out.push([start, k]); start = k + 1; }
  }
  if (to - 1 > start) out.push([start, to - 1]);
  return out;
}

function slimKind(pattern: string): string {
  if (/^NOTE_INSN_/.test(pattern)) return 'note';
  if (/^L\d+:/.test(pattern)) return 'code_label';
  if (pattern === 'barrier') return 'barrier';
  if (/^debug /.test(pattern)) return 'debug_insn';
  if (/(?:^|[=;{])call /.test(pattern)) return 'call_insn';
  if (/(?:^|[;{])pc=|(?:^|[;{])(?:simple_)?return\b/.test(pattern)) return 'jump_insn';
  return 'insn';
}

/** The insn chain of a -slim dump: one insn per line, REG notes on the indented lines below. */
function parseSlimChain(b: FunctionBuilder, lines: string[], hardRegs: Map<string, number>, wordBytes: number) {
  let bb: number | undefined;
  let pendingLabels: InsnInfo[] = [];
  let last: PendingInsn | undefined;

  const reg = (name: string): number | undefined =>
      (/^r\d+$/.test(name) ? Number(name.slice(1)) : hardRegs.get(name));

  const add = (pending: PendingInsn, regno: number, line: number, start: number, len: number,
               role: Role, mode?: string, partial = false, name?: string) => {
    const v = b.variable(regno);
    if (mode) v.modes.add(mode);
    const occ: Occurrence = {line, start, endLine: line, end: start + len, role, mode,
                             uid: role === 'log' ? undefined : pending.info.uid, partial: partial || undefined};
    v.occurrences.push(occ);
    pending.occurrences.push(occ);
    if (name && !/^r\d+$/.test(name)) for (let k = 1; k < hardRegSpan(regno, name, mode, wordBytes); k++) {
      const extra: Occurrence = {...occ, implicit: true};
      b.variable(regno + k).occurrences.push(extra);
      pending.occurrences.push(extra);
    }
  };

  for (const i of b.slimLines) {
    const text = lines[i];
    if (i === b.chainStart) { bb = undefined; pendingLabels = []; last = undefined; }
    const m = SLIM_INSN.exec(text);
    if (!m) {
      // "      REG_DEAD r121:DI", "      ; pc falls through to BB 6"
      const ft = /; pc falls through to BB (\d+)/.exec(text);
      if (ft) {
        const s = ft.index + ft[0].length - ft[1].length;
        b.bbRefs.push({bb: Number(ft[1]), line: i, start: s, end: s + ft[1].length});
      }
      if (last && /^\s+REG_/.test(text))
        for (const r of text.matchAll(SLIM_REG)) {
          const regno = reg(r[1]);
          if (regno !== undefined) add(last, regno, i, r.index!, r[1].length, 'note', r[2]);
        }
      continue;
    }

    const uid = Number(m[1]);
    const col = m[0].length;
    const pattern = text.slice(col).trimEnd();
    const kind = slimKind(pattern);
    const uidCol = text.indexOf(m[1]);
    b.uidRefs.push({uid, line: i, start: uidCol, end: uidCol + m[1].length, decl: true});

    let insnBb = kind === 'barrier' ? undefined : bb;
    const nb = /^NOTE_INSN_BASIC_BLOCK (\d+)/.exec(pattern);
    if (nb) {
      bb = insnBb = Number(nb[1]);
      const s = col + pattern.indexOf(nb[1], 21);
      b.bbRefs.push({bb, line: i, start: s, end: s + nb[1].length});
      pendingLabels.forEach(l => { l.bb = bb; });
      pendingLabels = [];
    }
    if (kind === 'barrier') bb = undefined;

    const info: InsnInfo = {uid, kind, line: i, endLine: i, bb: insnBb, seq: 0};
    if (kind === 'code_label') pendingLabels.push(info);
    const old = b.insns.get(uid);
    if (old) demote(b, old);
    const pending: PendingInsn = {info, occurrences: []};
    b.insns.set(uid, pending);
    last = pending;

    // Labels (L22) name code_labels by uid.
    for (const l of pattern.matchAll(SLIM_LABEL)) {
      const s = col + l.index! + 1;
      b.uidRefs.push({uid: Number(l[1]), line: i, start: s, end: s + l[1].length});
      if (kind === 'jump_insn') {
        const list = b.labelTargets.get(uid) ?? [];
        list.push(Number(l[1]));
        b.labelTargets.set(uid, list);
      }
    }
    if (kind === 'jump_insn' && /(?:^|[;{])(?:simple_)?return\b/.test(pattern)) b.returns.add(uid);
    if (kind === 'note' || kind === 'code_label' || kind === 'barrier') continue;

    const role0: Role = kind === 'debug_insn' ? 'debug' : 'use';
    for (const [from, to] of slimElements(text, col, col + pattern.length)) {
      let dest: [number, number] | undefined;
      let conditional = false;
      let p = from;
      if (role0 === 'use') {
        if (text.startsWith('clobber ', from)) dest = [from + 8, to];
        else if (!text.startsWith('use ', from)) {
          if (text[from] === '(') {
            // cond_exec: "(cond) pattern"
            let depth = 0, k = from;
            for (; k < to; k++) { if (text[k] === '(') depth++; else if (text[k] === ')' && --depth === 0) break; }
            if (text[k + 1] === ' ') { conditional = true; p = k + 2; }
          }
          const eq = slimAssign(text, p, to);
          if (eq >= 0) dest = [p, eq];
        }
      }
      const destText = dest ? text.slice(dest[0], dest[1]) : '';
      const partialDest = conditional || /^(?:strict_low_part|zero_extract|sign_extract)\(/.test(destText);

      for (const r of text.slice(from, to).matchAll(SLIM_REG)) {
        const regno = reg(r[1]);
        if (regno === undefined) continue;
        const s = from + r.index!;
        const e = s + r[0].length;
        let role: Role = role0;
        let partial = false;
        // r1++, --r1 and sched-vis's "post r1+=8" / "pre r1+=8" (POST_MODIFY / PRE_MODIFY)
        const autoMod = /^(?:\+\+|--)/.test(text.slice(e)) || /(?:\+\+|--)$/.test(text.slice(from, s))
            || (/^\+=/.test(text.slice(e)) && /\b(?:post|pre) $/.test(text.slice(from, s)));
        if (autoMod && role0 === 'use') role = 'both';
        else if (dest && s >= dest[0] && e <= dest[1]) {
          // Inside [...] of the destination is the address: read.
          let depth = 0;
          for (let k = dest[0]; k < s; k++) { if (text[k] === '[') depth++; else if (text[k] === ']') depth--; }
          if (depth === 0) {
            // "r113:DI#0": slim drops the subreg's own mode, so judge by the inner register.
            const isize = modeBytes(r[2]);
            const subreg = text[e] === '#' && (isize === undefined || isize > wordBytes);
            partial = partialDest || subreg;
            role = partial ? 'both' : 'def';
          }
        }
        add(pending, regno, i, s, r[1].length, role, r[2], partial, r[1]);
      }
    }
  }
}

function build(b: FunctionBuilder, endLine: number, lines: string[], hardRegs: Map<string, number>,
               wordBytes: number, options: RtlParseOptions): FunctionInfo {
  parseSlimChain(b, lines, hardRegs, wordBytes);
  // Some passes print the chain twice (bbro: before and after cleanup); insns only in the
  // earlier print were deleted in between.
  if (b.chainStart !== undefined)
    for (const [uid, p] of b.insns)
      if (p.info.line < b.chainStart) { demote(b, p); b.insns.delete(uid); }
  const chain = [...b.insns.values()].map(p => p.info).sort((x, y) => x.line - y.line);
  chain.forEach((info, seq) => { info.seq = seq; });
  const insns = new Map(chain.map(info => [info.uid, info] as [number, InsnInfo]));

  const uids = new Set(insns.keys());
  for (const l of b.logLines) scanLogLine(b, lines[l], l, hardRegs, uids);
  addCallClobbers(b, chain, lines);
  for (const v of b.vars.values()) v.occurrences.sort((x, y) => x.line - y.line || x.start - y.start);

  // Blocks from the bb field of the final chain.
  const blockMap = new Map<number, BlockInfo>();
  for (const info of chain) {
    if (info.bb === undefined) continue;
    let blk = blockMap.get(info.bb);
    if (!blk) {
      blk = {index: info.bb, line: info.line, endLine: info.endLine, insnCount: 0, preds: [], succs: [], firstInsnLine: info.line};
      blockMap.set(info.bb, blk);
    }
    blk.endLine = info.endLine;
    if (info.kind === 'note' && lines[info.line].includes('NOTE_INSN_BASIC_BLOCK') && blk.noteLine === undefined)
      blk.noteLine = info.line;
    if (info.kind !== 'note' && info.kind !== 'code_label') blk.insnCount++;
  }
  for (const blk of blockMap.values()) {
    const h = b.headers.get(blk.index);
    if (h) { blk.headerLine = h.line; blk.line = Math.min(blk.line, h.line); blk.loopDepth = h.loopDepth; blk.count = h.count; }
  }

  let cfgSource: FunctionInfo['cfgSource'];
  if (b.dumpSuccs.size > 0 && !options.computeCfg) {
    cfgSource = 'dump';
    for (const blk of blockMap.values()) {
      blk.succs = [...(b.dumpSuccs.get(blk.index) ?? [])];
      blk.preds = [...(b.dumpPreds.get(blk.index) ?? [])];
    }
  } else if (blockMap.size > 0) {
    cfgSource = 'computed';
    computeCfg(chain, blockMap, b);
  }
  // Passes that run in cfglayout mode (combine, fwprop, loop2, ...) keep no barriers and let a
  // fallthrough edge skip blocks, so without ;; succ lines the derived edges are a guess.
  const cfgUncertain = cfgSource === 'computed' && blockMap.size > 1 &&
      !chain.some(i => i.kind === 'barrier') && chain.some(i => i.kind === 'jump_insn') || undefined;

  const blocks = [...blockMap.values()].sort((x, y) => x.line - y.line);
  return {name: b.name, line: b.line, endLine, blocks, vars: b.vars, insns, uidRefs: b.uidRefs,
          bbRefs: b.bbRefs, cfgSource, cfgUncertain, entryDefsLine: b.entryDefsLine, exitUsesLine: b.exitUsesLine,
          dumpDataflow: b.dfBlock.size || b.dfFunction.size ? {blocks: b.dfBlock, function: b.dfFunction} : undefined,
          blockTargets: blockTargets(blockMap, b)};
}

/**
 * A call clobbers the call-used hard registers without saying so in its RTL;
 * df records them as defs of the call. The dump lists the default ABI's set
 * as ";;  fully invalidated by EH". With -fipa-ra a call to a function already
 * compiled in this unit clobbers only what that function touches, which the
 * block's ";; lr def" reveals, so that set narrows it when the dump has it.
 */
function addCallClobbers(b: FunctionBuilder, chain: InsnInfo[], lines: string[]) {
  const abi = b.dfFunction.get('fully invalidated by EH');
  if (!abi) return;
  for (const call of chain) {
    if (call.kind !== 'call_insn' || call.bb === undefined) continue;
    const blockDefs = b.dfBlock.get(call.bb)?.get('lr def');
    const clobbered = blockDefs ? abi.filter(r => blockDefs.includes(r)) : abi;
    // Anchor on the "call_insn" keyword, or the uid of a slim "8: x0:DI=call ..." line.
    const text = lines[call.line];
    const kw = text.indexOf('call_insn');
    const start = kw >= 0 ? kw : text.search(/\d/);
    const end = kw >= 0 ? kw + 'call_insn'.length : start + String(call.uid).length;
    for (const r of clobbered)
      b.variable(r).occurrences.push({line: call.line, start, endLine: call.line, end, role: 'def', uid: call.uid, implicit: true});
  }
}

/** Where a click on a block number lands. */
function blockTargets(blocks: Map<number, BlockInfo>, b: FunctionBuilder): Map<number, number> {
  const t = new Map<number, number>();
  for (const [bb, line] of b.summaryLines) t.set(bb, line);
  for (const [bb, h] of b.headers) t.set(bb, h.line);
  for (const blk of blocks.values()) t.set(blk.index, blk.noteLine ?? blk.firstInsnLine ?? blk.line);
  return t;
}

/** Successors from the insn stream when the dump has no ;; succ lines. */
function computeCfg(chain: InsnInfo[], blocks: Map<number, BlockInfo>, b: FunctionBuilder) {
  const order = [...blocks.values()].sort((x, y) => x.line - y.line).map(blk => blk.index);
  const succs = new Map<number, Set<number>>(order.map(bb => [bb, new Set<number>()]));
  const insnBb = new Map(chain.map(i => [i.uid, i.bb]));

  // A jump table's labels belong to the tablejump before it.
  let lastJump: number | undefined;
  for (const info of chain) {
    if (info.kind === 'jump_insn') lastJump = info.uid;
    if (info.kind === 'jump_table_data' && lastJump !== undefined) {
      const list = b.labelTargets.get(lastJump) ?? [];
      list.push(...(b.labelTargets.get(info.uid) ?? []));
      b.labelTargets.set(lastJump, list);
    }
  }

  for (let k = 0; k < order.length; k++) {
    const bb = order[k];
    const members = chain.filter(i => i.bb === bb);
    const last = [...members].reverse().find(i => i.kind === 'insn' || i.kind === 'jump_insn' || i.kind === 'call_insn');
    const lastIdx = chain.indexOf(members[members.length - 1]);
    for (const label of last ? b.labelTargets.get(last.uid) ?? [] : []) {
      const t = insnBb.get(label);
      if (t !== undefined) succs.get(bb)!.add(t);
    }
    if (last && b.returns.has(last.uid)) succs.get(bb)!.add(EXIT_BLOCK);
    // Falls through unless a barrier ends the block.
    let barrier = false;
    for (let j = lastIdx + 1; j < chain.length && chain[j].bb === undefined; j++)
      if (chain[j].kind === 'barrier') barrier = true;
    if (!barrier) succs.get(bb)!.add(k + 1 < order.length ? order[k + 1] : EXIT_BLOCK);
  }

  for (const blk of blocks.values()) { blk.succs = [...succs.get(blk.index)!]; blk.preds = []; }
  if (order.length) blocks.get(order[0])!.preds.push(ENTRY_BLOCK);
  for (const [from, set] of succs)
    for (const to of set) blocks.get(to)?.preds.push(from);
}
