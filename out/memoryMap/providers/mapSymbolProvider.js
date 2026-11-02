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
exports.MapSymbolProvider = void 0;
const vscode = __importStar(require("vscode"));
const mapParser_1 = require("../parsers/mapParser");
/**
 * Document Symbol Provider for map files
 * Provides hierarchical outline view and breadcrumb navigation
 */
class MapSymbolProvider {
    provideDocumentSymbols(document, token) {
        const text = document.getText();
        const layout = (0, mapParser_1.parseMap)(text);
        return this.buildSymbolTree(document, layout);
    }
    buildSymbolTree(document, layout) {
        const symbols = [];
        // Memory Configuration section
        if (layout.regions.length > 0) {
            const memConfigSymbol = this.createMemoryConfigurationSymbol(document, layout);
            if (memConfigSymbol) {
                symbols.push(memConfigSymbol);
            }
        }
        // Linker Script and Memory Map section
        if (layout.sections.length > 0) {
            const mapSymbol = this.createLinkerMapSymbol(document, layout);
            if (mapSymbol) {
                symbols.push(mapSymbol);
            }
        }
        // Discarded sections
        if (layout.discardedCount && layout.discardedCount > 0) {
            const discardedSymbol = this.createDiscardedSymbol(document, layout);
            if (discardedSymbol) {
                symbols.push(discardedSymbol);
            }
        }
        return symbols;
    }
    createMemoryConfigurationSymbol(document, layout) {
        const text = document.getText();
        const lines = text.split('\n');
        // Find "Memory Configuration" header
        let startLine = -1;
        let endLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (/^Memory Configuration\s*$/i.test(lines[i].trim())) {
                startLine = i;
                // Find end (empty line or next section)
                for (let j = i + 1; j < lines.length; j++) {
                    if (!lines[j].trim() || /^(Linker script|Discarded)/i.test(lines[j])) {
                        endLine = j - 1;
                        break;
                    }
                }
                break;
            }
        }
        if (startLine === -1) {
            return null;
        }
        if (endLine === -1) {
            endLine = lines.length - 1;
        }
        const range = new vscode.Range(startLine, 0, endLine, lines[endLine].length);
        const selectionRange = new vscode.Range(startLine, 0, startLine, lines[startLine].length);
        const symbol = new vscode.DocumentSymbol('Memory Configuration', '', vscode.SymbolKind.Namespace, range, selectionRange);
        // Add memory regions as children
        for (const region of layout.regions) {
            const regionSymbol = this.createRegionSymbol(document, region, startLine, endLine);
            if (regionSymbol) {
                symbol.children.push(regionSymbol);
            }
        }
        return symbol;
    }
    createRegionSymbol(document, region, searchStart, searchEnd) {
        const text = document.getText();
        const lines = text.split('\n');
        // Find the line with this region name
        for (let i = searchStart; i <= searchEnd && i < lines.length; i++) {
            const line = lines[i];
            if (line.includes(region.name) && /0x[0-9a-fA-F]+/.test(line)) {
                const range = new vscode.Range(i, 0, i, line.length);
                const detail = `${this.formatHex(region.origin)} - ${this.formatSize(region.length)} (${this.formatPercent(region.used, region.length)} used)`;
                return new vscode.DocumentSymbol(region.name, detail, vscode.SymbolKind.Constant, range, range);
            }
        }
        return null;
    }
    createLinkerMapSymbol(document, layout) {
        const text = document.getText();
        const lines = text.split('\n');
        // Find "Linker script and memory map" header
        let startLine = -1;
        let endLine = lines.length - 1;
        for (let i = 0; i < lines.length; i++) {
            if (/^Linker script and memory map\s*$/i.test(lines[i].trim())) {
                startLine = i;
                // Find end (next major section or EOF)
                for (let j = i + 1; j < lines.length; j++) {
                    if (/^(Cross Reference|Discarded)/i.test(lines[j].trim())) {
                        endLine = j - 1;
                        break;
                    }
                }
                break;
            }
        }
        if (startLine === -1) {
            return null;
        }
        const range = new vscode.Range(startLine, 0, endLine, lines[endLine].length);
        const selectionRange = new vscode.Range(startLine, 0, startLine, lines[startLine].length);
        const symbol = new vscode.DocumentSymbol('Linker Script and Memory Map', '', vscode.SymbolKind.Module, range, selectionRange);
        // Add sections as children
        for (const section of layout.sections) {
            if (section.size > 0) {
                const sectionSymbol = this.createSectionSymbol(document, section);
                if (sectionSymbol) {
                    symbol.children.push(sectionSymbol);
                }
            }
        }
        return symbol;
    }
    createSectionSymbol(document, section) {
        if (section.sourceLine === undefined) {
            return null;
        }
        const startLine = section.sourceLine;
        const endLine = section.sourceLineEnd ?? startLine;
        const range = new vscode.Range(startLine, 0, endLine, 9999);
        const selectionRange = new vscode.Range(startLine, 0, startLine, 9999);
        const detail = `${this.formatHex(section.address)} - ${this.formatSize(section.size)}`;
        const symbol = new vscode.DocumentSymbol(section.name, detail, vscode.SymbolKind.Class, range, selectionRange);
        // Add symbols as children
        for (const sym of section.symbols) {
            if (sym.sourceLine !== undefined && sym.size > 0) {
                const symRange = new vscode.Range(sym.sourceLine, 0, sym.sourceLine, 9999);
                const symDetail = `${this.formatHex(sym.address)} - ${this.formatSize(sym.size)}`;
                const symSymbol = new vscode.DocumentSymbol(sym.name, symDetail, vscode.SymbolKind.Function, symRange, symRange);
                symbol.children.push(symSymbol);
            }
        }
        return symbol;
    }
    createDiscardedSymbol(document, layout) {
        const text = document.getText();
        const lines = text.split('\n');
        // Find "Discarded input sections" header
        let startLine = -1;
        let endLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (/^Discarded input sections\s*$/i.test(lines[i].trim())) {
                startLine = i;
                // Find end
                for (let j = i + 1; j < lines.length; j++) {
                    if (/^(Memory Configuration|Linker script|Cross Reference)/i.test(lines[j].trim())) {
                        endLine = j - 1;
                        break;
                    }
                }
                break;
            }
        }
        if (startLine === -1) {
            return null;
        }
        if (endLine === -1) {
            endLine = lines.length - 1;
        }
        const range = new vscode.Range(startLine, 0, endLine, lines[endLine].length);
        const selectionRange = new vscode.Range(startLine, 0, startLine, lines[startLine].length);
        const detail = `${layout.discardedCount} sections - ${this.formatSize(layout.discardedSize || 0)}`;
        return new vscode.DocumentSymbol('Discarded Input Sections', detail, vscode.SymbolKind.Null, range, selectionRange);
    }
    formatHex(value) {
        return '0x' + value.toString(16).toUpperCase().padStart(8, '0');
    }
    formatSize(bytes) {
        if (bytes >= 1024 * 1024) {
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }
        if (bytes >= 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${bytes} B`;
    }
    formatPercent(used, total) {
        if (total === 0) {
            return '0%';
        }
        return `${((used / total) * 100).toFixed(1)}%`;
    }
}
exports.MapSymbolProvider = MapSymbolProvider;
// Made with Bob
//# sourceMappingURL=mapSymbolProvider.js.map