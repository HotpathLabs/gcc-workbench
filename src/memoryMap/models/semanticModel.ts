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

import { LinkerFormat } from '../detection/formatDetector';
import { MemoryRegion, Section, Symbol } from './types';

/**
 * Symbol type classification
 */
export type SymbolType = 'function' | 'variable' | 'section' | 'weak' | 'strong' | 'generated' | 'unknown';

/**
 * Symbol visibility
 */
export type SymbolVisibility = 'local' | 'global' | 'weak' | 'hidden';

/**
 * Enhanced symbol with additional metadata
 */
export interface EnhancedSymbol extends Symbol {
    type?: SymbolType;
    visibility?: SymbolVisibility;
    alignment?: number;
    isGenerated?: boolean;
    isWeak?: boolean;
}

/**
 * Cross-reference information
 */
export interface CrossReference {
    symbol: string;
    definedIn: string;
    referencedBy: string[];
    address?: number;
}

/**
 * Discarded section information
 */
export interface DiscardedSection {
    name: string;
    size: number;
    sourceFile?: string;
    reason?: string;
}

/**
 * Map file metadata
 */
export interface MapMetadata {
    format: LinkerFormat;
    generatedBy?: string;
    timestamp?: Date;
    targetArch?: string;
    entryPoint?: number;
    totalSize?: number;
}

/**
 * Complete map file document model
 */
export interface MapFileDocument {
    metadata: MapMetadata;
    regions: MemoryRegion[];
    sections: Section[];
    symbols: EnhancedSymbol[];
    crossReferences: CrossReference[];
    discarded: DiscardedSection[];
    sourceFile?: string;
}

/**
 * Helper to classify symbol type from name
 */
export function classifySymbol(name: string): SymbolType {
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
export function determineVisibility(name: string, isWeak?: boolean): SymbolVisibility {
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
