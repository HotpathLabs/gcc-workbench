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

import { FormatDetector, LinkerFormat } from './formatDetector';

/**
 * Detector for LLVM LLD linker map files
 */
export class LldDetector implements FormatDetector {
    readonly name = 'LLVM LLD';
    readonly type = 'lld' as const;
    
    detect(text: string): number {
        let confidence = 0;
        
        // Strong indicators (35 points each)
        // LLD uses "VMA LMA Size Align" header
        if (/^VMA\s+LMA\s+Size\s+Align/m.test(text)) {
            confidence += 35;
        }
        // LLD section format: "Address Size Align Out In Symbol"
        if (/^Address\s+Size\s+Align\s+Out\s+In\s+Symbol/m.test(text)) {
            confidence += 35;
        }
        
        // Medium indicators (20 points each)
        // LLD often shows "lld" in output
        if (/\blld\b/i.test(text.substring(0, 1000))) {
            confidence += 20;
        }
        
        // Weak indicators (10 points each)
        // LLD uses specific section naming
        if (/^\s+\d+\s+\.\w+\s+0x[0-9a-fA-F]+/m.test(text)) {
            confidence += 10;
        }
        
        // Negative indicators
        // GNU ld specific headers
        if (/^Memory Configuration\s*$/m.test(text)) {
            confidence -= 30;
        }
        if (/^Linker script and memory map\s*$/im.test(text)) {
            confidence -= 30;
        }
        
        return Math.max(0, Math.min(100, confidence));
    }
    
    extractFormat(text: string): LinkerFormat | null {
        const confidence = this.detect(text);
        if (confidence < 50) {
            return null;
        }
        
        const features: string[] = [];
        
        // Detect features
        if (/^VMA\s+LMA\s+Size\s+Align/m.test(text)) {
            features.push('vma-lma-table');
        }
        if (/^Address\s+Size\s+Align\s+Out\s+In\s+Symbol/m.test(text)) {
            features.push('detailed-symbols');
        }
        
        // Try to extract version
        const versionMatch = text.match(/LLD\s+(\d+\.\d+(?:\.\d+)?)/i);
        const version = versionMatch ? versionMatch[1] : undefined;
        
        return {
            type: this.type,
            version,
            features,
            confidence
        };
    }
}

// Made with Bob
