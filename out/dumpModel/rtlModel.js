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
exports.parseRtlDump = parseRtlDump;
/** Top-level forms that start a real insn; anything else at column 0 is pass logging. */
const TOP_LEVEL = /^\((insn|jump_insn|call_insn|debug_insn|note|code_label|barrier|jump_table_data)(\/[a-z]+)*[\s]/;
const FUNCTION_LINE = /^;; Function (\S+)/;
function tokenize(text) {
    const root = { kind: 'list', text: '', start: 0, end: text.length, items: [] };
    const stack = [root];
    const re = /"(?:[^"\\]|\\.)*"|[()\[\]]|[^\s()\[\]"]+/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const top = stack[stack.length - 1];
        const t = m[0];
        if (t === '(' || t === '[') {
            const n = { kind: t === '(' ? 'list' : 'brack', text: '', start: m.index, end: m.index + 1, items: [] };
            top.items.push(n);
            stack.push(n);
        }
        else if (t === ')' || t === ']') {
            const opener = t === ')' ? 'list' : 'brack';
            // Tolerate mismatches such as MEM[(const int *)_5]: close the nearest matching opener.
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].kind === opener) {
                    stack[i].end = m.index + 1;
                    stack.length = i;
                    break;
                }
            }
        }
        else {
            top.items.push({ kind: t[0] === '"' ? 'str' : 'atom', text: t, start: m.index, end: m.index + t.length, items: [] });
        }
    }
    return root;
}
function headOf(n) {
    if (n.kind !== 'list' || n.items.length === 0 || n.items[0].kind !== 'atom')
        return undefined;
    const m = /^([a-z_0-9]+)((?:\/[a-z]+)*)(?::([A-Za-z0-9_]+))?$/.exec(n.items[0].text);
    return m ? { code: m[1], flags: m[2], mode: m[3] } : undefined;
}
const AUTO_MODIFY = new Set(['pre_inc', 'pre_dec', 'post_inc', 'post_dec', 'pre_modify', 'post_modify']);
const PARTIAL_DEST = new Set(['strict_low_part', 'zero_extract', 'sign_extract', 'subreg']);
class FunctionBuilder {
    vars = new Map();
    insns = new Map();
    uidRefs = [];
    blockLines = new Map();
}
class ChunkWalker {
    text;
    baseLine;
    fn;
    lineStarts = [];
    constructor(text, baseLine, fn) {
        this.text = text;
        this.baseLine = baseLine;
        this.fn = fn;
        this.lineStarts.push(0);
        for (let i = 0; i < text.length; i++)
            if (text[i] === '\n')
                this.lineStarts.push(i + 1);
    }
    pos(offset) {
        let lo = 0, hi = this.lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this.lineStarts[mid] <= offset)
                lo = mid;
            else
                hi = mid - 1;
        }
        return { line: this.baseLine + lo, col: offset - this.lineStarts[lo] };
    }
    record(n, head, role) {
        const regno = Number(n.items[1]?.text);
        if (!Number.isInteger(regno))
            return;
        const key = 'r' + regno;
        let v = this.fn.vars.get(key);
        if (!v) {
            v = { key, occurrences: [], modes: new Set(), flags: new Set() };
            this.fn.vars.set(key, v);
        }
        if (head.mode)
            v.modes.add(head.mode);
        head.flags.split('/').filter(Boolean).forEach(f => v.flags.add(f));
        const rest = n.items.slice(2);
        const name = rest.find(i => i.kind === 'atom');
        if (name && !v.hardName && !/^\d/.test(name.text))
            v.hardName = name.text;
        const brack = rest.find(i => i.kind === 'brack');
        if (brack && !v.userName) {
            const inner = brack.items.map(i => i.text).join(' ').trim();
            if (inner)
                v.userName = inner;
        }
        const a = this.pos(n.start), b = this.pos(n.end - 1);
        const occ = { line: a.line, start: a.col, endLine: b.line, end: b.col + 1, role,
            mode: head.mode, flags: head.flags || undefined };
        v.occurrences.push(occ);
    }
    walk(n, role) {
        if (n.kind === 'brack') {
            n.items.forEach(c => this.walk(c, role));
            return;
        }
        const head = headOf(n);
        if (!head) {
            n.items.forEach(c => this.walk(c, role));
            return;
        }
        switch (head.code) {
            case 'reg':
                this.record(n, head, role);
                return;
            case 'set':
                if (n.items[1])
                    this.dest(n.items[1]);
                if (n.items[2])
                    this.walk(n.items[2], 'use');
                return;
            case 'clobber':
                if (n.items[1])
                    this.dest(n.items[1]);
                return;
            case 'label_ref': {
                const num = n.items[1];
                if (num && /^\d+$/.test(num.text)) {
                    const a = this.pos(num.start);
                    this.fn.uidRefs.push({ uid: Number(num.text), line: a.line, start: a.col, end: a.col + num.text.length });
                }
                return;
            }
            case 'expr_list':
            case 'insn_list':
                // REG_DEAD and friends annotate an insn; they are not reads or writes.
                n.items.slice(1).forEach(c => this.walk(c, head.mode && head.mode.startsWith('REG_') ? 'note' : role));
                return;
            default:
                if (AUTO_MODIFY.has(head.code)) {
                    n.items.slice(1).forEach((c, i) => this.walk(c, i === 0 ? 'both' : 'use'));
                    return;
                }
                n.items.slice(1).forEach(c => this.walk(c, role));
        }
    }
    /** The destination of a set/clobber: the reg itself is written, anything under a mem is read. */
    dest(n) {
        if (n.kind === 'brack') {
            n.items.forEach(c => this.dest(c));
            return;
        }
        const head = headOf(n);
        if (!head)
            return;
        if (head.code === 'reg') {
            this.record(n, head, 'def');
            return;
        }
        if (PARTIAL_DEST.has(head.code)) {
            const [first, ...rest] = n.items.slice(1);
            if (first)
                this.dest(first);
            rest.forEach(c => this.walk(c, 'use'));
            return;
        }
        if (head.code === 'parallel' || head.code === 'concat' || head.code === 'concatn') {
            n.items.slice(1).forEach(c => this.dest(c));
            return;
        }
        this.walk(n, 'use'); // mem, pc, ...
    }
    insn(tree, kind) {
        const list = tree.items[0];
        if (!list || list.kind !== 'list')
            return {};
        const nums = list.items.slice(1, 5).map(i => (/^-?\d+$/.test(i.text) ? Number(i.text) : undefined));
        const [uid, prev, next, bb] = nums;
        const refs = [list.items[2], list.items[3]];
        refs.forEach((r, i) => {
            const val = i === 0 ? prev : next;
            if (r && val !== undefined && val > 0) {
                const a = this.pos(r.start);
                this.fn.uidRefs.push({ uid: val, line: a.line, start: a.col, end: a.col + r.text.length });
            }
        });
        if (kind === 'insn' || kind === 'jump_insn' || kind === 'call_insn' || kind === 'debug_insn') {
            const pattern = list.items[5];
            if (pattern)
                this.walk(pattern, 'use');
            // Everything after the pattern: location string, insn code, {name}, notes.
            list.items.slice(6).forEach(c => { if (c.kind === 'list')
                this.walk(c, 'use'); });
        }
        else if (kind === 'code_label') {
            // (code_label uid prev next bb [nuses uses] name ...): nothing to walk
        }
        return { uid, prev, next, bb };
    }
}
function parseRtlDump(lines) {
    const functions = [];
    let current;
    const finish = (endLine) => {
        if (!current)
            return;
        const b = current.builder;
        const blocks = Array.from(b.blockLines.entries())
            .map(([index, r]) => ({ index, line: r.line, endLine: r.endLine, insnCount: r.insnCount }))
            .sort((x, y) => x.line - y.line);
        functions.push({ name: current.name, line: current.line, endLine: Math.max(endLine, current.line),
            blocks, vars: b.vars, insns: b.insns, uidRefs: b.uidRefs });
        current = undefined;
    };
    const ensureFunction = (line) => {
        if (!current)
            current = { name: '(dump)', line, builder: new FunctionBuilder() };
        return current.builder;
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fm = FUNCTION_LINE.exec(line);
        if (fm) {
            finish(i - 1);
            current = { name: fm[1], line: i, builder: new FunctionBuilder() };
            continue;
        }
        const tm = TOP_LEVEL.exec(line);
        if (!tm)
            continue;
        // The insn runs until the first blank or column-0 line.
        let end = i;
        while (end + 1 < lines.length && lines[end + 1].length > 0 && /\s/.test(lines[end + 1][0]))
            end++;
        const builder = ensureFunction(i);
        const kind = tm[1];
        const walker = new ChunkWalker(lines.slice(i, end + 1).join('\n'), i, builder);
        const tree = tokenize(lines.slice(i, end + 1).join('\n'));
        const { uid, bb } = walker.insn(tree, kind);
        if (uid !== undefined) {
            const info = { uid, kind, line: i, endLine: end, bb };
            builder.insns.set(uid, info);
        }
        if (bb !== undefined && bb >= 0 && kind !== 'barrier') {
            const r = builder.blockLines.get(bb);
            const counts = kind !== 'note' && kind !== 'code_label' ? 1 : 0;
            if (r) {
                r.endLine = end;
                r.insnCount += counts;
            }
            else
                builder.blockLines.set(bb, { line: i, endLine: end, insnCount: counts });
        }
        i = end;
    }
    finish(lines.length - 1);
    return { kind: 'rtl', functions };
}
//# sourceMappingURL=rtlModel.js.map