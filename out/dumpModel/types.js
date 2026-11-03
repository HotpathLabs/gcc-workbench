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
exports.FlowQuery = exports.kills = exports.isRead = exports.isWrite = exports.PositionIndex = exports.EXIT_BLOCK = exports.ENTRY_BLOCK = void 0;
exports.findVarAt = findVarAt;
exports.findFunctionAt = findFunctionAt;
exports.findUidRefAt = findUidRefAt;
exports.findBbRefAt = findBbRefAt;
exports.ENTRY_BLOCK = 0;
exports.EXIT_BLOCK = 1;
const within = (line, col, l0, c0, l1, c1) => (line > l0 || (line === l0 && col >= c0)) && (line < l1 || (line === l1 && col <= c1));
/** The variable occurrence under a position, if any. */
function findVarAt(model, line, col) {
    let best;
    let bestWidth = Infinity;
    for (const fn of model.functions) {
        if (line < fn.line || line > fn.endLine)
            continue;
        for (const variable of fn.vars.values()) {
            for (const o of variable.occurrences) {
                if (o.implicit || !within(line, col, o.line, o.start, o.endLine, o.end))
                    continue;
                // Prefer the narrowest match (a reg nested in a subreg).
                const width = (o.endLine - o.line) * 10000 + (o.end - o.start);
                if (width < bestWidth) {
                    best = { fn, variable, occurrence: o };
                    bestWidth = width;
                }
            }
        }
    }
    return best;
}
/**
 * Everything clickable, bucketed by line, so a hover or highlight request
 * looks at one line instead of every occurrence in the dump.
 */
class PositionIndex {
    vars = new Map();
    uids = new Map();
    bbs = new Map();
    labels = new Map();
    constructor(model) {
        const add = (map, line, item) => {
            const list = map.get(line);
            if (list)
                list.push(item);
            else
                map.set(line, [item]);
        };
        for (const fn of model.functions) {
            for (const variable of fn.vars.values())
                for (const occurrence of variable.occurrences)
                    if (!occurrence.implicit)
                        for (let l = occurrence.line; l <= occurrence.endLine; l++)
                            add(this.vars, l, { fn, variable, occurrence });
            for (const ref of fn.uidRefs)
                add(this.uids, ref.line, { fn, ref });
            for (const ref of fn.bbRefs ?? [])
                add(this.bbs, ref.line, { fn, ref });
            for (const ref of fn.labelRefs ?? [])
                add(this.labels, ref.line, { fn, ref });
        }
    }
    varAt(line, col) {
        let best;
        let bestWidth = Infinity;
        for (const h of this.vars.get(line) ?? []) {
            const o = h.occurrence;
            if (!within(line, col, o.line, o.start, o.endLine, o.end))
                continue;
            const width = (o.endLine - o.line) * 10000 + (o.end - o.start);
            if (width < bestWidth) {
                best = h;
                bestWidth = width;
            }
        }
        return best;
    }
    targetAt(line, col) {
        const hit = this.varAt(line, col);
        if (hit)
            return { kind: 'var', hit };
        const bb = this.bbs.get(line)?.find(x => col >= x.ref.start && col <= x.ref.end);
        if (bb)
            return { kind: 'bb', ...bb };
        const uid = this.uids.get(line)?.find(x => col >= x.ref.start && col <= x.ref.end);
        if (uid)
            return { kind: 'uid', ...uid };
        const label = this.labels.get(line)?.find(x => col >= x.ref.start && col <= x.ref.end);
        if (label)
            return { kind: 'label', ...label };
        return undefined;
    }
}
exports.PositionIndex = PositionIndex;
function findFunctionAt(model, line) {
    return model.functions.find(f => line >= f.line && line <= f.endLine);
}
function findUidRefAt(fn, line, col) {
    return fn.uidRefs.find(r => r.line === line && col >= r.start && col <= r.end);
}
function findBbRefAt(fn, line, col) {
    return fn.bbRefs?.find(r => r.line === line && col >= r.start && col <= r.end);
}
const isWrite = (o) => o.role === 'def' || o.role === 'both';
exports.isWrite = isWrite;
const isRead = (o) => o.role === 'use' || o.role === 'both' || o.role === 'debug';
exports.isRead = isRead;
/** A write that makes earlier values of the register dead. */
const kills = (o) => (0, exports.isWrite)(o) && !o.partial;
exports.kills = kills;
/**
 * Reaching definitions / reached uses for one register, on demand.
 *
 * Within an insn every operand is read before any is written, so the defs of
 * the insn containing a use do not reach it, and the uses of an insn
 * containing a def are not reached by it.
 */
