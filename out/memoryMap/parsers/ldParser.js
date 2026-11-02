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
exports.parseLd = parseLd;
const format_1 = require("../util/format");
function parseLd(text) {
    const regions = [];
    const sections = [];
    let state = 0 /* State.TOP_LEVEL */;
    let braceDepth = 0;
    let currentSectionName;
    let sectionBraceStart = 0;
    // Strip C-style comments
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = stripped.split('\n');
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        switch (state) {
            case 0 /* State.TOP_LEVEL */: {
                if (/^MEMORY\s*\{/.test(line)) {
                    state = 2 /* State.MEMORY_BLOCK */;
                    braceDepth = 1;
                    // Handle inline content after MEMORY {
                    const afterBrace = line.substring(line.indexOf('{') + 1).trim();
                    if (afterBrace) {
                        parseMemoryLine(afterBrace, regions);
                    }
                }
                else if (/^MEMORY\s*$/.test(line)) {
                    state = 1 /* State.MEMORY_PENDING */;
                }
                else if (/^SECTIONS\s*\{/.test(line)) {
                    state = 4 /* State.SECTIONS_BLOCK */;
                    braceDepth = 1;
                }
                else if (/^SECTIONS\s*$/.test(line)) {
                    state = 3 /* State.SECTIONS_PENDING */;
                }
                break;
            }
            case 1 /* State.MEMORY_PENDING */: {
                if (line === '{') {
                    state = 2 /* State.MEMORY_BLOCK */;
                    braceDepth = 1;
                }
                else {
                    // Not a MEMORY block after all
                    state = 0 /* State.TOP_LEVEL */;
                }
                break;
            }
            case 3 /* State.SECTIONS_PENDING */: {
                if (line === '{') {
                    state = 4 /* State.SECTIONS_BLOCK */;
                    braceDepth = 1;
                }
                else {
                    state = 0 /* State.TOP_LEVEL */;
                }
                break;
            }
            case 2 /* State.MEMORY_BLOCK */: {
                if (line.includes('}')) {
                    state = 0 /* State.TOP_LEVEL */;
                    // Parse content before the closing brace
                    const before = line.substring(0, line.indexOf('}'));
                    if (before.trim()) {
                        parseMemoryLine(before, regions);
                    }
                }
                else {
                    parseMemoryLine(line, regions);
                }
                break;
            }
            case 4 /* State.SECTIONS_BLOCK */: {
                // Check for section definition start: ".name ... {"  or ".name ... : {"
                const sectionMatch = line.match(/^(\.[a-zA-Z_][\w.]*)\s*.*\{/);
                if (sectionMatch && !line.match(/^\*\(/)) {
                    currentSectionName = sectionMatch[1];
                    sectionBraceStart = braceDepth;
                    braceDepth += countBraces(line);
                    state = 5 /* State.SECTION_DEF */;
                    // Check if the section def closes on the same line
                    if (braceDepth <= sectionBraceStart) {
                        // Single-line section def - check for region assignment
                        const regionAssign = line.match(/>\s*([A-Za-z_]\w*)/);
                        finishSection(currentSectionName, regionAssign?.[1], sections);
                        currentSectionName = undefined;
                        state = 4 /* State.SECTIONS_BLOCK */;
                    }
                }
                else {
                    braceDepth += countBraces(line);
                    if (braceDepth <= 0) {
                        state = 0 /* State.TOP_LEVEL */;
                    }
                }
                break;
            }
            case 5 /* State.SECTION_DEF */: {
                braceDepth += countBraces(line);
                // Check for region assignment on closing brace line or after
                // Pattern: } > REGION  or  } > REGION AT> LOAD_REGION
                if (braceDepth <= sectionBraceStart) {
                    const fullLine = line;
                    const regionAssign = fullLine.match(/>\s*([A-Za-z_]\w*)/);
                    finishSection(currentSectionName, regionAssign?.[1], sections);
                    currentSectionName = undefined;
                    state = 4 /* State.SECTIONS_BLOCK */;
                    if (braceDepth <= 0) {
                        state = 0 /* State.TOP_LEVEL */;
                    }
                }
                break;
            }
        }
    }
    // Assign sections to regions
    for (const section of sections) {
        if (section.region) {
            const region = regions.find(r => r.name === section.region);
            if (region) {
                region.sections.push(section);
            }
        }
    }
    return { regions, sections };
}
function parseMemoryLine(line, regions) {
    // Format: NAME [(attr)] : ORIGIN = value , LENGTH = value
    // Also: NAME (attr) : org = value , len = value
    const match = line.match(/^([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s*:\s*(?:ORIGIN|org|o)\s*=\s*(\S+?)\s*,\s*(?:LENGTH|len|l)\s*=\s*(\S+)/i);
    if (match) {
        regions.push({
            name: match[1],
            attributes: match[2]?.trim() ?? '',
            origin: (0, format_1.parseSize)(match[3]),
            length: (0, format_1.parseSize)(match[4]),
            sections: [],
            used: 0,
        });
    }
}
function finishSection(name, region, sections) {
    sections.push({
        name,
        address: 0,
        size: 0,
        region,
        symbols: [],
    });
}
function countBraces(line) {
    let count = 0;
    // Skip braces inside strings
    let inString = false;
    for (const ch of line) {
        if (ch === '"') {
            inString = !inString;
        }
        if (inString) {
            continue;
        }
        if (ch === '{') {
            count++;
        }
        if (ch === '}') {
            count--;
        }
    }
    return count;
}
// Made with Bob
//# sourceMappingURL=ldParser.js.map