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
exports.AsyncOperationsStore = void 0;
const vscode = __importStar(require("vscode"));
const DEFAULT_TIMEOUT_MS = 1000;
class AsyncOperationsStore {
    _timerRunning = false;
    _timerId = null;
    _timerInvalidated = false;
    _store = [];
    _disposed = false;
    _onAllOperationsDone = new vscode.EventEmitter();
    onAllOperationsDone = this._onAllOperationsDone.event;
    addOperation(operation) {
        this._store.push(operation);
        if (this._timerRunning) {
            this._timerInvalidated = true;
            console.log('AsyncOperationsStore: Timer invalidated');
        }
        else {
            this.startTimer();
        }
        console.log('AsyncOperationsStore: Added operation');
    }
    startTimer() {
        if (!this._disposed) {
            this._timerRunning = true;
            this._timerInvalidated = false;
            this._timerId = setTimeout(() => this.onTimer(), DEFAULT_TIMEOUT_MS);
            console.log('AsyncOperationsStore: Timer started');
        }
    }
    async onTimer() {
        this._timerId = null;
        console.log('AsyncOperationsStore: Handle timer');
        while (this._store.length > 0 && !this._timerInvalidated && !this._disposed) {
            const operation = this._store.shift();
            if (operation) {
                console.log('AsyncOperationsStore: Processing operation');
                await operation();
            }
        }
        if (this._store.length > 0) {
            this.startTimer();
        }
        else {
            this._timerRunning = false;
            this._onAllOperationsDone.fire();
            console.log('AsyncOperationsStore: All operations done');
        }
    }
    dispose() {
        this._disposed = true;
        if (this._timerId) {
            clearTimeout(this._timerId);
        }
        console.log('AsyncOperationsStore: Disposed');
    }
}
exports.AsyncOperationsStore = AsyncOperationsStore;
// Made with Bob
//# sourceMappingURL=asyncOperationsStore.js.map