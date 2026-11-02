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

/** Real top-level RTL forms; anything else at column 0 inside a dump is pass logging. */
const INSN_FORM =
    /^\((?:insn|jump_insn|call_insn|debug_insn|note|code_label|barrier|jump_table_data|call_placeholder)\b/;

/**
 * Clobbers, barriers, uses and ';;' comments. Notes are deliberately not
 * faded: `(note ... NOTE_INSN_BASIC_BLOCK)` carries the block structure.
 */
const BASIC_NOISE = /^\s*(\(clobber|\(barrier|\(use|;;)/;

/**
 * Returns the 0-based line numbers Focus mode should fade in an RTL dump.
 *
 * Besides the basic noise this covers the logging verbose passes print:
 * free text at column 0, indented text such as `Adding insn 12 to worklist`,
 * compact `12: r1=r2` / `REG_DEAD` listings, BB edge
 * summaries, and candidate RTL blocks (`(set ...)`, `(parallel [...])`).
 * Mirrors the `log` rules in syntaxes/rtl.tmLanguage.json.
 */
export function findNoiseLines(lines: string[]): number[] {
    const noisy: number[] = [];
    let inCandidate = false;

    lines.forEach((line, i) => {
        const col0 = line.length > 0 && !/\s/.test(line[0]);

        if (inCandidate && col0) { inCandidate = false; }

        if (inCandidate) {
            noisy.push(i);
            return;
        }

        if (col0 && line[0] === '(' && !INSN_FORM.test(line) && /^\([a-z_]+/.test(line)) {
            inCandidate = true;
            noisy.push(i);
            return;
        }

        if (BASIC_NOISE.test(line) ||
            (col0 && line[0] !== '(') ||
            /^\(\s*(?:\d+\s*)*\)->/.test(line) ||
            /^\s+\d+:\s/.test(line) ||
            /^\s+[A-Za-z_]/.test(line)) {
            noisy.push(i);
        }
    });

    return noisy;
}
