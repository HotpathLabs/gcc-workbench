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

import * as vscode from 'vscode';
import { parseGimpleDump } from './dumpModel/gimpleModel';
import { parseRtlDump } from './dumpModel/rtlModel';
import { explainFlags, flagHeadAt } from './dumpModel/rtlFlags';
import {
  BbRef, DumpModel, ENTRY_BLOCK, EXIT_BLOCK, FlowQuery, FunctionInfo, LabelRef, Occurrence, PositionIndex, Target,
  UidRef, VarHit, VarInfo, isRead, isWrite,
} from './dumpModel/types';

/**
 * Language features for GCC RTL and GIMPLE dumps: outline, go to definition,
 * find references, highlights and hover for registers / SSA names /
 * variables, insn uids, basic block numbers and GIMPLE labels.
 *
 * For RTL registers and non-SSA GIMPLE variables, go to definition follows
 * reaching definitions over the CFG (the dump's ;; pred/succ lines, or one
 * derived from jumps), so a use lands on the defs that can actually produce
 * its value. An SSA name has exactly one def, or is a default def whose value
 * comes from the parameter (or is undefined).
 *
 * Everything is derived from the dump text itself, so no .dot files are
 * needed. Each document is parsed once per version.
 */
export class DumpIndex {
  private cache = new Map<string, {version: number; model: DumpModel; positions: PositionIndex}>();

  private entry(doc: vscode.TextDocument) {
    const key = doc.uri.toString();
    const hit = this.cache.get(key);
    if (hit && hit.version === doc.version)
      return hit;

    const lines = Array.from({length: doc.lineCount}, (_, i) => doc.lineAt(i).text);
    const model = doc.languageId === 'gcc-gimple' ? parseGimpleDump(lines) : parseRtlDump(lines);
    const e = {version: doc.version, model, positions: new PositionIndex(model)};
    this.cache.set(key, e);
    return e;
  }

  get(doc: vscode.TextDocument): DumpModel { return this.entry(doc).model; }

  targetAt(doc: vscode.TextDocument, pos: vscode.Position): Target | undefined {
    return this.entry(doc).positions.targetAt(pos.line, pos.character);
  }

  forget(doc: vscode.TextDocument) { this.cache.delete(doc.uri.toString()); }
}

const toRange = (o: Occurrence) => new vscode.Range(o.line, o.start, o.endLine, o.end);
const refRange = (r: UidRef | BbRef | LabelRef) => new vscode.Range(r.line, r.start, r.line, r.end);
const lineRange = (doc: vscode.TextDocument, line: number) => doc.lineAt(Math.min(line, doc.lineCount - 1)).range;
const blockName = (bb: number) => (bb === ENTRY_BLOCK ? 'ENTRY' : bb === EXIT_BLOCK ? 'EXIT' : `bb ${bb}`);

/** Markdown-escapes text taken from the dump (function names, debug names). */
const esc = (t: string) => t.replace(/[\\`*_{}\[\]()#+\-.!<>|~&]/g, '\\$&');

/** Inline code whose fence is longer than any backtick run inside, so dump text cannot close it. */
function code(t: string): string {
  const run = Math.max(0, ...(t.match(/`+/g) ?? []).map(r => r.length));
  const fence = '`'.repeat(run + 1);
  return `${fence} ${t.replace(/[\r\n]+/g, ' ')} ${fence}`;
}

