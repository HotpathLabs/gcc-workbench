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
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSourceName = extractSourceName;
exports.extractSymbolName = extractSymbolName;
exports.hexVariants = hexVariants;
/**
 * Extract a source filename from a linker object reference.
 * Examples:
 *   "libmain.a(main.c.obj)"          → "main.c"
 *   "build/main.o"                    → "main"
 *   "lib/libfoo.a(bar.cpp.obj)"       → "bar.cpp"
 */
function extractSourceName(objRef) {
    if (!objRef) {
        return undefined;
    }
    // Pattern: lib.a(file.c.obj) or lib.a(file.cpp.obj)
    const archiveMatch = objRef.match(/\(([^)]+)\)\s*$/);
    const inner = archiveMatch ? archiveMatch[1] : objRef;
    // Strip trailing .obj or .o
    let name = inner.replace(/\.obj$/i, '').replace(/\.o$/i, '');
    // Get just the filename part (no directory)
    name = name.replace(/\\/g, '/');
    const lastSlash = name.lastIndexOf('/');
    if (lastSlash >= 0) {
        name = name.substring(lastSlash + 1);
    }
    return name || undefined;
}
/**
 * Extract a clean function/variable name from a linker symbol name.
 * Examples:
 *   ".text.app_main"       → "app_main"
 *   ".rodata.str1.1"       → "str1.1"
 *   "main"                 → "main"
 */
function extractSymbolName(symName) {
    // Strip known section prefixes like .text. .rodata. .bss. .data.
    const prefixMatch = symName.match(/^\.(text|rodata|data|bss|literal)\.(.*)/);
    if (prefixMatch) {
        return prefixMatch[2];
    }
    return symName;
}
/**
 * Generate all hex address search variants for a given numeric address.
 * Returns 8-digit, 16-digit, and minimal hex strings.
 */
function hexVariants(address) {
    const hexRaw = address.toString(16);
    return {
        hex8: '0x' + hexRaw.padStart(8, '0'),
        hex16: '0x' + hexRaw.padStart(16, '0'),
        hexMin: '0x' + hexRaw,
    };
}
// Made with Bob
//# sourceMappingURL=symbols.js.map