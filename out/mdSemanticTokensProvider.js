"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GccMdSemanticTokensProvider = exports.MD_TOKEN_TYPES = void 0;
const vscode = __importStar(require("vscode"));
const mdTokenScan_1 = require("./mdTokenScan");
exports.MD_TOKEN_TYPES = ['gccIterator', 'gccAttribute'];
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
class GccMdSemanticTokensProvider {
    mdCache;
    legend = new vscode.SemanticTokensLegend(exports.MD_TOKEN_TYPES);
    _onDidChange = new vscode.EventEmitter();
    onDidChangeSemanticTokens = this._onDidChange.event;
    constructor(mdCache) {
        this.mdCache = mdCache;
    }
    /** Call after the index (re)builds: tokens requested earlier saw an empty cache. */
    refresh() { this._onDidChange.fire(); }
    kindOf(uri, name) {
        const syms = this.mdCache.getAllSymbols(uri, name);
        if (syms.some(s => s.type === 'iterator'))
            return 'iterator';
        if (syms.some(s => s.type === 'attribute' && SUBSTITUTION_ATTR.test(s.definition)))
            return 'attribute';
        return undefined;
    }
    provideDocumentSemanticTokens(document) {
        const builder = new vscode.SemanticTokensBuilder(this.legend);
        const cache = new Map();
        const lookup = (name) => {
            if (!cache.has(name))
                cache.set(name, this.kindOf(document.uri, name));
            return cache.get(name);
        };
        const lines = Array.from({ length: document.lineCount }, (_, i) => document.lineAt(i).text);
        for (const t of (0, mdTokenScan_1.scanMdTokens)(lines, lookup))
            builder.push(t.line, t.start, t.length, t.kind === 'iterator' ? 0 : 1);
        return builder.build();
    }
}
exports.GccMdSemanticTokensProvider = GccMdSemanticTokensProvider;
//# sourceMappingURL=mdSemanticTokensProvider.js.map