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
exports.GccFocusProvider = void 0;
const vscode = __importStar(require("vscode"));
const rtlNoise_1 = require("./rtlNoise");
class GccFocusProvider {
    noiseDecorationType = vscode.window.createTextEditorDecorationType({ opacity: '0.2' });
    activeEditors = new Set(); // Store URI strings for safety
    toggleFocusMode(editor) {
        if (!editor)
            return;
        const key = editor.document.uri.toString();
        if (this.activeEditors.has(key)) {
            // TURN OFF
            editor.setDecorations(this.noiseDecorationType, []);
            this.activeEditors.delete(key);
            vscode.window.setStatusBarMessage("Focus Mode: OFF", 2000);
            this.updateContext(false); // Update UI
        }
        else {
            // TURN ON
            this.applyDecoration(editor);
            this.activeEditors.add(key);
            vscode.window.setStatusBarMessage("Focus Mode: ON (Noise Hidden)", 2000);
            this.updateContext(true); // Update UI
        }
    }
    // Helper to check state for a specific editor
    isActive(editor) {
        return this.activeEditors.has(editor.document.uri.toString());
    }
    // Restore state when switching tabs
    restoreState(editor) {
        const active = this.isActive(editor);
        if (active) {
            this.applyDecoration(editor);
        }
        // Sync the button state to match this specific tab
        this.updateContext(active);
    }
    // Tell VS Code to show/hide the "Eye" button
    updateContext(isActive) {
        vscode.commands.executeCommand('setContext', 'gcc-dump.focusModeActive', isActive);
    }
    applyDecoration(editor) {
        const doc = editor.document;
        const noiseRanges = [];
        if (doc.languageId === 'gcc-rtl') {
            // Clobbers, ';;' comments and the pass logging in verbose dumps.
            // Notes stay visible: NOTE_INSN_BASIC_BLOCK carries block structure.
            const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
            for (const i of (0, rtlNoise_1.findNoiseLines)(lines))
                noiseRanges.push(doc.lineAt(i).range);
        }
        else {
            // Regex: Matches clobbers, barriers, uses, and ;; comments
            const text = doc.getText();
            const noiseRegex = /^\s*(\(clobber|\(barrier|\(use|;;).*$/gm;
            let match;
            while ((match = noiseRegex.exec(text))) {
                noiseRanges.push(new vscode.Range(doc.positionAt(match.index), doc.positionAt(match.index + match[0].length)));
            }
        }
        editor.setDecorations(this.noiseDecorationType, noiseRanges);
    }
}
exports.GccFocusProvider = GccFocusProvider;
//# sourceMappingURL=focusProvider.js.map