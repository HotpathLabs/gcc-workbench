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
exports.GnuLdDetector = void 0;
/**
 * Detector for GNU ld (BFD linker) map files
 */
class GnuLdDetector {
    name = 'GNU ld';
    type = 'gnu-ld';
    detect(text) {
        let confidence = 0;
        // Strong indicators (30 points each)
        if (/^Memory Configuration\s*$/m.test(text)) {
            confidence += 30;
        }
        if (/^Linker script and memory map\s*$/im.test(text)) {
            confidence += 30;
        }
        // Medium indicators (15 points each)
        if (/^Name\s+Origin\s+Length\s+Attributes\s*$/m.test(text)) {
            confidence += 15;
        }
        if (/^Discarded input sections\s*$/im.test(text)) {
            confidence += 15;
        }
        // Weak indicators (5 points each)
        if (/^LOAD\s+/m.test(text)) {
            confidence += 5;
        }
        if (/^\s*\*fill\*\s+0x[0-9a-fA-F]+/m.test(text)) {
            confidence += 5;
        }
        if (/^Cross Reference Table\s*$/im.test(text)) {
            confidence += 5;
        }
        if (/^Archive member included to satisfy reference/im.test(text)) {
            confidence += 5;
        }
        // Negative indicators (reduce confidence)
        // LLD uses different section headers
        if (/^VMA\s+LMA\s+Size\s+Align/m.test(text)) {
            confidence -= 20;
        }
        // Gold has different output format
        if (/^\.gnu\.version/m.test(text) && /^\.dynsym/m.test(text)) {
            confidence -= 10;
        }
        return Math.max(0, Math.min(100, confidence));
    }
    extractFormat(text) {
        const confidence = this.detect(text);
        if (confidence < 50) {
            return null;
        }
        const features = [];
        // Detect features
        if (/^Memory Configuration\s*$/m.test(text)) {
            features.push('memory-regions');
        }
        if (/^Discarded input sections\s*$/im.test(text)) {
            features.push('discarded-sections');
        }
        if (/^Cross Reference Table\s*$/im.test(text)) {
            features.push('cross-references');
        }
        if (/^Allocating common symbols\s*$/im.test(text)) {
            features.push('common-symbols');
        }
        if (/^Archive member included/im.test(text)) {
            features.push('archive-members');
        }
        // Try to extract version (GNU ld often doesn't include version in map)
        const versionMatch = text.match(/GNU ld[^\n]*?(\d+\.\d+(?:\.\d+)?)/i);
        const version = versionMatch ? versionMatch[1] : undefined;
        return {
            type: this.type,
            version,
            features,
            confidence
        };
    }
}
exports.GnuLdDetector = GnuLdDetector;
// Made with Bob
//# sourceMappingURL=gnuLdDetector.js.map