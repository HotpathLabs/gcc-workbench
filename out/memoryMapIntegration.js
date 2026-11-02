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
exports.activateMemoryMapFeatures = activateMemoryMapFeatures;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const ldParser_1 = require("./memoryMap/parsers/ldParser");
const mapParser_1 = require("./memoryMap/parsers/mapParser");
const memoryMapPanel_1 = require("./memoryMap/providers/memoryMapPanel");
const symbols_1 = require("./memoryMap/util/symbols");
// Current parsed layout
let currentLayout;
// 12-color colorblind-safe palette (Paul Tol qualitative scheme)
const PALETTE = [
    '#4477AA', '#66CCEE', '#228833', '#CCBB44', '#EE6677', '#AA3377',
    '#BBBBBB', '#EE8866', '#44BB99', '#99DDFF', '#EEDD88', '#FFAABB',
];
// Cache decoration types so we can dispose and recreate them
let activeDecorations = [];
// Cache to avoid redundant re-parsing when the document hasn't changed
let lastParsedUri;
let lastParsedVersion;
function activateMemoryMapFeatures(context) {
    // Command: Toggle Memory Map webview (show/hide)
    context.subscriptions.push(vscode.commands.registerCommand('gcc-workbench.showMemoryMap', () => {
        if (!currentLayout) {
            vscode.window.showWarningMessage('No memory layout data. Open a .ld or .map file first.');
            return;
        }
        // Check if panel is already open
        const existingPanel = memoryMapPanel_1.MemoryMapPanel.getCurrent();
        if (existingPanel) {
            // Panel is open, close it and clear decorations
            existingPanel.close();
            clearDecorations();
        }
        else {
            // Panel is closed, open it (decorations will be applied in showMemoryMap)
            showMemoryMap(context, currentLayout);
        }
    }));
    // Command: Find in Memory Map (right-click context menu)
    context.subscriptions.push(vscode.commands.registerCommand('gcc-workbench.findInMemoryMap', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        // Use the selection, or the word under the cursor
        const selection = editor.selection;
        let word;
        if (selection.isEmpty) {
            const wordRange = editor.document.getWordRangeAtPosition(selection.active);
            if (!wordRange) {
                vscode.window.showWarningMessage('No symbol under cursor.');
                return;
            }
            word = editor.document.getText(wordRange);
        }
        else {
            word = editor.document.getText(selection).trim();
        }
        if (!word) {
            vscode.window.showWarningMessage('No symbol selected.');
            return;
        }
        findSymbolInMemoryMap(context, word);
    }));
    // Command: Refresh
    context.subscriptions.push(vscode.commands.registerCommand('gcc-workbench.refreshMemoryMap', () => {
        // Clear cache to force re-parse
        lastParsedUri = undefined;
        lastParsedVersion = undefined;
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            parseDocument(context, editor.document);
        }
    }));
    // Parse on active editor change — auto-open map panel for GCC map files
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            parseDocument(context, editor.document);
        }
    }));
    // Parse on file save
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
        parseDocument(context, doc);
    }));
    // Parse the currently active document on startup
    if (vscode.window.activeTextEditor) {
        parseDocument(context, vscode.window.activeTextEditor.document);
    }
}
async function findSymbolInMemoryMap(context, symbolName) {
    if (!currentLayout) {
        vscode.window.showWarningMessage('No memory map loaded. Open a .map file first.');
        return;
    }
    // Is the symbol present anywhere in the parsed layout?
    let found = false;
    for (const region of currentLayout.regions) {
        for (const section of region.sections) {
            if (section.symbols.some(sym => sym.name === symbolName ||
                (0, symbols_1.extractSymbolName)(sym.name) === symbolName ||
                sym.name.indexOf(symbolName) >= 0)) {
                found = true;
                break;
            }
        }
        if (found) {
            break;
        }
    }
    // Otherwise check whether the linker discarded it (--gc-sections)
    let inDiscarded = false;
    if (!found && currentLayout.sourceFile) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(currentLayout.sourceFile));
        let inDiscardedSection = false;
        for (let i = 0; i < doc.lineCount; i++) {
            const lineText = doc.lineAt(i).text;
            const trimmed = lineText.trim();
            if (/^Discarded input sections\s*$/i.test(trimmed)) {
                inDiscardedSection = true;
                continue;
            }
            if (inDiscardedSection && (/^Memory Configuration\s*$/.test(trimmed) ||
                /^Linker script and memory map\s*$/i.test(trimmed))) {
                break;
            }
            if (inDiscardedSection && lineText.indexOf(symbolName) !== -1) {
                inDiscarded = true;
                break;
            }
        }
    }
    if (!found && inDiscarded) {
        vscode.window.showWarningMessage(`'${symbolName}' was found in the discarded input sections. ` +
            'It was removed by the linker (likely unused or garbage-collected with --gc-sections).');
        return;
    }
    if (!found) {
        vscode.window.showWarningMessage(`'${symbolName}' was not found in the memory map. ` +
            'It may be inlined, optimized out, or defined in a library not included in the map file.');
        return;
    }
    // Open the panel if needed, then search. Messages posted before the
    // webview has loaded are queued by VS Code, so no extra handshake is needed.
    const fileName = currentLayout.sourceFile ? path.basename(currentLayout.sourceFile) : undefined;
    const panel = memoryMapPanel_1.MemoryMapPanel.getCurrent();
    if (panel) {
        panel.reveal();
    }
    else {
        showMemoryMap(context, currentLayout, fileName);
    }
    memoryMapPanel_1.MemoryMapPanel.getCurrent()?.searchSymbol(symbolName);
}
function showMemoryMap(context, layout, fileName) {
    const panel = memoryMapPanel_1.MemoryMapPanel.createOrShow(context.extensionPath);
    panel.updateLayout(layout);
    if (fileName) {
        panel.setTitle('GCC Memory Map — ' + fileName);
    }
    // Apply region color decorations when panel is opened
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.fileName.endsWith('.map')) {
        applyDecorations(editor, layout);
    }
    // Webview click → navigate in editor
    panel.setOnSectionSelected((_sectionName, sourceLine) => {
        const section = findSection(_sectionName);
        const address = section?.address;
        if (address !== undefined) {
            goToAddress(address, _sectionName);
        }
        else {
            goToLine(sourceLine ?? section?.sourceLine);
        }
    });
    panel.setOnSymbolSelected((symbolName, _sectionName, address, sourceLine) => {
        if (address !== undefined) {
            goToAddress(address, symbolName);
        }
        else {
            goToLine(sourceLine);
        }
    });
    panel.setOnGoToSource((symbolName, _sectionName, sourceFile, address, sourceLine) => {
        goToSourceFile(symbolName, sourceFile, address, sourceLine);
    });
}
function findSection(sectionName) {
    if (!currentLayout) {
        return undefined;
    }
    for (const region of currentLayout.regions) {
        for (const section of region.sections) {
            if (section.name === sectionName) {
                return section;
            }
        }
    }
    return undefined;
}
function parseDocument(context, document) {
    const filePath = document.fileName;
    const ext = path.extname(filePath).toLowerCase();
    // Skip re-parsing if the document hasn't changed since last parse
    const docUri = document.uri.toString();
    if (docUri === lastParsedUri && document.version === lastParsedVersion) {
        return;
    }
    const text = document.getText();
    let layout;
    if (ext === '.ld' || ext === '.lds') {
        layout = (0, ldParser_1.parseLd)(text);
        layout.sourceFile = filePath;
    }
    else if (ext === '.map') {
        // Verify it's a GCC linker map, not a JS source map
        if (!(0, mapParser_1.isGccMapFile)(text)) {
            return;
        }
        layout = (0, mapParser_1.parseMap)(text);
        layout.sourceFile = filePath;
    }
    else {
        return;
    }
    lastParsedUri = docUri;
    lastParsedVersion = document.version;
    currentLayout = layout;
    vscode.commands.executeCommand('setContext', 'gcc-workbench.hasMemoryLayout', true);
    // DO NOT apply decorations automatically - they conflict with syntax highlighting
    // Decorations are only applied when the Memory Map panel is opened via the button
    // Update the Memory Map panel if it's already open
    const baseName = path.basename(filePath);
    if (layout && memoryMapPanel_1.MemoryMapPanel.getCurrent()) {
        // Panel already open — update it and apply decorations
        memoryMapPanel_1.MemoryMapPanel.getCurrent().updateLayout(layout);
        memoryMapPanel_1.MemoryMapPanel.getCurrent().setTitle('GCC Memory Map — ' + baseName);
        // Apply decorations since panel is open
        if (ext === '.map') {
            const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
            if (editor) {
                applyDecorations(editor, layout);
            }
        }
    }
}
function clearDecorations() {
    // Dispose all active decorations
    for (const d of activeDecorations) {
        d.dispose();
    }
    activeDecorations = [];
}
function applyDecorations(editor, layout) {
    // Dispose old decorations
    clearDecorations();
    // Pre-create one decoration type per palette color for sections.
    const secDecoTypes = [];
    const secDecoRanges = [];
    for (let c = 0; c < PALETTE.length; c++) {
        const color = PALETTE[c];
        secDecoTypes.push(vscode.window.createTextEditorDecorationType({
            backgroundColor: color + '55',
            isWholeLine: true,
            overviewRulerColor: color,
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        }));
        secDecoRanges.push([]);
    }
    activeDecorations.push(...secDecoTypes);
    // Collect ranges grouped by section color index
    let sectionIndex = 0;
    for (const region of layout.regions) {
        if (region.length === 0) {
            continue;
        }
        const sections = region.sections.slice().sort((a, b) => a.address - b.address);
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            const sectionColorIdx = sectionIndex % PALETTE.length;
            sectionIndex++;
            if (section.sourceLine === undefined || section.sourceLineEnd === undefined) {
                continue;
            }
            // Color the entire section range with the section's color
            secDecoRanges[sectionColorIdx].push(new vscode.Range(section.sourceLine, 0, section.sourceLineEnd, 0));
        }
    }
    // Apply all decorations in batch
    for (let c = 0; c < PALETTE.length; c++) {
        if (secDecoRanges[c].length > 0) {
            editor.setDecorations(secDecoTypes[c], secDecoRanges[c]);
        }
    }
}
async function goToLine(sourceLine) {
    if (sourceLine === undefined || !currentLayout?.sourceFile) {
        return;
    }
    const uri = vscode.Uri.file(currentLayout.sourceFile);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
        selection: new vscode.Range(sourceLine, 0, sourceLine, 0),
    });
    editor.revealRange(new vscode.Range(sourceLine, 0, sourceLine, 0), vscode.TextEditorRevealType.InCenter);
}
async function goToAddress(address, symbolName) {
    if (!currentLayout?.sourceFile) {
        return;
    }
    const uri = vscode.Uri.file(currentLayout.sourceFile);
    const doc = await vscode.workspace.openTextDocument(uri);
    const { hex8: hexPad8, hex16: hexPad16, hexMin: hexMinimal } = (0, symbols_1.hexVariants)(address);
    const text = doc.getText();
    const lines = text.split('\n');
    let bestLine = -1;
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const lnLower = ln.toLowerCase();
        if (lnLower.indexOf(hexPad8) === -1 && lnLower.indexOf(hexPad16) === -1 && lnLower.indexOf(hexMinimal) === -1) {
            continue;
        }
        if (symbolName && ln.indexOf(symbolName) !== -1) {
            bestLine = i;
            break;
        }
        if (bestLine === -1) {
            bestLine = i;
        }
    }
    if (bestLine >= 0) {
        const editor = await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false,
            selection: new vscode.Range(bestLine, 0, bestLine, 0),
        });
        editor.revealRange(new vscode.Range(bestLine, 0, bestLine, 0), vscode.TextEditorRevealType.InCenter);
    }
}
async function goToSourceFile(symbolName, sourceFile, address, sourceLine) {
    const cleanSymbol = (0, symbols_1.extractSymbolName)(symbolName);
    const fileName = sourceFile ? (0, symbols_1.extractSourceName)(sourceFile) : undefined;
    if (fileName) {
        // Search workspace for files matching this name
        const pattern = '**/' + fileName;
        const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 10);
        if (uris.length > 0) {
            // Try each matching file and look for the symbol
            for (const uri of uris) {
                const doc = await vscode.workspace.openTextDocument(uri);
                const text = doc.getText();
                const lines = text.split('\n');
                // Search for a line containing the symbol name (function/variable definition)
                let bestLine = -1;
                for (let i = 0; i < lines.length; i++) {
                    const ln = lines[i];
                    if (ln.indexOf(cleanSymbol) !== -1) {
                        // Prefer lines that look like definitions (not just references)
                        if (/^\s*(void|int|char|uint|static|const|extern|unsigned|signed|struct|enum|float|double|bool|IRAM_ATTR|DRAM_ATTR)\b/.test(ln) ||
                            /\b\w+\s+\**\s*\b/.test(ln)) {
                            bestLine = i;
                            break;
                        }
                        if (bestLine === -1) {
                            bestLine = i;
                        }
                    }
                }
                if (bestLine >= 0) {
                    const editor = await vscode.window.showTextDocument(doc, {
                        viewColumn: vscode.ViewColumn.One,
                        preserveFocus: false,
                        selection: new vscode.Range(bestLine, 0, bestLine, 0),
                    });
                    editor.revealRange(new vscode.Range(bestLine, 0, bestLine, 0), vscode.TextEditorRevealType.InCenter);
                    return;
                }
            }
            // File found but symbol not found inside — just open the first match
            const doc = await vscode.workspace.openTextDocument(uris[0]);
            await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.One,
                preserveFocus: false,
            });
            return;
        }
    }
    // Fallback: use VS Code's built-in symbol search
    const symbols = await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', cleanSymbol);
    if (symbols && symbols.length > 0) {
        // Find exact match
        const exact = symbols.find(s => s.name === cleanSymbol) || symbols[0];
        const doc = await vscode.workspace.openTextDocument(exact.location.uri);
        const line = exact.location.range.start.line;
        const editor = await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false,
            selection: new vscode.Range(line, 0, line, 0),
        });
        editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenter);
        return;
    }
    // Source not found
    vscode.window.showWarningMessage(`Could not find source for '${cleanSymbol}'` +
        (fileName ? ` in ${fileName}` : '') +
        '. The source file may not be in the current workspace.');
}
// Made with Bob
//# sourceMappingURL=memoryMapIntegration.js.map