"use strict";
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
exports.CurrentFileStackUsageDataProvider = void 0;
const vscode = __importStar(require("vscode"));
const suStore_1 = require("./suStore");
const path = __importStar(require("path"));
class CurrentFileStackUsageTreeItem extends vscode.TreeItem {
    suLine;
    constructor(suLine) {
        super([suLine.stack, suLine.stackKind === suStore_1.StackKind.dynamic ? 'dynamic' : undefined].join(' '));
        this.suLine = suLine;
        this.description = suLine.function;
        this.tooltip = `${suLine.suFile.file.fsPath.split(path.sep).at(-1)} ${suLine.stack} ${suLine.function}`;
    }
}
class CurrentFileStackUsageDataProvider {
    suStore;
    _onDidChangeTreeData = new vscode.EventEmitter();
    constructor(suStore) {
        this.suStore = suStore;
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
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!this.suStore.enabled) {
            return [];
        }
        const activeTextEditor = vscode.window.activeTextEditor;
        if (element || !activeTextEditor) {
            return [];
        }
        const filename = activeTextEditor.document.fileName;
        return this.suStore.files.flatMap(f => f.lines).filter(l => l.matchesFileName(filename)).sort(suStore_1.SuLine.sortDescending).map(l => new CurrentFileStackUsageTreeItem(l));
    }
    resolveTreeItem(item, element, token) {
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
exports.CurrentFileStackUsageDataProvider = CurrentFileStackUsageDataProvider;
// Made with Bob
//# sourceMappingURL=currentFileStackUsageDataProvider.js.map