function codeBlock(md: vscode.MarkdownString, text: string, language: string) {
  const run = Math.max(0, ...(text.match(/`+/g) ?? []).map(r => r.length));
  const fence = '`'.repeat(Math.max(3, run + 1));
  md.appendMarkdown(`${fence}${language}\n${text}\n${fence}\n`);
}

/**
 * Where a value coming into the function is described. RTL: the register's
 * entry in ";;  entry block defs". GIMPLE: the parameter in the signature (or
 * the -alias "int a_1(D) = a;" line), else the variable's declaration.
 * Falls back to the function line.
 */
function entryLocation(doc: vscode.TextDocument, fn: FunctionInfo, v: VarInfo): vscode.Location {
  const decl = (x: VarInfo | undefined) => x?.occurrences.find(o => o.role === 'decl');
  let o: Occurrence | undefined;
  if (fn.entryDefsLine !== undefined) o = v.occurrences.find(x => x.line === fn.entryDefsLine);
  else if (v.ssa) o = v.occurrences.find(x => x.role === 'def' && x.uid === undefined) ??
                     decl(v.base !== undefined ? fn.vars.get(v.base) : undefined) ?? decl(v);
  else o = decl(v);
  return new vscode.Location(doc.uri, o ? toRange(o) : lineRange(doc, fn.signatureLine ?? fn.line));
}


interface Flow {
  defs?: ReturnType<FlowQuery['reachingDefs']>;
  uses?: ReturnType<FlowQuery['reachedUses']>;
}

/** Reaching defs for a read, reached uses for a write; nothing when the occurrence is outside the chain. */
function flowOf(hit: VarHit): Flow {
  const o = hit.occurrence;
  if (o.uid === undefined || o.role === 'log' || o.role === 'decl')
    return {};
  if (hit.variable.ssa) {
    // One def reaches every use; there is nothing to kill it.
    const v = hit.variable;
    const flow: Flow = {};
    if (isRead(o)) {
      const defs = v.occurrences.filter(d => isWrite(d) && d.uid !== undefined);
      flow.defs = {occurrences: defs, fromEntry: !!v.defaultDef && !defs.length, toExit: false};
    }
    if (isWrite(o))
      flow.uses = {occurrences: v.occurrences.filter(x => isRead(x) && x.uid !== undefined), fromEntry: false, toExit: false};
    return flow;
  }
  const q = new FlowQuery(hit.fn, hit.variable);
  if (!q.supports(o))
    return {};
  const flow: Flow = {};
  // A REG note describes the register at its insn, like a use there. (A GIMPLE note is &x: no value involved.)
  if (isRead(o) || (o.role === 'note' && hit.fn.stmtKind !== 'stmt')) flow.defs = q.reachingDefs(o);
  if (isWrite(o)) flow.uses = q.reachedUses(o);
  return flow;
}

function insnLink(doc: vscode.TextDocument, fn: FunctionInfo, o: Occurrence): string {
  const insn = o.uid !== undefined ? fn.insns.get(o.uid) : undefined;
  const label = insn && fn.stmtKind !== 'stmt' ? `insn ${insn.uid}` : `line ${o.line + 1}`;
  const where = insn?.bb !== undefined ? ` (bb ${insn.bb})` : '';
  return `[${label}](${doc.uri.with({fragment: `L${o.line + 1},${o.start + 1}`})})${where}`;
}

function uniqueByInsn(list: Occurrence[]): Occurrence[] {
  const seen = new Set<string>();
  return list.filter(o => {
    const k = o.uid !== undefined ? 'u' + o.uid : 'l' + o.line;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** One line per flag: "`/v` SUBREG_PROMOTED_UNSIGNED_P: ...", the hovered one in bold. */
function flagLines(rtx: string, letters: string[], hovered?: string): string {
  return explainFlags(rtx, letters).map(f => {
    const line = `${code('/' + f.letter)}${f.macro ? ` ${esc(f.macro)}` : ''}: ${f.text}`;
    return f.letter === hovered ? `- **${line}**` : `- ${line}`;
  }).join('\n') + '\n\n';
}

function varHover(doc: vscode.TextDocument, hit: VarHit): vscode.MarkdownString {
  const {fn, variable: v, occurrence: o} = hit;
  const real = v.occurrences.filter(x => x.role !== 'log' && x.role !== 'note');
  const defs = real.filter(isWrite);
  const uses = real.filter(isRead);
  const md = new vscode.MarkdownString();
  const names = [...(v.userNames ?? [])];
  const shown = esc(v.display ?? v.key);
  const title = names.length ? `**${shown}** ${names.map(code).join(', ')}` : `**${shown}**`;
  md.appendMarkdown(`#### ${title}\n\n`);

  const facts: string[] = [];
  if (v.type) facts.push(`type ${code(v.type)}`);
  if (v.virtual) facts.push('virtual operand (memory state)');
  else if (v.ssa) facts.push(v.base ? `SSA name of ${code(v.base)}` : 'SSA temporary');
  else if (fn.stmtKind === 'stmt') {
    const param = v.occurrences.some(x => x.role === 'decl' && x.line === fn.signatureLine);
    const accessed = v.occurrences.some(x => x.uid !== undefined && x.role !== 'note');
    // Pre-SSA dumps have SSA temporaries (_1, r.0_6) too; SSA form renames the variables themselves.
    const inSsa = [...fn.vars.values()].some(x => x.ssa && (x.defaultDef || (x.base !== undefined && fn.vars.get(x.base)?.ssa === false)));
    facts.push(v.key.startsWith('D#') ? 'debug temporary'
        : v.key === '<retval>' ? 'the return value'
        : v.storage === 'global' ? 'declared outside this function'
        : v.storage === 'static' ? 'static local'
        : (param ? 'parameter' : 'local variable') + (accessed && inSsa ? ' kept in memory (not in SSA form)' : ''));
    if (v.display !== undefined && v.declLine !== undefined) facts.push(`declared on line ${v.declLine + 1} (shadows an outer ${code(v.display)})`);
  }
  if (v.defaultDef) facts.push('default def (value on entry)');
  if (v.abnormal) facts.push('used across an abnormal edge (setjmp / nonlocal goto)');
  if (v.addressTaken) facts.push('address taken');
  if (v.modes.size) facts.push(`mode ${[...v.modes].join(', ')}`);
  if (v.hardName) facts.push(`hard reg ${code(v.hardName)}`);
  if (v.flags.size) facts.push(`flags ${[...v.flags].map(f => '/' + f).join('')}`);
  facts.push(`${defs.length} def${defs.length === 1 ? '' : 's'}`, `${uses.length} use${uses.length === 1 ? '' : 's'}`);
  md.appendMarkdown(facts.join(' · ') + '\n\n');
  // The flags GCC printed on this mention: (reg/v/f:DI 108).
  const here = o.flags?.split('/').filter(Boolean) ?? [];
  if (here.length && fn.stmtKind !== 'stmt') md.appendMarkdown(`**Flags here** ${code(o.flags!)}\n\n` + flagLines('reg', here));
  if (fn.stmtKind === 'stmt' && !v.ssa) {
    const versions = [...fn.vars.values()].filter(x => x.ssa && x.base === v.key).map(x => x.key + (x.defaultDef ? '(D)' : ''));
    if (versions.length)
      md.appendMarkdown(`**SSA names:** ${versions.slice(0, 12).map(code).join(', ')}${versions.length > 12 ? ', …' : ''}\n\n`);
  }

  const gimple = fn.stmtKind === 'stmt';
  const addressOf = gimple && /&\s*$/.test(doc.lineAt(o.line).text.slice(0, o.start));
  const role: Record<string, string> = {
    def: 'written here', use: 'read here',
    both: addressOf ? 'address passed to a call: may be read and written there'
        : o.partial ? 'partly written here (the rest is kept)' : 'read and written here',
    note: addressOf ? 'address taken here (not a read)'
        : gimple && /^\s*#\s*DEBUG\b/.test(doc.lineAt(o.line).text) ? 'debug info says where it lives from here (not a read)'
        : gimple ? 'named here (not a read)' : 'mentioned by a REG note',
    debug: 'read by debug info only', log: 'mentioned in pass logging', decl: 'declared here',
  };
  if (o.role === 'def' && o.uid === undefined && v.defaultDef) md.appendMarkdown('*default def: the value on entry*\n\n');
  else md.appendMarkdown(`*${role[o.role]}*\n\n`);
  if (v.annotations?.length) codeBlock(md, v.annotations.join('\n'), doc.languageId);

  const flow = flowOf(hit);
  if (flow.defs) {
    const list = uniqueByInsn(flow.defs.occurrences).map(d => insnLink(doc, fn, d) + (d.implicit ? ' *(clobbered by the call)*' : ''));
    if (flow.defs.fromEntry) {
      const isParam = (x: VarInfo | undefined) => !!x?.occurrences.some(d => d.role === 'decl' && d.line === fn.signatureLine);
      const param = v.ssa ? (v.defaultDef && v.base !== undefined && isParam(fn.vars.get(v.base)) ? v.base : undefined)
                          : (isParam(v) ? v.key : undefined);
      list.push(param !== undefined ? `parameter ${code(param)} (value on entry)`
          : v.storage ? 'its value before this call of the function'
          : v.ssa || fn.stmtKind === 'stmt' ? 'function entry (uninitialised)'
          : `function entry${v.hardName ? ` (incoming ${code(v.hardName)})` : ''}`);
    }
    md.appendMarkdown(`**Reaching defs:** ${list.length ? list.join(', ') : 'none'}\n\n`);
  }
  if (flow.uses) {
    const list = uniqueByInsn(flow.uses.occurrences).map(u => insnLink(doc, fn, u) + (u.role === 'debug' ? ' *(debug)*' : ''));
    const liveOut = fn.exitUsesLine !== undefined && v.occurrences.some(x => x.line === fn.exitUsesLine);
    if (flow.uses.toExit && liveOut) list.push('function exit');
    const none = v.ssa ? 'none (unused)' : fn.stmtKind === 'stmt' && (v.addressTaken || v.storage || !v.type) ? 'none in this function' : 'none (dead store)';
    md.appendMarkdown(`**Reached uses:** ${list.length ? list.join(', ') : none}\n\n`);
  }
  if (!flow.defs && !flow.uses && defs.length) {
    md.appendMarkdown(`**Defs:** ${uniqueByInsn(defs).slice(0, 12).map(d => insnLink(doc, fn, d)).join(', ')}` +
                      `${defs.length > 12 ? ', …' : ''}\n\n`);
  }
  if ((v.addressTaken || v.storage) && !v.ssa && (flow.defs || flow.uses))
    md.appendMarkdown(v.storage ? `*It outlives the call: other functions and stores through pointers can change it too.*\n\n`
                                : `*Its address is taken: stores through pointers and calls are not tracked.*\n\n`);
  if (fn.stmtKind === 'stmt') {
    if (fn.cfgUncertain && !v.ssa && (flow.defs || flow.uses))
      md.appendMarkdown(`*⚠ Some edges could not be derived from the dump (dump with -blocks for exact results).*\n`);
  } else if (fn.cfgSource === 'computed' && (flow.defs || flow.uses))
    md.appendMarkdown(fn.cfgUncertain
        ? `*⚠ CFG guessed from insn order: the dump has no ;; succ lines and no barriers (cfglayout mode?), so fallthrough edges may be wrong. Dump with -da (or -blocks) for exact results.*\n`
        : `*CFG derived from jumps and barriers; the dump has no ;; succ lines, so EH and abnormal edges are missing. Dump with -da (or -blocks) for exact results.*\n`);
  return md;
}

function blockHover(fn: FunctionInfo, bb: number): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  const blk = fn.blocks.find(b => b.index === bb);
  md.appendMarkdown(`#### ${blockName(bb)} — ${esc(fn.name)}\n\n`);
  if (!blk) {
    if (bb === ENTRY_BLOCK) md.appendMarkdown('The function entry block (no insns).');
    else if (bb === EXIT_BLOCK) md.appendMarkdown('The function exit block (no insns).');
    else md.appendMarkdown('Not in the insn chain of this dump.');
    return md;
  }
  const unit = fn.stmtKind === 'stmt' ? 'stmt' : 'insn';
  const facts = [`${blk.insnCount} ${unit}${blk.insnCount === 1 ? '' : 's'}`, `lines ${blk.line + 1}–${blk.endLine + 1}`];
  if (blk.loopDepth !== undefined) facts.push(`loop depth ${blk.loopDepth}`);
  if (blk.count) facts.push(`count ${blk.count}`);
  md.appendMarkdown(facts.join(' · ') + '\n\n');
  md.appendMarkdown(`**pred:** ${blk.preds.map(blockName).join(', ') || '—'}  \n`);
  md.appendMarkdown(`**succ:** ${blk.succs.map(blockName).join(', ') || '—'}\n\n`);
  // GCC's own liveness for the block, as the dump printed it.
  const df = fn.dumpDataflow?.blocks.get(bb);
  const regName = (r: number) => fn.vars.get('r' + r)?.hardName ?? `r${r}`;
  for (const set of ['lr in', 'lr out']) {
    const regs = df?.get(set);
    if (!regs) continue;
    const shown = regs.slice(0, 40).map(regName).join(' ');
    md.appendMarkdown(`**${set}:** ${regs.length ? code(shown + (regs.length > 40 ? ' …' : '')) : '—'}  \n`);
  }
  if (fn.cfgUncertain)
    md.appendMarkdown(fn.stmtKind === 'stmt' ? `\n*⚠ Some edges could not be derived from the dump (dump with -blocks for exact results).*\n`
                                             : `\n*⚠ Edges guessed from insn order (no ;; succ lines, no barriers).*\n`);
  return md;
}

function labelHover(doc: vscode.TextDocument, fn: FunctionInfo, name: string): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`#### label ${code(name)} — ${esc(fn.name)}\n\n`);
  const line = fn.labels?.get(name);
  if (line === undefined) {
    md.appendMarkdown('Not defined in this function body.');
    return md;
  }
  const blk = fn.blocks.find(b => line >= b.line && line <= b.endLine);
  const jumps = (fn.labelRefs ?? []).filter(r => r.name === name && !r.decl).length;
  md.appendMarkdown(`line ${line + 1}${blk ? ` · starts ${blockName(blk.index)}` : ''} · ${jumps} jump${jumps === 1 ? '' : 's'} to it\n\n`);
  codeBlock(md, doc.lineAt(line).text.trim(), doc.languageId);
  return md;
}

function insnHover(doc: vscode.TextDocument, fn: FunctionInfo, uid: number): vscode.MarkdownString | undefined {
  const insn = fn.insns.get(uid);
  if (!insn) return undefined;
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`#### ${insn.kind} ${uid}${insn.bb !== undefined ? ` · bb ${insn.bb}` : ''} · line ${insn.line + 1}\n\n`);
  const last = Math.min(insn.endLine, insn.line + 11);
  const text = Array.from({length: last - insn.line + 1}, (_, i) => doc.lineAt(insn.line + i).text);
  if (last < insn.endLine) text.push('    …');
  codeBlock(md, text.join('\n'), doc.languageId);
  return md;
}

export class DumpSymbolProvider implements vscode.DocumentSymbolProvider {
  constructor(private index: DumpIndex) {}

  provideDocumentSymbols(doc: vscode.TextDocument): vscode.DocumentSymbol[] {
    const model = this.index.get(doc);
    return model.functions.map(fn => {
      const range = new vscode.Range(fn.line, 0, fn.endLine, lineRange(doc, fn.endLine).end.character);
      const sym = new vscode.DocumentSymbol(
          fn.name, model.kind === 'rtl' ? `${fn.blocks.length} blocks · ${fn.vars.size} regs`
              : `${fn.blocks.length} blocks · ${[...fn.vars.values()].filter(v => v.ssa && !v.virtual).length} SSA names`,
          vscode.SymbolKind.Function, range, lineRange(doc, fn.line));
      sym.children = fn.blocks.map(b => {
        const br = new vscode.Range(b.line, 0, b.endLine, lineRange(doc, b.endLine).end.character);
        const sel = lineRange(doc, b.noteLine ?? b.line);
        const detail = [`${b.insnCount} ${model.kind === 'rtl' ? 'insns' : 'stmts'}`];
        if (b.succs.length) detail.push(`→ ${b.succs.map(blockName).join(' ')}`);
        return new vscode.DocumentSymbol(`bb ${b.index}`, detail.join(' · '), vscode.SymbolKind.Namespace, br, sel);
      });
      return sym;
    });
  }
}

export class DumpNavigationProvider implements
    vscode.DefinitionProvider, vscode.ReferenceProvider, vscode.DocumentHighlightProvider, vscode.HoverProvider {
  constructor(private index: DumpIndex) {}

  provideDefinition(doc: vscode.TextDocument, pos: vscode.Position): vscode.Location[] | undefined {
    const t = this.index.targetAt(doc, pos);
    if (!t) return undefined;
    if (t.kind === 'bb') {
      const line = t.fn.blockTargets?.get(t.ref.bb) ?? t.fn.blocks.find(b => b.index === t.ref.bb)?.line;
      return line === undefined ? undefined : [new vscode.Location(doc.uri, lineRange(doc, line))];
    }
    if (t.kind === 'uid') {
      const insn = t.fn.insns.get(t.ref.uid);
      return insn ? [new vscode.Location(doc.uri, lineRange(doc, insn.line))] : undefined;
    }
    if (t.kind === 'label') {
      const decl = (t.fn.labelRefs ?? []).find(r => r.name === t.ref.name && r.decl);
      return decl ? [new vscode.Location(doc.uri, refRange(decl))] : undefined;
    }

    const {fn, variable: v, occurrence: o} = t.hit;
    const at = (x: Occurrence) => new vscode.Location(doc.uri, toRange(x));
    // On a def, answer with the def itself so the editor offers its references instead.
    if (o.role === 'def') return [at(o)];
    if (o.role === 'decl') return v.occurrences.filter(x => x.role === 'def' && x.uid !== undefined).map(at).concat(at(o));
    const flow = flowOf(t.hit);
    if (flow.defs) {
      const out = flow.defs.occurrences.map(at);
      if (flow.defs.fromEntry) out.push(entryLocation(doc, fn, v));
      return out.length ? out : [at(o)];
    }
    // Outside the chain (logs, dataflow sets): every def of the register.
    const defs = v.occurrences.filter(x => isWrite(x) && x.role !== 'log').map(at);
    if (v.ssa && v.defaultDef && !defs.length) return [entryLocation(doc, fn, v)];
    return defs.length ? defs : [entryLocation(doc, fn, v)];
  }

  provideReferences(doc: vscode.TextDocument, pos: vscode.Position, ctx: vscode.ReferenceContext): vscode.Location[] | undefined {
    const t = this.index.targetAt(doc, pos);
    if (!t) return undefined;
    if (t.kind === 'bb')
      return (t.fn.bbRefs ?? []).filter(r => r.bb === t.ref.bb).map(r => new vscode.Location(doc.uri, refRange(r)));
    if (t.kind === 'uid')
      return t.fn.uidRefs.filter(r => r.uid === t.ref.uid && (ctx.includeDeclaration || !r.decl))
          .map(r => new vscode.Location(doc.uri, refRange(r)));
    if (t.kind === 'label')
      return (t.fn.labelRefs ?? []).filter(r => r.name === t.ref.name && (ctx.includeDeclaration || !r.decl))
          .map(r => new vscode.Location(doc.uri, refRange(r)));
    return t.hit.variable.occurrences
        .filter(o => ctx.includeDeclaration || (o.role !== 'def' && o.role !== 'decl'))
        .map(o => new vscode.Location(doc.uri, toRange(o)));
  }

  provideDocumentHighlights(doc: vscode.TextDocument, pos: vscode.Position): vscode.DocumentHighlight[] | undefined {
    const t = this.index.targetAt(doc, pos);
    if (!t) return undefined;
    const K = vscode.DocumentHighlightKind;
    if (t.kind === 'bb')
      return (t.fn.bbRefs ?? []).filter(r => r.bb === t.ref.bb).map(r => new vscode.DocumentHighlight(refRange(r), K.Text));
    if (t.kind === 'uid')
      return t.fn.uidRefs.filter(r => r.uid === t.ref.uid)
          .map(r => new vscode.DocumentHighlight(refRange(r), r.decl ? K.Write : K.Text));
    if (t.kind === 'label')
      return (t.fn.labelRefs ?? []).filter(r => r.name === t.ref.name)
          .map(r => new vscode.DocumentHighlight(refRange(r), r.decl ? K.Write : K.Text));
    return t.hit.variable.occurrences.map(o => new vscode.DocumentHighlight(
        toRange(o), isWrite(o) ? K.Write : isRead(o) ? K.Read : K.Text));
  }

  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    const head = doc.languageId === 'gcc-rtl' ? flagHeadAt(doc.lineAt(pos.line).text, pos.character) : undefined;
    if (head) {
      // On "(subreg/s/v:SI": what each flag means for this rtx code, the hovered one first in bold.
      const hovered = head.letters[head.spans.findIndex(([s, e]) => pos.character >= s && pos.character < e)];
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`#### ${code(head.code + head.letters.map(l => '/' + l).join(''))} flags\n\n`);
      md.appendMarkdown(flagLines(head.code, head.letters, hovered));
      return new vscode.Hover(md, new vscode.Range(pos.line, head.start + 1, pos.line, head.end));
    }
    const t = this.index.targetAt(doc, pos);
    if (!t) return undefined;
    if (t.kind === 'bb') return new vscode.Hover(blockHover(t.fn, t.ref.bb), refRange(t.ref));
    if (t.kind === 'uid') {
      const md = insnHover(doc, t.fn, t.ref.uid);
      return md && new vscode.Hover(md, refRange(t.ref));
    }
    if (t.kind === 'label') return new vscode.Hover(labelHover(doc, t.fn, t.ref.name), refRange(t.ref));
    return new vscode.Hover(varHover(doc, t.hit), toRange(t.hit.occurrence));
  }
}

export function registerDumpLanguage(context: vscode.ExtensionContext): void {
  const index = new DumpIndex();
  const nav = new DumpNavigationProvider(index);
  const symbols = new DumpSymbolProvider(index);

  for (const language of ['gcc-rtl', 'gcc-gimple']) {
    const selector: vscode.DocumentSelector = {language};
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(selector, symbols),
        vscode.languages.registerDefinitionProvider(selector, nav),
        vscode.languages.registerReferenceProvider(selector, nav),
        vscode.languages.registerDocumentHighlightProvider(selector, nav),
        vscode.languages.registerHoverProvider(selector, nav));
  }
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(d => index.forget(d)));
}
