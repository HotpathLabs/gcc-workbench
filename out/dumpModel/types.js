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
exports.findVarAt = findVarAt;
exports.findFunctionAt = findFunctionAt;
/** The variable occurrence under a position, if any. */
function findVarAt(model, line, col) {
    let best;
    for (const fn of model.functions) {
        if (line < fn.line || line > fn.endLine)
            continue;
        for (const variable of fn.vars.values()) {
            for (const o of variable.occurrences) {
                const inside = (line > o.line || (line === o.line && col >= o.start)) &&
                    (line < o.endLine || (line === o.endLine && col <= o.end));
                if (!inside)
                    continue;
                // Prefer the narrowest match (a reg nested in a subreg).
                const width = (o.endLine - o.line) * 10000 + (o.end - o.start);
                const bestWidth = best ? (best.occurrence.endLine - best.occurrence.line) * 10000 +
                    (best.occurrence.end - best.occurrence.start) : Infinity;
                if (width < bestWidth)
                    best = { fn, variable, occurrence: o };
            }
        }
    }
    return best;
}
function findFunctionAt(model, line) {
    return model.functions.find(f => line >= f.line && line <= f.endLine);
}
//# sourceMappingURL=types.js.map