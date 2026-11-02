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

class GlobalStackUsageSuLineTreeItem extends vscode.TreeItem {
    constructor(public readonly suLine: SuLine) {
        super([suLine.stack, suLine.stackKind === StackKind.dynamic ? 'dynamic' : undefined].join(' '));
        this.description = suLine.function;
        this.command = {
            title: 'Jump to code',
            command: 'workbench.action.quickOpen',
            arguments: [`"${suLine.fileName.split(path.sep).at(-1)}":${suLine.position.line + 1}:${suLine.position.character + 1}`]
        };
        this.tooltip = `${suLine.suFile.file.fsPath.split(path.sep).at(-1)} ${suLine.stack} ${suLine.function}`;
    }
}

class GlobalStackUsageCategoryTreeItem extends vscode.TreeItem {
    constructor(public readonly stackKind: StackKind) {
        super(stackKind === StackKind.dynamic ? 'dynamic' : 'static');
        this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        Object.setPrototypeOf(this, GlobalStackUsageCategoryTreeItem.prototype);
    }
}

export class GlobalStackUsageDataProvider implements vscode.TreeDataProvider<GlobalStackUsageSuLineTreeItem | GlobalStackUsageCategoryTreeItem> {
    public showLimit: number = 100;
    private readonly suStore: SuStore;
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    constructor(suStore: SuStore) {
        this.suStore = suStore;
        this.suStore.onFilesUpdated(() => this._onDidChangeTreeData.fire());
        this.suStore.onEnabledChanged(() => this._onDidChangeTreeData.fire());
    }

    getTreeItem(element: GlobalStackUsageSuLineTreeItem | GlobalStackUsageCategoryTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: GlobalStackUsageSuLineTreeItem | GlobalStackUsageCategoryTreeItem | undefined): vscode.ProviderResult<GlobalStackUsageSuLineTreeItem[] | GlobalStackUsageCategoryTreeItem[]> {
        if (!this.suStore.enabled) {
            return [];
        }
        
        if (element === undefined) {
            if (this.suStore.files.length === 0) {
                return [];
            }
            return [new GlobalStackUsageCategoryTreeItem(StackKind.dynamic), new GlobalStackUsageCategoryTreeItem(StackKind.static)];
        } else if (element instanceof GlobalStackUsageCategoryTreeItem) {
            return this.suStore.files.flatMap(v => v.lines).filter(v => v.stackKind === element.stackKind).sort(SuLine.sortDescending).slice(0, this.showLimit).map(l => new GlobalStackUsageSuLineTreeItem(l));
        } else {
            return;
        }
    }
}

// Made with Bob
