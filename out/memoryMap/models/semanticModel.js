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
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifySymbol = classifySymbol;
exports.determineVisibility = determineVisibility;
/**
 * Helper to classify symbol type from name
 */
function classifySymbol(name) {
    // Generated symbols
    if (name.startsWith('__') || name === '*fill*' || name.includes('_generated_')) {
        return 'generated';
    }
    // Section symbols
    if (name.startsWith('.')) {
        return 'section';
    }
    // Weak symbols (common pattern)
    if (name.includes('.weak.')) {
        return 'weak';
    }
    // Function patterns (common naming conventions)
    if (name.match(/^[a-z_][a-z0-9_]*$/i) && !name.includes('.')) {
        return 'function';
    }
    return 'unknown';
}
/**
 * Helper to determine symbol visibility
 */
function determineVisibility(name, isWeak) {
    if (isWeak) {
        return 'weak';
    }
    // Local symbols often start with .L or have .local. in name
    if (name.startsWith('.L') || name.includes('.local.')) {
        return 'local';
    }
    // Hidden symbols (GCC/Clang convention)
    if (name.includes('.hidden.')) {
        return 'hidden';
    }
    // Default to global for top-level symbols
    return 'global';
}
// Made with Bob
//# sourceMappingURL=semanticModel.js.map