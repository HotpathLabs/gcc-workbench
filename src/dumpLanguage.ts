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
import { DumpModel, FunctionInfo, Occurrence, VarInfo, findFunctionAt, findVarAt } from './dumpModel/types';

/**
 * Language features for GCC RTL and GIMPLE dumps: outline, go to definition,
 * find references, highlights and hover for registers / SSA names, and
 * jumping from an insn uid (prev/next, label_ref) to its insn.
 *
 * Everything is derived from the dump text itself, so no .dot files are
 * needed. Each document is parsed once per version.
 */
export class DumpIndex {
  private cache = new Map<string, {version: number; model: DumpModel}>();

  get(doc: vscode.TextDocument): DumpModel {
    const key = doc.uri.toString();
    const hit = this.cache.get(key);
    if (hit && hit.version === doc.version)
      return hit.model;

    const lines = Array.from({length: doc.lineCount}, (_, i) => doc.lineAt(i).text);
    const model = doc.languageId === 'gcc-gimple' ? parseGimpleDump(lines) : parseRtlDump(lines);
    this.cache.set(key, {version: doc.version, model});
    return model;
  }

  forget(doc: vscode.TextDocument) { this.cache.delete(doc.uri.toString()); }
}

const toRange = (o: Occurrence) => new vscode.Range(o.line, o.start, o.endLine, o.end);

function summary(doc: vscode.TextDocument, v: VarInfo): vscode.MarkdownString {
  const defs = v.occurrences.filter(o => o.role === 'def' || o.role === 'both');
  const uses = v.occurrences.filter(o => o.role === 'use' || o.role === 'both');
  const md = new vscode.MarkdownString();
  const title = v.userName ? `**${v.key}** \`${v.userName}\`` : `**${v.key}**`;
  md.appendMarkdown(`#### ${title}\n\n`);
  const facts: string[] = [];
  if (v.modes.size) facts.push(`mode ${[...v.modes].join(', ')}`);
  if (v.hardName) facts.push(`hard reg \`${v.hardName}\``);
  if (v.flags.size) facts.push(`flags ${[...v.flags].map(f => '/' + f).join('')}`);
  facts.push(`${defs.length} def${defs.length === 1 ? '' : 's'}`, `${uses.length} use${uses.length === 1 ? '' : 's'}`);
  md.appendMarkdown(facts.join(' · ') + '\n');
  if (defs.length) {
    const first = defs[0];
    const text = doc.lineAt(first.line).text.trim();
    md.appendMarkdown(`\n\nFirst def, line ${first.line + 1}:\n`);
    md.appendCodeblock(text.slice(0, 120), doc.languageId);
  }
  return md;
}

export class DumpSymbolProvider implements vscode.DocumentSymbolProvider {
  constructor(private index: DumpIndex) {}

  provideDocumentSymbols(doc: vscode.TextDocument): vscode.DocumentSymbol[] {
    const model = this.index.get(doc);
    return model.functions.map(fn => {
      const range = new vscode.Range(fn.line, 0, fn.endLine, doc.lineAt(Math.min(fn.endLine, doc.lineCount - 1)).text.length);
      const sym = new vscode.DocumentSymbol(
          fn.name, `${fn.blocks.length} blocks · ${fn.vars.size} ${model.kind === 'rtl' ? 'regs' : 'SSA names'}`,
          vscode.SymbolKind.Function, range, new vscode.Range(fn.line, 0, fn.line, doc.lineAt(fn.line).text.length));
      sym.children = fn.blocks.map(b => {
        const br = new vscode.Range(b.line, 0, b.endLine, doc.lineAt(Math.min(b.endLine, doc.lineCount - 1)).text.length);
        return new vscode.DocumentSymbol(`bb ${b.index}`, `${b.insnCount} insns`, vscode.SymbolKind.Namespace, br,
                                         new vscode.Range(b.line, 0, b.line, doc.lineAt(b.line).text.length));
      });
      return sym;
    });
  }
}

export class DumpNavigationProvider implements
    vscode.DefinitionProvider, vscode.ReferenceProvider, vscode.DocumentHighlightProvider, vscode.HoverProvider {
  constructor(private index: DumpIndex) {}

  private uidTarget(doc: vscode.TextDocument, fn: FunctionInfo, pos: vscode.Position): vscode.Location | undefined {
    const ref = fn.uidRefs.find(r => r.line === pos.line && pos.character >= r.start && pos.character <= r.end);
    const insn = ref && fn.insns.get(ref.uid);
    return insn ? new vscode.Location(doc.uri, new vscode.Range(insn.line, 0, insn.line, doc.lineAt(insn.line).text.length)) : undefined;
  }

  provideDefinition(doc: vscode.TextDocument, pos: vscode.Position): vscode.Location[] | undefined {
    const model = this.index.get(doc);
    const hit = findVarAt(model, pos.line, pos.character);
    if (hit) {
      const defs = hit.variable.occurrences.filter(o => o.role === 'def' || o.role === 'both');
      return defs.map(o => new vscode.Location(doc.uri, toRange(o)));
    }
    const fn = findFunctionAt(model, pos.line);
    const target = fn && this.uidTarget(doc, fn, pos);
    return target ? [target] : undefined;
  }

  provideReferences(doc: vscode.TextDocument, pos: vscode.Position, ctx: vscode.ReferenceContext): vscode.Location[] | undefined {
    const hit = findVarAt(this.index.get(doc), pos.line, pos.character);
    if (!hit) return undefined;
    return hit.variable.occurrences
        .filter(o => ctx.includeDeclaration || (o.role !== 'def'))
        .map(o => new vscode.Location(doc.uri, toRange(o)));
  }

  provideDocumentHighlights(doc: vscode.TextDocument, pos: vscode.Position): vscode.DocumentHighlight[] | undefined {
    const hit = findVarAt(this.index.get(doc), pos.line, pos.character);
    if (!hit) return undefined;
    return hit.variable.occurrences.map(o => new vscode.DocumentHighlight(
        toRange(o), o.role === 'def' || o.role === 'both' ? vscode.DocumentHighlightKind.Write : vscode.DocumentHighlightKind.Read));
  }

  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    const hit = findVarAt(this.index.get(doc), pos.line, pos.character);
    if (!hit) return undefined;
    return new vscode.Hover(summary(doc, hit.variable), toRange(hit.occurrence));
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
