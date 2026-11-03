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
exports.refsByInsn = refsByInsn;
exports.computeLiveness = computeLiveness;
const types_1 = require("./types");
/** Real reads and writes of each insn, keyed by uid (notes, debug and log mentions excluded). */
function refsByInsn(fn) {
    const map = new Map();
    for (const v of fn.vars.values()) {
        const regno = Number(v.key.slice(1));
        for (const o of v.occurrences) {
            if (o.uid === undefined || o.role === 'note' || o.role === 'log' || o.role === 'debug')
                continue;
            if (!map.has(o.uid))
                map.set(o.uid, []);
            map.get(o.uid).push({ regno, o });
        }
    }
    return map;
}
/**
 * Live registers per block, computed the way GCC's df_lr problem does:
 * walking each block backwards, an insn's full defs kill the register and
 * its uses (including the read half of partial and auto-modify writes) make
 * it live. Partial and conditional writes never kill: like GCC 14's
 * df_lr_bb_local_compute they go in DEF and also count as a use.
 *
 * Artificial uses (frame/stack pointer), the hardware registers every block
 * keeps live and the exit block's uses come from the dump when it printed
 * them, so hard registers can be compared too. Registers a call clobbers
 * implicitly are not in the RTL, so call blocks miss those hard-register defs.
 */
function computeLiveness(fn) {
    const refs = refsByInsn(fn);
    const df = fn.dumpDataflow;
    const result = new Map();
    const byBlock = new Map();
    for (const insn of [...fn.insns.values()].sort((a, b) => a.seq - b.seq))
        if (insn.bb !== undefined) {
            if (!byBlock.has(insn.bb))
                byBlock.set(insn.bb, []);
            byBlock.get(insn.bb).push(insn.uid);
        }
    for (const blk of fn.blocks) {
        const use = new Set(), def = new Set();
        // Artificial uses sit at the end of the block (df_lr_bb_local_compute).
        for (const r of df?.blocks.get(blk.index)?.get('artificial uses') ?? [])
            use.add(r);
        const uids = byBlock.get(blk.index) ?? [];
        for (let k = uids.length - 1; k >= 0; k--) {
            const list = refs.get(uids[k]) ?? [];
            for (const { regno, o } of list)
                if (o.role === 'def' || o.role === 'both') {
                    def.add(regno);
                    if (o.partial)
                        use.add(regno);
                    else
                        use.delete(regno);
                }
            for (const { regno, o } of list)
                if (o.role === 'use' || o.role === 'both')
                    use.add(regno);
        }
        // Artificial defs sit at the top (EH landing pads define the EH return data registers).
        for (const r of df?.blocks.get(blk.index)?.get('artificial defs') ?? []) {
            def.add(r);
            use.delete(r);
        }
        // df_lr_confluence_0: every block's out starts with the hardware registers used (sp, frame, ap).
        const out = new Set(df?.function.get('hardware regs used') ?? []);
        const live = new Set(use);
        for (const r of out)
            if (!def.has(r))
                live.add(r);
        result.set(blk.index, { use, def, in: live, out });
    }
    const exitUses = df?.function.get('exit block uses') ?? [];
    let changed = true;
    while (changed) {
        changed = false;
        for (const blk of [...fn.blocks].reverse()) {
            const b = result.get(blk.index);
            for (const s of blk.succs) {
                const from = s === types_1.EXIT_BLOCK ? exitUses : result.get(s)?.in ?? [];
                for (const r of from)
                    if (!b.out.has(r)) {
                        b.out.add(r);
                        changed = true;
                    }
            }
            for (const r of b.out)
                if (!b.def.has(r) && !b.in.has(r)) {
                    b.in.add(r);
                    changed = true;
                }
        }
    }
    return result;
}
//# sourceMappingURL=liveness.js.map