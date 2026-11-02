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
import { GccMdCache, GccSymbol } from './mdCache';
import { MdKind, scanMdTokens } from './mdTokenScan';

export const MD_TOKEN_TYPES = ['gccIterator', 'gccAttribute'];

/** `define_mode_attr` / `define_code_attr` / ...: attributes read as <name>, not insn attributes. */
const SUBSTITUTION_ATTR = /^\(define_(mode|code|int|subst)_attr\b/;

/**
 * Colours machine-description iterators and iterator attributes by looking
 * them up in the index, since TextMate cannot know which names a backend
 * defines (any_extend, wa_v, ...).
 *
 *  - iterators:  any bare occurrence, or <ITER> inside a string
 *  - attributes: <name> / <ITER:name> and the name after define_*_attr
 */
export class GccMdSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  public readonly legend = new vscode.SemanticTokensLegend(MD_TOKEN_TYPES);

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChangeSemanticTokens = this._onDidChange.event;

  constructor(private readonly mdCache: GccMdCache) {}

  /** Call after the index (re)builds: tokens requested earlier saw an empty cache. */
  public refresh(): void { this._onDidChange.fire(); }

  private kindOf(uri: vscode.Uri, name: string): MdKind | undefined {
    const syms: GccSymbol[] = this.mdCache.getAllSymbols(uri, name);
    if (syms.some(s => s.type === 'iterator'))
      return 'iterator';
    if (syms.some(s => s.type === 'attribute' && SUBSTITUTION_ATTR.test(s.definition)))
      return 'attribute';
    return undefined;
  }

  provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens {
    const builder = new vscode.SemanticTokensBuilder(this.legend);
    const cache = new Map<string, MdKind | undefined>();
    const lookup = (name: string) => {
      if (!cache.has(name))
        cache.set(name, this.kindOf(document.uri, name));
      return cache.get(name);
    };

    const lines = Array.from({length : document.lineCount}, (_, i) => document.lineAt(i).text);
    for (const t of scanMdTokens(lines, lookup))
      builder.push(t.line, t.start, t.length, t.kind === 'iterator' ? 0 : 1);
    return builder.build();
  }
}
