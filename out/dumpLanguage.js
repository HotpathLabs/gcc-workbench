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
exports.DumpNavigationProvider = exports.DumpSymbolProvider = exports.DumpIndex = void 0;
exports.registerDumpLanguage = registerDumpLanguage;
const vscode = __importStar(require("vscode"));
const gimpleModel_1 = require("./dumpModel/gimpleModel");
const rtlModel_1 = require("./dumpModel/rtlModel");
const types_1 = require("./dumpModel/types");
/**
 * Language features for GCC RTL and GIMPLE dumps: outline, go to definition,
 * find references, highlights and hover for registers / SSA names, and
 * jumping from an insn uid (prev/next, label_ref) to its insn.
 *
 * Everything is derived from the dump text itself, so no .dot files are
 * needed. Each document is parsed once per version.
 */
class DumpIndex {
    cache = new Map();
    get(doc) {
        const key = doc.uri.toString();
        const hit = this.cache.get(key);
        if (hit && hit.version === doc.version)
            return hit.model;
        const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
        const model = doc.languageId === 'gcc-gimple' ? (0, gimpleModel_1.parseGimpleDump)(lines) : (0, rtlModel_1.parseRtlDump)(lines);
        this.cache.set(key, { version: doc.version, model });
        return model;
    }
    forget(doc) { this.cache.delete(doc.uri.toString()); }
}
exports.DumpIndex = DumpIndex;
const toRange = (o) => new vscode.Range(o.line, o.start, o.endLine, o.end);
function summary(doc, v) {
    const defs = v.occurrences.filter(o => o.role === 'def' || o.role === 'both');
    const uses = v.occurrences.filter(o => o.role === 'use' || o.role === 'both');
    const md = new vscode.MarkdownString();
    const title = v.userName ? `**${v.key}** \`${v.userName}\`` : `**${v.key}**`;
    md.appendMarkdown(`#### ${title}\n\n`);
    const facts = [];
    if (v.modes.size)
        facts.push(`mode ${[...v.modes].join(', ')}`);
    if (v.hardName)
        facts.push(`hard reg \`${v.hardName}\``);
    if (v.flags.size)
        facts.push(`flags ${[...v.flags].map(f => '/' + f).join('')}`);
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
class DumpSymbolProvider {
    index;
    constructor(index) {
        this.index = index;
    }
    provideDocumentSymbols(doc) {
        const model = this.index.get(doc);
        return model.functions.map(fn => {
            const range = new vscode.Range(fn.line, 0, fn.endLine, doc.lineAt(Math.min(fn.endLine, doc.lineCount - 1)).text.length);
            const sym = new vscode.DocumentSymbol(fn.name, `${fn.blocks.length} blocks · ${fn.vars.size} ${model.kind === 'rtl' ? 'regs' : 'SSA names'}`, vscode.SymbolKind.Function, range, new vscode.Range(fn.line, 0, fn.line, doc.lineAt(fn.line).text.length));
            sym.children = fn.blocks.map(b => {
                const br = new vscode.Range(b.line, 0, b.endLine, doc.lineAt(Math.min(b.endLine, doc.lineCount - 1)).text.length);
                return new vscode.DocumentSymbol(`bb ${b.index}`, `${b.insnCount} insns`, vscode.SymbolKind.Namespace, br, new vscode.Range(b.line, 0, b.line, doc.lineAt(b.line).text.length));
            });
            return sym;
        });
    }
}
exports.DumpSymbolProvider = DumpSymbolProvider;
class DumpNavigationProvider {
    index;
    constructor(index) {
        this.index = index;
    }
    uidTarget(doc, fn, pos) {
        const ref = fn.uidRefs.find(r => r.line === pos.line && pos.character >= r.start && pos.character <= r.end);
        const insn = ref && fn.insns.get(ref.uid);
        return insn ? new vscode.Location(doc.uri, new vscode.Range(insn.line, 0, insn.line, doc.lineAt(insn.line).text.length)) : undefined;
    }
    provideDefinition(doc, pos) {
        const model = this.index.get(doc);
        const hit = (0, types_1.findVarAt)(model, pos.line, pos.character);
        if (hit) {
            const defs = hit.variable.occurrences.filter(o => o.role === 'def' || o.role === 'both');
            return defs.map(o => new vscode.Location(doc.uri, toRange(o)));
        }
        const fn = (0, types_1.findFunctionAt)(model, pos.line);
        const target = fn && this.uidTarget(doc, fn, pos);
        return target ? [target] : undefined;
    }
    provideReferences(doc, pos, ctx) {
        const hit = (0, types_1.findVarAt)(this.index.get(doc), pos.line, pos.character);
        if (!hit)
            return undefined;
        return hit.variable.occurrences
            .filter(o => ctx.includeDeclaration || (o.role !== 'def'))
            .map(o => new vscode.Location(doc.uri, toRange(o)));
    }
    provideDocumentHighlights(doc, pos) {
        const hit = (0, types_1.findVarAt)(this.index.get(doc), pos.line, pos.character);
        if (!hit)
            return undefined;
        return hit.variable.occurrences.map(o => new vscode.DocumentHighlight(toRange(o), o.role === 'def' || o.role === 'both' ? vscode.DocumentHighlightKind.Write : vscode.DocumentHighlightKind.Read));
    }
    provideHover(doc, pos) {
        const hit = (0, types_1.findVarAt)(this.index.get(doc), pos.line, pos.character);
        if (!hit)
            return undefined;
        return new vscode.Hover(summary(doc, hit.variable), toRange(hit.occurrence));
    }
}
exports.DumpNavigationProvider = DumpNavigationProvider;
function registerDumpLanguage(context) {
    const index = new DumpIndex();
    const nav = new DumpNavigationProvider(index);
    const symbols = new DumpSymbolProvider(index);
    for (const language of ['gcc-rtl', 'gcc-gimple']) {
        const selector = { language };
        context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, symbols), vscode.languages.registerDefinitionProvider(selector, nav), vscode.languages.registerReferenceProvider(selector, nav), vscode.languages.registerDocumentHighlightProvider(selector, nav), vscode.languages.registerHoverProvider(selector, nav));
    }
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(d => index.forget(d)));
}
//# sourceMappingURL=dumpLanguage.js.map