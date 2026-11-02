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
import { StackKind, SuStore } from './suStore';

export class StackUsageCodeLensProvider implements vscode.CodeLensProvider {
    private readonly suStore: SuStore;
    readonly onDidChangeCodeLenses: vscode.Event<void>;

    constructor(suStore: SuStore) {
        this.suStore = suStore;
        this.onDidChangeCodeLenses = this.suStore.onFilesUpdated;
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        if (!this.suStore.enabled) {
            return [];
        }
        
        let lines = this.suStore.files.flatMap(f => f.lines).filter(l => l.matchesFileName(document.fileName));

        let codeLenses = [];
        for (const line of lines) {
            const range = document.getWordRangeAtPosition(line.position);
            if (range) {
                const title = ['Stack:', line.stack, line.stackKind === StackKind.dynamic ? 'dynamic' : undefined].filter(Boolean).join(' ');
                codeLenses.push(new vscode.CodeLens(range, {
                    title: title,
                    tooltip: line.function,
                    command: 'editor.action.goToLocations',
                    arguments: [document.uri, line.position, [new vscode.Location(line.suFile.file, line.suPosition)], 'goto', 'Su reference not found']
                }));
            } else {
                console.warn(`Did not find word range for ${line.position.line}:${line.position.character}`);
            }
        }

        console.log(`Created ${codeLenses.length} code lenses for ${lines.length} su lines for ${document.fileName}`);

        return codeLenses;
    }

    resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens> {
        return codeLens;
    }
}

// Made with Bob
