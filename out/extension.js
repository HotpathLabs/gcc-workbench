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
 *
 * GCC Workbench is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with GCC Workbench.  If not, see <https://www.gnu.org/licenses/>.
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
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const focusProvider_1 = require("./focusProvider");
const graphProvider_1 = require("./graphProvider");
const linkProvider_1 = require("./linkProvider");
const mdCache_1 = require("./mdCache");
const mdSemanticTokensProvider_1 = require("./mdSemanticTokensProvider");
const mdHoverProvider_1 = require("./mdHoverProvider");
const mdReferenceProvider_1 = require("./mdReferenceProvider");
const mdSymbolProvider_1 = require("./mdSymbolProvider");
const passDiffProvider_1 = require("./passDiffProvider");
const passSurferProvider_1 = require("./passSurferProvider");
const passTreeProvider_1 = require("./passTreeProvider");
const rtlCache_1 = require("./rtlCache");
const gimpleCache_1 = require("./gimpleCache");
const gimpleHoverProvider_1 = require("./gimpleHoverProvider");
const sourceMapper_1 = require("./sourceMapper");
const memoryMapIntegration_1 = require("./memoryMapIntegration");
const mapSymbolProvider_1 = require("./memoryMap/providers/mapSymbolProvider");
const detection_1 = require("./memoryMap/detection");
const suStore_1 = require("./stackUsage/suStore");
const codeLensProvider_1 = require("./stackUsage/codeLensProvider");
const globalStackUsageDataProvider_1 = require("./stackUsage/globalStackUsageDataProvider");
const currentFileStackUsageDataProvider_1 = require("./stackUsage/currentFileStackUsageDataProvider");
const mdCache = new mdCache_1.GccMdCache();
const mdSemantic = new mdSemanticTokensProvider_1.GccMdSemanticTokensProvider(mdCache);
const rtlCache = new rtlCache_1.RtlDefCache();
const gimpleCache = new gimpleCache_1.GimpleCache();
const diffProvider = new passDiffProvider_1.GccPassDiffProvider();
const focusProvider = new focusProvider_1.GccFocusProvider();
const graphProvider = new graphProvider_1.GccGraphProvider();
const surferProvider = new passSurferProvider_1.GccPassSurferProvider();
// Keep a global reference to prevent garbage collection
let sourceMapper;
// Track which folders we have already indexed to avoid spamming re-index on every tab switch
const initializedBackends = new Set();
async function activate(context) {
    // 1. Initialize Format Detectors
    (0, detection_1.initializeFormatDetectors)();
    // 2. Activate Memory Map Features
    (0, memoryMapIntegration_1.activateMemoryMapFeatures)(context);
    // 3. Initialize Stack Usage Store
    const suStore = new suStore_1.SuStore();
    context.subscriptions.push(suStore);
    // 4. Setup Stack Usage File Watcher
    const suWatcher = vscode.workspace.createFileSystemWatcher('**/*.su');
    suWatcher.onDidCreate(uri => suStore.onAddOrUpdate(uri));
    suWatcher.onDidChange(uri => suStore.onAddOrUpdate(uri));
    suWatcher.onDidDelete(uri => suStore.onDelete(uri));
    context.subscriptions.push(suWatcher);
    // 5. Register Stack Usage Providers
    const cSelector = { scheme: 'file', language: 'c' };
    const cppSelector = { scheme: 'file', language: 'cpp' };
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(cSelector, new codeLensProvider_1.StackUsageCodeLensProvider(suStore)));
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(cppSelector, new codeLensProvider_1.StackUsageCodeLensProvider(suStore)));
    vscode.window.registerTreeDataProvider('gcc-stack-usage.globalStackUsage', new globalStackUsageDataProvider_1.GlobalStackUsageDataProvider(suStore));
    vscode.window.registerTreeDataProvider('gcc-stack-usage.currentFileStackUsage', new currentFileStackUsageDataProvider_1.CurrentFileStackUsageDataProvider(suStore));
    // 6. Register Stack Usage Commands
    context.subscriptions.push(vscode.commands.registerCommand('gcc-stack-usage.updateSuStore', async () => {
        await suStore.update();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-stack-usage.toggleEnabled', () => {
        const newState = !suStore.enabled;
        suStore.setEnabled(newState);
        vscode.commands.executeCommand('setContext', 'gcc-stack-usage.enabled', newState);
        if (newState) {
            vscode.window.showInformationMessage('Stack Usage Analysis enabled');
        }
        else {
            vscode.window.showInformationMessage('Stack Usage Analysis disabled');
        }
    }));
    // Set initial context (disabled by default)
    vscode.commands.executeCommand('setContext', 'gcc-stack-usage.enabled', false);
    // Listen for enabled state changes to update code lens
    suStore.onEnabledChanged((enabled) => {
        vscode.commands.executeCommand('setContext', 'gcc-stack-usage.enabled', enabled);
    });
    // 7. Helper: Auto-detect GCC Dump Language
    // Checks for .t (GIMPLE), .r (RTL), .i (IPA)
    const ensureDumpLanguage = async (doc) => {
        if (doc.uri.scheme !== 'file')
            return;
        const fileName = path.basename(doc.uri.fsPath);
        // Robust Regex: Matches 1 or more digits (\d+)
        const dumpRegex = /^(.+)\.(\d+)([tri])\.([^.]+)$/;
        const match = dumpRegex.exec(fileName);
        if (!match)
            return;
        const type = match[3];
        let targetLanguage;
        if (type === 'r')
            targetLanguage = 'gcc-rtl';
        else if (type === 't' || type === 'i')
            targetLanguage = 'gcc-gimple';
        if (targetLanguage && doc.languageId !== targetLanguage) {
            await vscode.languages.setTextDocumentLanguage(doc, targetLanguage);
        }
    };
    // 2. Initialize Caches
    rtlCache.initialize(context).then(() => {
        console.log("RTL Cache Ready");
    });
    gimpleCache.initialize(context).then(() => {
        console.log("GIMPLE Cache Ready");
    });
    // 3. Selectors
    const mdSelector = { scheme: 'file', language: 'gcc-md' };
    const dumpSelector = [
        { scheme: 'file', language: 'gcc-rtl' },
        { scheme: 'file', language: 'gcc-md' }
    ];
    const gimpleSelector = { scheme: 'file', language: 'gcc-gimple' };
    const mapfileSelector = { scheme: 'file', language: 'mapfile' };
    // 4. Register Map File Language Support
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(mapfileSelector, new mapSymbolProvider_1.MapSymbolProvider()));
    // 5. Startup Logic (Run immediately when window loads)
    if (vscode.window.activeTextEditor) {
        const editor = vscode.window.activeTextEditor;
        const doc = editor.document;
        // A. Detect Language
        await ensureDumpLanguage(doc);
        // B. Index MD File (The missing piece!)
        if (doc.languageId === 'gcc-md') {
            const dir = path.dirname(doc.uri.fsPath);
            if (!initializedBackends.has(dir)) {
                initializedBackends.add(dir);
                // console.log("Indexing GCC Backend on Startup: " + dir);
                mdCache.forceReindex(doc.uri).then(() => mdSemantic.refresh());
            }
        }
        // C. Restore Focus UI
        focusProvider.restoreState(editor);
    }
    // 5. Event Listeners (Tab Switching)
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor) {
            await ensureDumpLanguage(editor.document);
            // Lazy Indexing for MD files
            if (editor.document.languageId === 'gcc-md') {
                const dir = path.dirname(editor.document.uri.fsPath);
                if (!initializedBackends.has(dir)) {
                    initializedBackends.add(dir);
                    vscode.window.setStatusBarMessage(`Indexing GCC Backend: ${path.basename(dir)}...`, 2000);
                    mdCache.forceReindex(editor.document.uri).then(() => mdSemantic.refresh());
                }
            }
            // Restore Focus Mode UI State
            focusProvider.restoreState(editor);
        }
        else {
            vscode.commands.executeCommand('setContext', 'gcc-dump.focusModeActive', false);
        }
    }));
    // Source Mapper
    sourceMapper = new sourceMapper_1.SourceMapper(context);
    const viewSourceCmd = vscode.commands.registerCommand('gcc-workbench.viewSource', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await sourceMapper.enable(editor);
        }
    });
    context.subscriptions.push(viewSourceCmd);
    // 6. Providers
    const treeProvider = new passTreeProvider_1.GccPassTreeProvider();
    vscode.window.registerTreeDataProvider('gcc-dump-explorer', treeProvider);
    // MD Specific
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(mdSelector, new mdSymbolProvider_1.GccMdSymbolProvider(mdCache)));
    context.subscriptions.push(vscode.languages.registerReferenceProvider(mdSelector, new mdReferenceProvider_1.GccMdReferenceProvider(mdCache)));
    context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(mdSelector, new linkProvider_1.GCCMdLinkProvider()));
    context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider(mdSelector, mdSemantic, mdSemantic.legend));
    // Generic (RTL + GIMPLE + MD)
    context.subscriptions.push(vscode.languages.registerHoverProvider(dumpSelector, new mdHoverProvider_1.GccMdHoverProvider(mdCache, rtlCache)));
    context.subscriptions.push(vscode.languages.registerHoverProvider(gimpleSelector, new gimpleHoverProvider_1.GimpleHoverProvider(gimpleCache)));
    // 7. Commands
    // Helper Commands
    context.subscriptions.push(vscode.commands.registerCommand('gcc-md.openFilePermanent', (uri) => {
        vscode.window.showTextDocument(uri, { preview: false });
    }));
    // Tree View Commands
    context.subscriptions.push(vscode.commands.registerCommand('gcc-dump.refreshPasses', () => treeProvider.refresh()));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-dump.filterPasses', () => treeProvider.promptFilter()));
    // Focus Mode (Toggle) - The "Eye" Button
    // We register TWO commands for the same logic to handle the toggle UI state
    context.subscriptions.push(vscode.commands.registerCommand('gcc-dump.toggleFocus', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            focusProvider.toggleFocusMode(editor);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-dump.toggleFocus_on', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            focusProvider.toggleFocusMode(editor);
    }));
    // Graph Launcher
    context.subscriptions.push(vscode.commands.registerCommand('gcc-dump.openDotFile', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            graphProvider.openDotFile(editor);
    }));
    // Pass Surfer
    context.subscriptions.push(vscode.commands.registerCommand('gcc-dump.nextPass', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            surferProvider.navigate(editor, 'next');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('gcc-dump.prevPass', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            surferProvider.navigate(editor, 'prev');
    }));
    // Time Travel (Diff)
    context.subscriptions.push(vscode.commands.registerCommand('gcc-dump.comparePreviousPass', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await diffProvider.compareWithPrevious(editor.document.uri);
        }
        else {
            vscode.window.showErrorMessage("Open a GCC dump file first.");
        }
    }));
    // File Watcher for MD files
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    context.subscriptions.push(watcher.onDidChange((uri) => mdCache.indexFile(uri).then(() => mdSemantic.refresh())));
    context.subscriptions.push(watcher.onDidCreate((uri) => mdCache.indexFile(uri).then(() => mdSemantic.refresh())));
    context.subscriptions.push(watcher);
}
function deactivate() {
    if (sourceMapper) {
        sourceMapper.dispose();
    }
}
//# sourceMappingURL=extension.js.map