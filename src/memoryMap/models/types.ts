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

export interface MemoryRegion {
    name: string;
    origin: number;
    length: number;
    attributes: string;
    sections: Section[];
    used: number; // computed: sum of section sizes
}

export interface Section {
    name: string;
    address: number;
    size: number;
    region?: string;
    symbols: Symbol[];
    loadAddress?: number;
    sourceLine?: number;    // 0-based line number in the source file
    sourceLineEnd?: number;  // 0-based last line of this section
}

export interface Symbol {
    name: string;
    address: number;
    size: number;
    section?: string;
    sourceFile?: string;
    sourceLine?: number; // 0-based line number in the map file
}

export interface MemoryLayout {
    regions: MemoryRegion[];
    sections: Section[];        // all sections (including those not assigned to a region)
    sourceFile?: string;
    discardedSize?: number;     // total bytes from discarded input sections
    discardedCount?: number;    // number of discarded input sections
}

// Made with Bob
