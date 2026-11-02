/*
 * Copyright (C) 2025 Kishan Parmar
 * Adapted from gcc-stack-usage extension by Wibren Wiersma
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

import * as vscode from 'vscode';
import { SuStore, SuLine, StackKind } from './suStore';
import * as path from 'path';

class CurrentFileStackUsageTreeItem extends vscode.TreeItem {
    constructor(public readonly suLine: SuLine) {
        super([suLine.stack, suLine.stackKind === StackKind.dynamic ? 'dynamic' : undefined].join(' '));
        this.description = suLine.function;
        this.tooltip = `${suLine.suFile.file.fsPath.split(path.sep).at(-1)} ${suLine.stack} ${suLine.function}`;
    }
}

export class CurrentFileStackUsageDataProvider implements vscode.TreeDataProvider<CurrentFileStackUsageTreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();

    constructor(private readonly suStore: SuStore) {
        this.suStore.onFilesUpdated(() => this._onDidChangeTreeData.fire());
        this.suStore.onEnabledChanged(() => this._onDidChangeTreeData.fire());
        vscode.window.onDidChangeActiveTextEditor(() => {
            // Refresh when tab changes
            if (this.suStore.enabled) {
                this.suStore.update();
            }
            this._onDidChangeTreeData.fire();
        });
    }

    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    getTreeItem(element: CurrentFileStackUsageTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: CurrentFileStackUsageTreeItem | undefined): vscode.ProviderResult<CurrentFileStackUsageTreeItem[]> {
        if (!this.suStore.enabled) {
            return [];
        }
        
        const activeTextEditor = vscode.window.activeTextEditor;

        if (element || !activeTextEditor) {
            return [];
        }
        const filename = activeTextEditor.document.fileName;

        return this.suStore.files.flatMap(f => f.lines).filter(l => l.matchesFileName(filename)).sort(SuLine.sortDescending).map(l => new CurrentFileStackUsageTreeItem(l));
    }

    resolveTreeItem(item: vscode.TreeItem, element: CurrentFileStackUsageTreeItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
        let activeTextEditor = vscode.window.activeTextEditor;
        if (activeTextEditor) {
            item.command = {
                title: 'Jump to position',
                command: 'editor.action.goToLocations',
                arguments: [activeTextEditor.document.uri, activeTextEditor.selection.start, [new vscode.Location(activeTextEditor.document.uri, element.suLine.position)], 'goto', 'Position not found']
            };
        }

        return item;
    }
}

// Made with Bob
