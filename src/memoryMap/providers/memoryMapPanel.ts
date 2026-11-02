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

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MemoryLayout } from '../models/types';

export class MemoryMapPanel {
    private static currentPanel: MemoryMapPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionPath: string;
    private disposables: vscode.Disposable[] = [];
    private onSectionSelected: ((sectionName: string, sourceLine?: number) => void) | undefined;
    private onSymbolSelected: ((symbolName: string, sectionName: string, address?: number, sourceLine?: number) => void) | undefined;
    private onGoToSource: ((symbolName: string, sectionName: string, sourceFile?: string, address?: number, sourceLine?: number) => void) | undefined;

    private constructor(panel: vscode.WebviewPanel, extensionPath: string) {
        this.panel = panel;
        this.extensionPath = extensionPath;

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        this.panel.webview.onDidReceiveMessage(
            (message) => {
                if (message.type === 'selectSection' && this.onSectionSelected) {
                    this.onSectionSelected(message.section, message.sourceLine);
                } else if (message.type === 'selectSymbol' && this.onSymbolSelected) {
                    this.onSymbolSelected(message.symbol, message.section, message.address, message.sourceLine);
                } else if (message.type === 'goToSource' && this.onGoToSource) {
                    this.onGoToSource(message.symbol, message.section, message.sourceFile, message.address, message.sourceLine);
                }
            },
            null,
            this.disposables
        );

        this.panel.webview.html = this.getHtmlContent();
    }

    static createOrShow(extensionPath: string): MemoryMapPanel {
        const column = vscode.ViewColumn.Beside;

        if (MemoryMapPanel.currentPanel) {
            MemoryMapPanel.currentPanel.panel.reveal(column, true);
            return MemoryMapPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'gccMemoryMap',
            'GCC Memory Map',
            { viewColumn: column, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(extensionPath, 'webview')),
                ],
            }
        );

        MemoryMapPanel.currentPanel = new MemoryMapPanel(panel, extensionPath);
        return MemoryMapPanel.currentPanel;
    }

    static getCurrent(): MemoryMapPanel | undefined {
        return MemoryMapPanel.currentPanel;
    }

    setOnSectionSelected(callback: (sectionName: string, sourceLine?: number) => void): void {
        this.onSectionSelected = callback;
    }

    setOnSymbolSelected(callback: (symbolName: string, sectionName: string, address?: number, sourceLine?: number) => void): void {
        this.onSymbolSelected = callback;
    }

    setOnGoToSource(callback: (symbolName: string, sectionName: string, sourceFile?: string, address?: number, sourceLine?: number) => void): void {
        this.onGoToSource = callback;
    }

    reveal(): void {
        this.panel.reveal(undefined, true);
    }

    setTitle(title: string): void {
        this.panel.title = title;
    }

    close(): void {
        this.panel.dispose();
    }

    updateLayout(layout: MemoryLayout): void {
        this.panel.webview.postMessage({
            type: 'updateLayout',
            layout,
        });
    }

    highlightSection(sectionName: string): void {
        this.panel.webview.postMessage({
            type: 'highlightSection',
            section: sectionName,
        });
    }

    highlightSymbol(symbolName: string, sectionName: string, address?: number): void {
        this.panel.webview.postMessage({
            type: 'highlightSymbol',
            symbol: symbolName,
            section: sectionName,
            address,
        });
    }

    focusSymbol(symbolName: string, sectionName: string, address?: number): void {
        this.panel.webview.postMessage({
            type: 'focusSymbol',
            symbol: symbolName,
            section: sectionName,
            address,
        });
    }

    searchSymbol(query: string): void {
        this.panel.webview.postMessage({
            type: 'searchSymbol',
            query,
        });
    }

    private getHtmlContent(): string {
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
        const treemapUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.extensionPath, 'webview', 'memoryMap', 'treemap.js')));
        const ipcAdapterUri = webview.asWebviewUri(vscode.Uri.file(ipcAdapterPath));

        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);
        html = html.replace(/\{\{nonce\}\}/g, nonce);
        html = html.replace(/\{\{cssUri\}\}/g, `${cssUri.toString()}?v=${cacheBuster}`);
        html = html.replace(/\{\{ipcAdapterUri\}\}/g, `${ipcAdapterUri.toString()}?v=${cacheBuster}`);
        html = html.replace(/\{\{treemapUri\}\}/g, `${treemapUri.toString()}?v=${cacheBuster}`);
        html = html.replace(/\{\{scriptUri\}\}/g, `${scriptUri.toString()}?v=${cacheBuster}`);

        return html;
    }

    private dispose(): void {
        MemoryMapPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) { d.dispose(); }
        }
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Made with Bob
