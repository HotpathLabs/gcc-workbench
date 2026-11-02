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
exports.SuStore = exports.SuFile = exports.SuLine = exports.StackKind = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const asyncOperationsStore_1 = require("./asyncOperationsStore");
var StackKind;
(function (StackKind) {
    StackKind[StackKind["static"] = 0] = "static";
    StackKind[StackKind["dynamic"] = 1] = "dynamic";
})(StackKind || (exports.StackKind = StackKind = {}));
class SuLine {
    suFile;
    suPosition;
    fileName;
    position;
    function;
    stack;
    stackKind;
    constructor(line, suFile, suPosition) {
        this.suFile = suFile;
        this.suPosition = suPosition;
        let parts = line.split('\t');
        let firstParts = parts[0].split(':');
        this.fileName = firstParts[0];
        this.position = new vscode.Position(Number(firstParts[1]) - 1, Number(firstParts[2]) - 1);
        this.function = firstParts.slice(3).join(':');
        this.stack = Number(parts[1]);
        this.stackKind = parts[2] === 'static' ? StackKind.static : StackKind.dynamic;
    }
    matchesFileName(otherFileName) {
        let matchFileName = this.fileName;
        if (!matchFileName.startsWith(path.sep)) {
            matchFileName = path.sep + matchFileName;
        }
        return otherFileName.endsWith(matchFileName);
    }
    static sortDescending(lhs, rhs) {
        if (lhs.stackKind !== rhs.stackKind) {
            return rhs.stackKind - lhs.stackKind;
        }
        return rhs.stack - lhs.stack;
    }
}
exports.SuLine = SuLine;
class SuFile {
    file;
    lastWritten;
    _lines = [];
    get lines() {
        return this._lines;
    }
    constructor(file, lastWritten = 0) {
        this.file = file;
        this.lastWritten = lastWritten;
        this._lines = [];
    }
    async update() {
        this.lines.length = 0;
        try {
            const stat = await vscode.workspace.fs.stat(this.file);
            this.lastWritten = stat.mtime;
            const content = await vscode.workspace.fs.readFile(this.file);
            const contentStr = Buffer.from(content).toString('utf8');
            let start = 0;
            let lineIndex = 0;
            while (start < contentStr.length) {
                const end = contentStr.indexOf('\n', start);
                this._lines.push(new SuLine(contentStr.substring(start, end), this, new vscode.Position(lineIndex, 0)));
                start = end + 1;
                lineIndex += 1;
            }
        }
        catch (error) {
            console.error(error);
        }
    }
    onDelete() {
        this.lines.length = 0;
        this.lastWritten = new Date().getTime();
    }
}
exports.SuFile = SuFile;
class SuStore {
    _files = new Map();
    _asyncOperationsStore = new asyncOperationsStore_1.AsyncOperationsStore();
    _outputChannel;
    _enabled = false;
    _onEnabledChanged = new vscode.EventEmitter();
    onEnabledChanged = this._onEnabledChanged.event;
    constructor() {
        this._outputChannel = vscode.window.createOutputChannel('GCC Stack Usage');
    }
    get onFilesUpdated() { return this._asyncOperationsStore.onAllOperationsDone; }
    get files() { return Array.from(this._files.values()); }
    get enabled() { return this._enabled; }
    setEnabled(enabled) {
        if (this._enabled !== enabled) {
            this._enabled = enabled;
            this._onEnabledChanged.fire(enabled);
            if (enabled) {
                this.update();
            }
            else {
                this._files.clear();
                this._asyncOperationsStore.onAllOperationsDone;
            }
        }
    }
    update() {
        if (!this._enabled) {
            return;
        }
        this._asyncOperationsStore.addOperation(async () => {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                cancellable: false,
                title: 'Reading .su files'
            }, async (progress) => {
                progress.report({ increment: 0 });
                // Clear all existing files before loading new ones
                this._files.clear();
                // Search for .su file corresponding to active file only
                this._outputChannel.appendLine('=== Searching for .su file ===');
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor) {
                    this._outputChannel.appendLine('No active file open');
                    return;
                }
                const activeFilePath = activeEditor.document.uri.fsPath;
                const activeFileName = path.basename(activeFilePath);
                const activeFileDir = path.dirname(activeFilePath);
                this._outputChannel.appendLine(`Active file: ${activeFileName}`);
                this._outputChannel.appendLine(`Directory: ${activeFileDir}`);
                // Determine the expected .su filename
                // For testcase.c, look for a-testcase.su or testcase.su
                const baseNameWithoutExt = activeFileName.replace(/\.(c|cpp|cc|cxx)$/i, '');
                const possibleSuNames = [
                    `a-${baseNameWithoutExt}.su`, // a-testcase.su
                    `${baseNameWithoutExt}.su` // testcase.su
                ];
                let suFilePath = null;
                for (const suName of possibleSuNames) {
                    const candidatePath = path.join(activeFileDir, suName);
                    if (fs.existsSync(candidatePath)) {
                        suFilePath = candidatePath;
                        this._outputChannel.appendLine(`Found .su file: ${suName}`);
                        break;
                    }
                }
                if (!suFilePath) {
                    this._outputChannel.appendLine(`No .su file found for ${activeFileName}`);
                    this._outputChannel.appendLine(`Looked for: ${possibleSuNames.join(', ')}`);
                    this._outputChannel.appendLine('Compile with -fstack-usage flag to generate .su files');
                    return;
                }
                // Load only this one .su file
                const uri = vscode.Uri.file(suFilePath);
                let suFile = this._files.get(uri.fsPath) ?? new SuFile(uri);
                this._files.set(uri.fsPath, suFile);
                await suFile.update();
                const totalLines = this.files.flatMap(f => f.lines).length;
                this._outputChannel.appendLine(`Loaded ${this._files.size} .su files with ${totalLines} total lines`);
                console.log(`[Stack Usage] Loaded ${this._files.size} .su files with ${totalLines} total lines`);
                progress.report({ increment: 100 });
                if (this._files.size === 0) {
                    // Don't show warning, just log it
                    this._outputChannel.appendLine('No .su files found in current context');
                }
                else {
                    this._outputChannel.appendLine(`Successfully loaded ${this._files.size} .su files`);
                }
            });
        });
    }
    onAddOrUpdate(uri) {
        if (!this._enabled) {
            return;
        }
        this._asyncOperationsStore.addOperation(async () => {
            console.log(`On add or update ${uri.fsPath}`);
            let suFile = this._files.get(uri.fsPath) ?? new SuFile(uri);
            this._files.set(uri.fsPath, suFile);
            await suFile.update();
        });
    }
    onDelete(uri) {
        if (!this._enabled) {
            return;
        }
        this._asyncOperationsStore.addOperation(async () => {
            console.log(`On delete ${uri.fsPath}`);
            let suFile = this._files.get(uri.fsPath);
            if (suFile) {
                suFile.onDelete();
            }
        });
    }
    dispose() {
        this._asyncOperationsStore.dispose();
        this._files.clear();
        this._outputChannel.dispose();
        this._onEnabledChanged.dispose();
    }
}
exports.SuStore = SuStore;
// Made with Bob
//# sourceMappingURL=suStore.js.map