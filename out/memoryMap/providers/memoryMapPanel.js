"use strict";
/*
 * Copyright (C) 2025 Kishan Parmar
 * Adapted from gcc_map_view by Rob Derr
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
exports.MemoryMapPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class MemoryMapPanel {
    static currentPanel;
    panel;
    extensionPath;
    disposables = [];
    onSectionSelected;
    onSymbolSelected;
    onGoToSource;
    constructor(panel, extensionPath) {
        this.panel = panel;
        this.extensionPath = extensionPath;
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message) => {
            if (message.type === 'selectSection' && this.onSectionSelected) {
                this.onSectionSelected(message.section, message.sourceLine);
            }
            else if (message.type === 'selectSymbol' && this.onSymbolSelected) {
                this.onSymbolSelected(message.symbol, message.section, message.address, message.sourceLine);
            }
            else if (message.type === 'goToSource' && this.onGoToSource) {
                this.onGoToSource(message.symbol, message.section, message.sourceFile, message.address, message.sourceLine);
            }
        }, null, this.disposables);
        this.panel.webview.html = this.getHtmlContent();
    }
    static createOrShow(extensionPath) {
        const column = vscode.ViewColumn.Beside;
        if (MemoryMapPanel.currentPanel) {
            MemoryMapPanel.currentPanel.panel.reveal(column);
            return MemoryMapPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel('gccMemoryMap', 'GCC Memory Map', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(extensionPath, 'webview')),
            ],
        });
        MemoryMapPanel.currentPanel = new MemoryMapPanel(panel, extensionPath);
        return MemoryMapPanel.currentPanel;
    }
    static getCurrent() {
        return MemoryMapPanel.currentPanel;
    }
    setOnSectionSelected(callback) {
        this.onSectionSelected = callback;
    }
    setOnSymbolSelected(callback) {
        this.onSymbolSelected = callback;
    }
    setOnGoToSource(callback) {
        this.onGoToSource = callback;
    }
    reveal() {
        this.panel.reveal(undefined, true);
    }
    setTitle(title) {
        this.panel.title = title;
    }
    close() {
        this.panel.dispose();
    }
    updateLayout(layout) {
        this.panel.webview.postMessage({
            type: 'updateLayout',
            layout,
        });
    }
    highlightSection(sectionName) {
        this.panel.webview.postMessage({
            type: 'highlightSection',
            section: sectionName,
        });
    }
    highlightSymbol(symbolName, sectionName, address) {
        this.panel.webview.postMessage({
            type: 'highlightSymbol',
            symbol: symbolName,
            section: sectionName,
            address,
        });
    }
    focusSymbol(symbolName, sectionName, address) {
        this.panel.webview.postMessage({
            type: 'focusSymbol',
            symbol: symbolName,
            section: sectionName,
            address,
        });
    }
    searchSymbol(query) {
        this.panel.webview.postMessage({
            type: 'searchSymbol',
            query,
        });
    }
    getHtmlContent() {
        const webview = this.panel.webview;
        const nonce = getNonce();
        // Add cache-busting timestamp
        const cacheBuster = Date.now();
        // Resolve resource URIs
        const cssPath = path.join(this.extensionPath, 'webview', 'memoryMap', 'memoryMap.css');
        const jsPath = path.join(this.extensionPath, 'webview', 'memoryMap', 'memoryMap.js');
        const ipcAdapterPath = path.join(this.extensionPath, 'webview', 'memoryMap', 'ipc-vscode.js');
        const htmlPath = path.join(this.extensionPath, 'webview', 'memoryMap', 'memoryMap.html');
        const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath));
        const scriptUri = webview.asWebviewUri(vscode.Uri.file(jsPath));
        const ipcAdapterUri = webview.asWebviewUri(vscode.Uri.file(ipcAdapterPath));
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);
        html = html.replace(/\{\{nonce\}\}/g, nonce);
        html = html.replace(/\{\{cssUri\}\}/g, `${cssUri.toString()}?v=${cacheBuster}`);
        html = html.replace(/\{\{ipcAdapterUri\}\}/g, `${ipcAdapterUri.toString()}?v=${cacheBuster}`);
        html = html.replace(/\{\{scriptUri\}\}/g, `${scriptUri.toString()}?v=${cacheBuster}`);
        return html;
    }
    dispose() {
        MemoryMapPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
exports.MemoryMapPanel = MemoryMapPanel;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
// Made with Bob
//# sourceMappingURL=memoryMapPanel.js.map