class FlowQuery {
    fn;
    byBlock = new Map(); // occurrences in chain order
    blocks = new Map();
    constructor(fn, v) {
        this.fn = fn;
        for (const b of fn.flowBlocks ?? fn.blocks)
            this.blocks.set(b.index, b);
        for (const o of v.occurrences) {
            if (o.uid === undefined || o.role === 'note' || o.role === 'log' || o.role === 'decl')
                continue;
            const bb = this.bbOf(o);
            if (bb === undefined)
                continue;
            let list = this.byBlock.get(bb);
            if (!list)
                this.byBlock.set(bb, list = []);
            list.push(o);
        }
        for (const list of this.byBlock.values())
            list.sort((a, b) => this.seq(a) - this.seq(b) || a.line - b.line || a.start - b.start);
    }
    seq(o) { return this.fn.insns.get(o.uid).seq; }
    bbOf(o) {
        const insn = o.uid === undefined ? undefined : this.fn.insns.get(o.uid);
        return insn?.flowBb ?? insn?.bb;
    }
    /** Whether the query can be answered (the occurrence sits in a known block). */
    supports(o) { return this.bbOf(o) !== undefined && this.blocks.has(this.bbOf(o)); }
    reachingDefs(at) {
        const out = [];
        let fromEntry = false;
        const start = this.bbOf(at);
        const atSeq = this.seq(at);
        // Walk backwards through a block; returns true when a killing def was found.
        const scan = (bb, before) => {
            const list = this.byBlock.get(bb) ?? [];
            for (let i = list.length - 1; i >= 0; i--) {
                const o = list[i];
                if (this.seq(o) >= before || !(0, exports.isWrite)(o))
                    continue;
                out.push(o);
                if ((0, exports.kills)(o))
                    return true;
            }
            return false;
        };
        const visited = new Set();
        const work = [];
        const preds = (bb) => {
            const b = this.blocks.get(bb);
            if (!b || b.preds.length === 0 || b.preds.includes(exports.ENTRY_BLOCK))
                fromEntry = true;
            for (const p of b?.preds ?? [])
                if (p !== exports.ENTRY_BLOCK)
                    work.push(p);
        };
        if (!scan(start, atSeq))
            preds(start);
        while (work.length) {
            const bb = work.pop();
            if (visited.has(bb))
                continue;
            visited.add(bb);
            if (!scan(bb, Infinity))
                preds(bb);
        }
        return { occurrences: out.sort((a, b) => a.line - b.line || a.start - b.start), fromEntry, toExit: false };
    }
    reachedUses(def) {
        const out = [];
        let toExit = false;
        const start = this.bbOf(def);
        const defSeq = this.seq(def);
        // Walk forwards through a block; returns true when a killing def ends the value's life.
        const scan = (bb, after) => {
            const list = this.byBlock.get(bb) ?? [];
            let killedAt;
            for (const o of list) {
                const s = this.seq(o);
                if (s <= after)
                    continue;
                if (killedAt !== undefined && s > killedAt)
                    break;
                if ((0, exports.isRead)(o) && out.indexOf(o) < 0)
                    out.push(o);
                if ((0, exports.kills)(o))
                    killedAt = s;
            }
            return killedAt !== undefined;
        };
        const visited = new Set();
        const work = [];
        const succs = (bb) => {
            const b = this.blocks.get(bb);
            if (!b || b.succs.length === 0 || b.succs.includes(exports.EXIT_BLOCK))
                toExit = true;
            for (const s of b?.succs ?? [])
                if (s !== exports.EXIT_BLOCK)
                    work.push(s);
        };
        if (!scan(start, defSeq))
            succs(start);
        while (work.length) {
            const bb = work.pop();
            if (visited.has(bb))
                continue;
            visited.add(bb);
            if (!scan(bb, -Infinity))
                succs(bb);
        }
        return { occurrences: out.sort((a, b) => a.line - b.line || a.start - b.start), fromEntry: false, toExit };
    }
}
exports.FlowQuery = FlowQuery;
//# sourceMappingURL=types.js.map