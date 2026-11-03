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
exports.parseGimpleDump = parseGimpleDump;
const types_1 = require("./types");
/*
 * A GIMPLE dump, function by function:
 *
 *   ;; Function f (f, funcdef_no=0, ...)      header (absent in .gimple dumps)
 *   ...pass logging...                        log: mentions only
 *   int f (int a)                             signature: parameters
 *   {                                         body, up to the "}" in column 0
 *     int _1;                                 declarations
 *     <bb 2> [local count: 1073741824]:       blocks (or ";;   basic block 2" with -blocks)
 *     # x_1 = PHI <a_2(D)(2), _1(3)>          statements
 *     ...
 *   }
 *
 * Only the body defines anything. SSA names have exactly one def (or are a
 * default def, x_3(D)); other variables (pre-SSA dumps, address-taken locals,
 * statics and globals) get reaching definitions over the CFG like RTL
 * registers.
 */
const FUNCTION_LINE = /^;; Function (.+?) \([^\s,()]+, funcdef_no=/;
const FUNCTION_LINE_ANY = /^;; Function (.+?)(?: \(.*\))?\s*$/;
const BB_HEADER = /^\s*<bb (\d+)>(?:\s*\[([^\]]*)\])?\s*:/;
const BB_COMMENT = /^;;\s+basic block (\d+), loop depth (\d+)/;
const CFG_LINE = /^;;\s+(?:(pred|succ):)?\s+(ENTRY|EXIT|\d+)\b/;
/** "<L7>:", "<D.5666>:", "retry:", "<L2>: [LP 1]" (an EH landing pad) and raw "gimple_label <<L0>>". */
const LABEL_DEF = /^\s*(?:<([^<>\s]+)>|([A-Za-z_][\w.$]*))\s*:;?(?:\s*\[LP (-?\d+)\])?\s*$|^\s*gimple_label <<?([^<>\s]+)>?>\s*$/;
/** -lineno's "[t.c:9:3] " in front of a statement. */
const LINENO = /\[[^\]\s]*:\d+:\d+(?: discrim \d+)?\]/g;
/**
 * Identifiers as GIMPLE prints them: D.5711, ivtmp.19_6, g.0_1, s$b, .MEM_5,
 * D#2 (a debug temporary), a#0_6 (a parameter pack element) and <retval>.
 */
const IDENT = /<retval>|\.MEM(?:_\d+)?|D#\d+|(?<![\w$#])[A-Za-z_$][\w$]*(?:#\d+[\w$]*)?(?:\.\d+[\w$]*)*/g;
const NAME = String.raw `[A-Za-z_$][\w$]*(?:#\d+[\w$]*)?(?:\.\d+[\w$]*)*`;
const SSA_VERSIONED = /^(.+)_(\d+)$/;
/** Calls that never return: no fallthrough edge after them. */
const NORETURN = new Set([
    'abort', 'exit', '_exit', '_Exit', 'quick_exit', 'longjmp', 'siglongjmp', '_longjmp', 'pthread_exit',
    '__builtin_abort', '__builtin_exit', '__builtin__exit', '__builtin_unreachable', '__builtin_unreachable_trap',
    '__builtin_trap', '__builtin_longjmp', '__builtin_eh_return', '__builtin_unwind_resume', '_Unwind_Resume',
    '__cxa_throw', '__cxa_rethrow', '__cxa_bad_cast', '__cxa_bad_typeid', '__cxa_throw_bad_array_new_length',
    '__cxa_pure_virtual', '__cxa_call_terminate', 'std::terminate', '__stack_chk_fail', '__chk_fail',
    '__assert_fail', '__assert_rtn', '__assert_perror_fail', '__builtin___chk_fail', '.ABNORMAL_DISPATCHER',
]);
/** libstdc++'s std::__throw_length_error and friends never return either. */
const isNoreturn = (fn) => NORETURN.has(fn) || /^(?:std::)?__throw_\w+$/.test(fn);
/** Calls that return twice: the abnormal dispatcher jumps back to them. */
const RETURNS_TWICE = /^(?:_{0,2}setjmp|_?sigsetjmp|__sigsetjmp|savectx|vfork|getcontext|qsetjmp|__builtin_setjmp_receiver)$/;
/** Blank out what is not code (strings, comments, line numbers, probabilities, EH markers), keeping columns. */
function mask(line) {
    const blank = (m) => ' '.repeat(m.length);
    return line
        .replace(/"(?:[^"\\]|\\.)*"/g, blank)
        .replace(/'(?:\\[0-7]{1,3}|\\x[0-9a-fA-F]+|\\.|[^'\\])'/g, blank)
        .replace(/\/\/.*$/, blank)
        .replace(LINENO, blank)
        .replace(/<<< error >>>/g, blank)
        .replace(/(?<==)\{v\}/g, blank)
        .replace(/\[(?:LP -?\d+|-?\d+(?:\.\d+)?%|INV|(?:local )?count: [^\]]*|tail call|must tail call|return slot optimization|ret: [^\]]*|[if]range|likely|unlikely)\]/g, blank);
}
/** Where the brackets of the MEM[...] / MEM <type> [...] around column s start, or -1. */
function memAround(t, s) {
    let depth = 0;
    for (let k = s - 1; k >= 0; k--) {
        const ch = t[k];
        if (ch === ']' || ch === ')')
            depth++;
        else if (ch === '(') {
            if (depth)
                depth--;
        }
        else if (ch === '[') {
            if (depth) {
                depth--;
                continue;
            }
            const m = /\bMEM(?:\s*<[^<>]*(?:<[^<>]*>[^<>]*)*>)?\s*$/.exec(t.slice(0, k));
            return m ? m.index : -1;
        }
    }
    return -1;
}
/** The function called by a statement ("_1 = foo (x);", "std::f<int> (a);"), or undefined. */
function calleeOf(t) {
    const m = /(?:^|[=\s])((?:\.|::)?[A-Za-z_$~][\w$.:~]*(?:<[^()]*>)?(?:::[\w$.~]+(?:<[^()]*>)?)*|operator\S+)\s\(/.exec(t);
    if (!m || /^(?:if|switch|return|goto|sizeof|__asm__)$/.test(m[1]))
        return undefined;
    // Template arguments and -uid suffixes do not change which function it is.
    let name = m[1];
    for (let prev = ''; prev !== name;) {
        prev = name;
        name = name.replace(/<[^<>]*>/g, '');
    }
    return name.replace(/D\.\d+$/, '');
}
function parseGimpleDump(lines) {
    const sections = [];
    lines.forEach((l, i) => {
        if (!l.startsWith(';; Function '))
            return;
        const m = FUNCTION_LINE.exec(l) ?? FUNCTION_LINE_ANY.exec(l);
        if (!m)
            return;
        // Some passes print the header twice (profile_estimate: the loop analysis, then the body).
        if (sections.length && sections[sections.length - 1].name === m[1])
            return;
        sections.push({ name: m[1], line: i, end: lines.length - 1 });
    });
    sections.forEach((s, k) => { if (k + 1 < sections.length)
        s.end = sections[k + 1].line - 1; });
    const bodies = findBodies(lines);
    const functions = [];
    if (sections.length) {
        for (const s of sections) {
            const own = bodies.filter(b => b.open > s.line && b.close <= s.end);
            // .original holds GENERIC (i++, nested scopes, case labels), not GIMPLE: no dataflow there.
            const generic = /^;; enabled by -tree-original/.test(lines[s.line + 1] ?? '');
            // The last body is the function after the pass; earlier ones are printed mid-pass.
            functions.push(safeParse(lines, s.name, s.line, s.end, own[own.length - 1], generic));
        }
    }
    else {
        // .gimple style: no headers, one body per function. A dump without bodies (cgraph, ipa) has no functions.
        bodies.forEach((b, k) => {
            const start = b.signature ?? b.open;
            const end = k + 1 < bodies.length ? (bodies[k + 1].signature ?? bodies[k + 1].open) - 1 : lines.length - 1;
            functions.push(safeParse(lines, (b.signature !== undefined && nameFromSignature(lines[start])) || '(function)', start, end, b));
        });
    }
    return { kind: 'gimple', functions };
}
/** A function the parser cannot make sense of keeps its outline entry and nothing else. */
function safeParse(lines, name, line, endLine, body, generic = false) {
    try {
        return parseFunction(lines, name, line, endLine, body, generic);
    }
    catch {
        return { name, line, endLine, blocks: [], vars: new Map(), insns: new Map(), uidRefs: [], stmtKind: 'stmt' };
    }
}
function findBodies(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        // "[t.c:7:1] {" with -lineno; "gimple_bind <" ... ">" with -raw before the CFG.
        const raw = /^gimple_bind <\s*$/.test(lines[i]);
        if (!raw && !/^(?:\[[^\]\s]*:\d+:\d+\] )?\{\s*$/.test(lines[i]))
            continue;
        const end = raw ? /^>\s*$/ : /^\}\s*$/;
        let close = i + 1;
        while (close < lines.length && !end.test(lines[close]))
            close++;
        if (close >= lines.length)
            break;
        // The signature precedes the body, possibly followed by -eh's region tree.
        let sig = i - 1;
        while (sig >= 0 && (!lines[sig].trim() || /^Eh tree:\s*$|^\s+\d+ (?:try|cleanup|must_not_throw|allowed_exceptions)\b/.test(lines[sig])))
            sig--;
        out.push({ open: i, close, signature: sig >= 0 && /\)\s*$/.test(lines[sig]) && !lines[sig].startsWith(';;') ? sig : undefined });
        i = close;
    }
    return out;
}
/** Where the parameter list of a signature opens: the first " (" outside template arguments. */
function paramsOpen(sig) {
    let depth = 0;
    for (let k = 0; k < sig.length; k++) {
        const ch = sig[k];
        if (ch === '<' && !/operator\s*<*$/.test(sig.slice(0, k)))
            depth++;
        else if (ch === '>' && depth && !/operator\s*$/.test(sig.slice(0, k)))
            depth--;
        else if (ch === '(' && depth === 0 && sig[k - 1] === ' ')
            return k - 1;
    }
    return -1;
}
/** "int ns::K::get (const struct K * const this)" -> "ns::K::get"; templates and operators keep their spaces. */
function nameFromSignature(sig) {
    const open = paramsOpen(sig);
    if (open < 0)
        return undefined;
    const head = sig.slice(0, open);
    const op = /(?:^|[\s*&])((?:[^\s*&]*::)?operator\b.*)$/.exec(head);
    if (op)
        return op[1];
    let depth = 0, k = head.length - 1;
    for (; k >= 0; k--) {
        const ch = head[k];
        if (ch === '>')
            depth++;
        else if (ch === '<')
            depth--;
        else if (depth === 0 && /[\s*&]/.test(ch))
            break;
    }
    return head.slice(k + 1) || undefined;
}
/** Parameter names and their columns: "foo (int a, struct S * b)", "sum (int & a#0, int & a#1)". */
function parameters(sig) {
    const open = paramsOpen(sig);
    if (open < 0)
        return [];
    const out = [];
    let depth = 0, from = open + 2;
    const flush = (to) => {
        const part = sig.slice(from, to);
        const m = new RegExp(`(${NAME})\\s*$`).exec(part);
        if (m && part.trim() !== 'void' && part.trim() !== '...') {
            const type = part.slice(0, m.index).trim();
            if (type)
                out.push({ name: m[1], start: from + m.index, type });
        }
        from = to + 1;
    };
    for (let k = open + 2; k < sig.length; k++) {
        const ch = sig[k];
        if (ch === '(' || ch === '<' || ch === '[')
            depth++;
        else if (ch === ')' || ch === '>' || ch === ']') {
            if (depth === 0) {
                flush(k);
                break;
            }
            depth--;
        }
        else if (ch === ',' && depth === 0)
            flush(k);
    }
    return out;
}
/** Index of the assignment '=' at bracket depth 0 (not ==, <=, >=, !=), or -1. */
function assignIndex(t) {
    let depth = 0;
    for (let k = 0; k < t.length; k++) {
        const ch = t[k];
        if (ch === '(' || ch === '[' || ch === '{')
            depth++;
        else if (ch === ')' || ch === ']' || ch === '}')
            depth--;
        else if (ch === '=' && depth === 0 && t[k + 1] !== '=' && !(('<>!='.includes(t[k - 1] ?? '')) && !/(?:<<|>>)$/.test(t.slice(0, k))))
            return k;
    }
    return -1;
}
/** Splits "a, b(3), c" at depth-0 commas into [start, end) ranges. */
function splitArgs(t, from, to) {
    const out = [];
    let depth = 0, s = from;
    for (let k = from; k < to; k++) {
        const ch = t[k];
        if ('([<{'.includes(ch))
            depth++;
        else if (')]>}'.includes(ch))
            depth--;
        else if (ch === ',' && depth === 0) {
            out.push([s, k]);
            s = k + 1;
        }
    }
    out.push([s, to]);
    return out;
}
// Types may carry -uid suffixes ("intD.1") and bit-field widths ("<unnamed-unsigned:5>").
const TYPE = String.raw `[A-Za-z_<][\w\s*&:<>,()$.\-]*?[\s*&>]`;
const DECL = new RegExp(String.raw `^\s+(?!return\b|goto\b|if\b|else\b|switch\b|resx\b|case\b|try\b|finally\b|catch\b)(${TYPE})(${NAME})((?:\s*\[[^\]]*\])*)\s*;\s*$`);
const ALIAS_DECL = new RegExp(String.raw `^\s+${TYPE}(${NAME}_\d+)\(D\) = (${NAME});\s*$`);
const STATIC_DECL = new RegExp(String.raw `^\s+((?:static|extern|register|thread_local|__thread)\s+${TYPE})(${NAME})((?:\s*\[[^\]]*\])*)\s*(?:=.*)?;\s*$`);
const RAW_OPERATOR = /^\s*((?:[\w$:~]*::)?operator\s*(?:\(\)|\[\]|new(?:\s*\[\])?|delete(?:\s*\[\])?|,|[^\s,\w(]+))\s*,/;
function parseFunction(lines, name, line, endLine, body, generic = false) {
    const raws = [];
    const stmts = [];
    const bbRefs = [];
    const labelRefs = [];
    const labels = new Map();
    const labelBlock = new Map();
    const lpLabel = new Map(); // landing pad number -> label
    const declared = new Map();
    const params = new Map();
    const annotations = new Map(); // stmt id -> "# PT = ..." lines before it
    const defaultNotes = new Map(); // -alias: "# PT = ..." before "int * a_12(D) = a;"
    const blocks = [];
    const dumpEdges = [];
    let pendingNotes = [];
    let nextStmt = 0;
    // Lexical scopes, for pre-SSA dumps where a nested block redeclares a name.
    const scopes = [new Map()];
    const declCount = new Map();
    const declare = (n, l) => {
        const count = (declCount.get(n) ?? 0) + 1;
        declCount.set(n, count);
        const key = count === 1 ? n : `${n}@${l + 1}`;
        scopes[scopes.length - 1].set(n, key);
        return key;
    };
    const resolve = (n) => {
        for (let k = scopes.length - 1; k >= 0; k--) {
            const key = scopes[k].get(n);
            if (key)
                return key;
        }
        return n;
    };
    const sigLine = body?.signature;
    // -eh prints the region tree before the body: "2 try land:{1,<L2>} catch:{lab:<L3>;}". eh_dispatch 2
    // goes to the catch labels of region 2.
    const catchLabels = new Map();
    if (body)
        for (let l = sigLine ?? body.open; l < body.open; l++) {
            const m = /^\s*(\d+) try land:\{[^}]*\} catch:\{(.*)\}/.exec(lines[l]);
            if (m)
                catchLabels.set(Number(m[1]), [...m[2].matchAll(/<([^<>\s]+)>/g)].map(x => x[1]));
        }
    if (sigLine !== undefined)
        for (const p of parameters(lines[sigLine])) {
            const key = declare(p.name, sigLine);
            params.set(key, { type: p.type, line: sigLine, start: p.start });
            raws.push({ name: p.name, key, line: sigLine, start: p.start, role: 'decl' });
        }
    // ---- the body --------------------------------------------------------------
    let block;
    let declZone = false;
    let cfgMode;
    const startBlock = (index, l) => {
        if (block?.index === index)
            return;
        if (block)
            block.endLine = l - 1;
        block = { index, line: l, endLine: l, insnCount: 0, preds: [], succs: [] };
        blocks.push(block);
    };
    const addStmt = (s) => {
        const id = nextStmt++;
        stmts.push({ ...s, id, bb: block?.index });
        // Annotations ("# PT = ...") describe the result of the next real statement.
        if (!s.debug && !s.label) {
            const notes = pendingNotes.filter(n => !/^#\s*(?:USE|CLB)\b/.test(n));
            if (notes.length)
                annotations.set(id, notes);
            pendingNotes = [];
        }
        return id;
    };
    const scanNames = (text, l, from, to, role, stmt, extra = {}) => {
        IDENT.lastIndex = from;
        let m;
        while ((m = IDENT.exec(text)) !== null && m.index < to) {
            const tok = m[0];
            const s = m.index, e = s + tok.length;
            const before = text.slice(Math.max(0, s - 2), s);
            // Fields (s.a, p->D.27784) and type tags (struct S) are not variables; neither are the D and ab of (D), (ab).
            if (!tok.startsWith('.') && !tok.startsWith('<') && (before.endsWith('.') || before === '->'))
                continue;
            if (/\b(?:struct|union|enum|class)\s+$/.test(text.slice(Math.max(0, s - 7), s)))
                continue;
            if ((tok === 'D' || tok === 'ab') && text[s - 1] === '(' && text[e] === ')' && /[\w)]/.test(text[s - 2] ?? ''))
                continue;
            const suffix = /^(\(D\))?(\(ab\))?/.exec(text.slice(e));
            const after = e + suffix[0].length;
            // &x, &s.a, &a[2] take x's address; &p_1->f, &MEM[...] arithmetic and debug binds do not.
            const amp = /&\s*$/.test(text.slice(Math.max(0, s - 2), s));
            const memAt = memAround(text, s);
            const inMem = amp && memAt >= 0 && !/&\s*$/.test(text.slice(0, memAt));
            const address = role !== 'debug' && amp && !/^\s*->/.test(text.slice(after));
            // &x alone does not read x (p = &x); the access happens through MEM[(int *)&x] or in a callee.
            let r = address && !inMem && role === 'use' ? 'note' : role;
            // GENERIC i++, --i.
            if (role === 'use' && (/^\s*(?:\+\+|--)/.test(text.slice(after)) || /(?:\+\+|--)\s*$/.test(text.slice(Math.max(0, s - 3), s))))
                r = 'both';
            raws.push({ name: tok, key: resolve(tok), line: l, start: s, role: r, stmt, defaultDef: !!suffix[1], abnormal: !!suffix[2],
                address, inMem, called: /^\s\(/.test(text.slice(after)), ...extra });
        }
    };
    let asmStmt; // inside a raw "gimple_asm <" ... ">"
    let asmDepth = 0;
    const ehStack = []; // lines of the pre-EH try statements we are in (flow blocks only)
    const tryBodies = [];
    let sawTry = false;
    if (body) {
        declZone = true;
        let typeBody = 0; // inside "union { ... } u;" in a declaration (GENERIC)
        let typeHead = false; // the previous line opens a type: "typedef union", "} unionunion"
        let pendingTry; // a "try" whose "{" comes next
        let pendingHandler = false; // a "finally" / "catch" whose "{" comes next
        const braceKinds = [];
        const nextLine = (from) => {
            for (let k = from; k < body.close; k++)
                if (lines[k].trim())
                    return mask(lines[k]).trim();
            return '';
        };
        for (let l = body.open + 1; l < body.close; l++) {
            const rawLine = lines[l];
            if (rawLine.startsWith(';;')) {
                const bc = BB_COMMENT.exec(rawLine);
                if (bc) {
                    startBlock(Number(bc[1]), l);
                    block.headerLine = l;
                    block.loopDepth = Number(bc[2]);
                    const s = rawLine.indexOf(bc[1], rawLine.indexOf('block'));
                    bbRefs.push({ bb: Number(bc[1]), line: l, start: s, end: s + bc[1].length });
                    cfgMode = undefined;
                    continue;
                }
                const cm = CFG_LINE.exec(rawLine);
                if (cm && (cm[1] || cfgMode) && block) {
                    if (cm[1])
                        cfgMode = cm[1];
                    const other = cm[2] === 'ENTRY' ? types_1.ENTRY_BLOCK : cm[2] === 'EXIT' ? types_1.EXIT_BLOCK : Number(cm[2]);
                    if (/^\d+$/.test(cm[2])) {
                        const s = cm.index + cm[0].length - cm[2].length;
                        bbRefs.push({ bb: other, line: l, start: s, end: s + cm[2].length });
                    }
                    dumpEdges.push(cfgMode === 'succ' ? [block.index, other] : [other, block.index]);
                }
                continue;
            }
            cfgMode = undefined;
            const t = mask(rawLine);
            const trimmed = t.trim();
            if (!trimmed) {
                if (block || stmts.length)
                    declZone = false;
                continue;
            }
            // Raw asm spreads over lines: STRING < template >, OUTPUT: "=r" x_3, INPUT: "r" y_2, CLOBBER: "memory".
            if (asmStmt !== undefined) {
                if (trimmed === '>') {
                    if (--asmDepth === 0)
                        asmStmt = undefined;
                    continue;
                }
                if (trimmed.endsWith('<')) {
                    asmDepth++;
                    continue;
                }
                if (asmDepth > 1)
                    continue;
                const op = /^(\s*)(OUTPUT|INPUT):/.exec(t);
                if (op) {
                    const from = op[0].length;
                    const before = raws.length;
                    scanNames(t, l, from, t.length, op[2] === 'OUTPUT' ? 'def' : 'use', asmStmt);
                    if (op[2] === 'OUTPUT' && /"[^"]*\+/.test(rawLine))
                        for (const r of raws.slice(before)) {
                            r.role = 'both';
                            r.partial = true;
                        }
                }
                continue;
            }
            if (trimmed === 'gimple_asm <') {
                asmStmt = addStmt({ line: l, text: trimmed, kind: 'stmt' });
                asmDepth = 1;
                declZone = false;
                continue;
            }
            const bh = BB_HEADER.exec(t);
            if (bh) {
                startBlock(Number(bh[1]), l);
                if (bh[2])
                    block.count = bh[2].replace(/^(local )?count:\s*/, '');
                const s = t.indexOf(bh[1], t.indexOf('<bb'));
                bbRefs.push({ bb: Number(bh[1]), line: l, start: s, end: s + bh[1].length });
                declZone = false;
                continue;
            }
            if (typeBody) {
                typeBody += (trimmed.match(/\{/g) ?? []).length - (trimmed.match(/\}/g) ?? []).length;
                const named = typeBody === 0 && /^\}\s*([A-Za-z_$][\w$]*)\s*;$/.exec(trimmed);
                if (named) {
                    const s = t.lastIndexOf(named[1]);
                    const key = declare(named[1], l);
                    if (!declared.has(key))
                        declared.set(key, { type: 'struct/union', line: l, start: s, display: named[1] });
                    raws.push({ name: named[1], key, line: l, start: s, role: 'decl' });
                }
                typeHead = typeBody === 0 && !trimmed.endsWith(';');
                continue;
            }
            if (typeHead && trimmed === '{') {
                typeBody = 1;
                typeHead = false;
                continue;
            }
            typeHead = /^(?:typedef\s+)?(?:struct|union|enum)\b[^;{}=()]*$/.test(trimmed);
            if (typeHead)
                continue;
            // Scopes: "{" ... "}" (raw: "gimple_bind <" ... ">"; other raw constructs nest with "<" ... ">" too).
            if (trimmed === '{' || trimmed === 'gimple_bind <' || /^(?:EVAL|CLEANUP|gimple_try\b.*,|gimple_catch\b.*|gimple_eh_\w+\b.*)\s*<?$/.test(trimmed) && /[<,]$/.test(trimmed)) {
                const kind = trimmed === '{' && pendingTry !== undefined ? 'try'
                    : trimmed === '{' && pendingHandler ? 'handler'
                        : trimmed === '{' || trimmed === 'gimple_bind <' ? 'scope' : 'other';
                braceKinds.push(kind);
                if (kind === 'try') {
                    ehStack.push(pendingTry);
                    pendingTry = undefined;
                }
                pendingHandler = false;
                if (/^gimple_try\b/.test(trimmed))
                    sawTry = true;
                scopes.push(new Map());
                declZone = kind === 'scope';
                continue;
            }
            if (trimmed === '}' || trimmed === '>') {
                // The try statement ends with its last handler.
                if (braceKinds.pop() === 'handler' && !/^(?:catch\b|eh_filter\b|eh_must_not_throw\b|eh_else\b|finally\b)/.test(nextLine(l + 1)))
                    ehStack.pop();
                if (scopes.length > 1)
                    scopes.pop();
                continue;
            }
            // Pre-EH (.gimple, .lower): try { } finally { } / catch { }.
            if (/^(?:try|gimple_try\b)/.test(trimmed) && !/[<,]$/.test(trimmed)) {
                addStmt({ line: l, text: trimmed, kind: 'control', eh: 'try' });
                pendingTry = l;
                declZone = false;
                continue;
            }
            if (/^(?:finally|catch\b.*|eh_filter\b.*|eh_must_not_throw\b.*|eh_else)$/.test(trimmed)) {
                const id = addStmt({ line: l, text: trimmed, kind: 'control', eh: 'handler' });
                const open = ehStack[ehStack.length - 1];
                if (open !== undefined)
                    tryBodies.push({ from: open, to: l, handler: id });
                pendingHandler = true;
                scanNames(t, l, 0, t.length, 'use', id);
                declZone = false;
                continue;
            }
            const unlined = rawLine.replace(LINENO, m => ' '.repeat(m.length));
            const ld = LABEL_DEF.exec(unlined);
            if (/^\s*(?:default|case\b[^:]*):;?\s*$/.test(t)) {
                // GENERIC switch labels.
                scanNames(t, l, 0, t.length, 'use', undefined);
                continue;
            }
            if (ld && !/^\s*(?:default|case\b)/.test(unlined)) {
                const label = ld[1] ?? ld[2] ?? ld[4];
                const s = unlined.indexOf(label, unlined.length - unlined.trimStart().length);
                labels.set(label, l);
                if (block)
                    labelBlock.set(label, block.index);
                if (ld[3] && Number(ld[3]) > 0)
                    lpLabel.set(Number(ld[3]), label);
                labelRefs.push({ name: label, line: l, start: s, end: s + label.length, decl: true });
                addStmt({ line: l, text: trimmed, kind: 'control', label: true });
                declZone = false;
                continue;
            }
            if (declZone) {
                if (/^#\s*(?:PT|RANGE|USE|CLB|ALIGN|ptr-info)\b/.test(trimmed)) {
                    pendingNotes.push(lines[l].trim());
                    continue;
                }
                const ad = ALIAS_DECL.exec(t);
                if (ad) {
                    // -alias: "int v_8(D) = v;" spells out a default def.
                    const s = t.indexOf(ad[1] + '(D)');
                    raws.push({ name: ad[1], key: ad[1], line: l, start: s, role: 'def', defaultDef: true });
                    if (pendingNotes.length)
                        defaultNotes.set(ad[1], pendingNotes);
                    pendingNotes = [];
                    const p = t.lastIndexOf(ad[2]);
                    raws.push({ name: ad[2], key: resolve(ad[2]), line: l, start: p, role: 'note' });
                    continue;
                }
                // "static int count = 0;": a variable that outlives the call.
                const sd = STATIC_DECL.exec(t);
                if (sd) {
                    const s = sd.index + sd[0].indexOf(sd[2], sd[1].length);
                    const key = declare(sd[2], l);
                    const isStatic = /^\s*static\b/.test(sd[1]);
                    declared.set(key, { type: (sd[1] + sd[3]).replace(/^\s*(?:static|extern|register)\s+/, '').replace(/\s+/g, ' ').trim(),
                        line: l, start: s, storage: isStatic ? 'static' : undefined, display: sd[2] });
                    raws.push({ name: sd[2], key, line: l, start: s, role: 'decl' });
                    const eq = t.indexOf('=', s + sd[2].length);
                    if (eq >= 0)
                        scanNames(t, l, eq + 1, t.length, 'use', undefined);
                    continue;
                }
                const dm = DECL.exec(t);
                if (dm && !t.includes('=')) {
                    const s = dm.index + dm[0].indexOf(dm[2], dm[1].length);
                    const key = declare(dm[2], l);
                    if (!declared.has(key))
                        declared.set(key, { type: (dm[1] + dm[3]).replace(/\s+/g, ' ').trim(), line: l, start: s, display: dm[2] });
                    raws.push({ name: dm[2], key, line: l, start: s, role: 'decl' });
                    continue;
                }
                // -lineno prints label declarations as "void retry = <<< error >>>;".
                if (/^\s*void\s+[\w$.]+\s*=\s*;\s*$/.test(t))
                    continue;
                declZone = false;
            }
            statement(t, l);
        }
        if (block)
            block.endLine = body.close - 1;
    }
    function statement(t, l) {
        const first = raws.length; // this statement's names start here
        const lead = t.length - t.trimStart().length;
        const trimmed = t.trim();
        // Annotations describe the next def: "# PT = nonlocal null", "# RANGE [irange] int [0, 9]".
        if (/^#\s*(?:PT|RANGE|USE|CLB|ALIGN|ptr-info)\b/.test(trimmed)) {
            pendingNotes.push(lines[l].trim());
            return;
        }
        if (/^#\s*DEBUG\b/.test(trimmed)) {
            const id = addStmt({ line: l, text: trimmed, kind: 'stmt', debug: true });
            const dm = /^(\s*#\s*DEBUG\s+)(D#\d+|[^\s]+)\s+s?=>/.exec(t);
            if (dm) {
                // "# DEBUG D#2 => _5" defines a debug temp; "# DEBUG x => x_3" says where source variable x lives.
                const lhsStart = dm[1].length;
                if (dm[2].startsWith('D#'))
                    raws.push({ name: dm[2], key: dm[2], line: l, start: lhsStart, role: 'def', stmt: id });
                else
                    scanNames(t, l, lhsStart, lhsStart + dm[2].length, 'note', id);
                scanNames(t, l, dm[0].length, t.length, 'debug', id);
            }
            return;
        }
        const phi = /^(\s*#\s*)([^\s=]+)\s*=\s*PHI\s*<(.*)>\s*$/.exec(t) ??
            /^(\s*#\s*gimple_phi\s*<\s*)([^\s,]+)\s*,(.*)>\s*$/.exec(t);
        if (phi) {
            const virtual = /^\.MEM_\d+/.exec(phi[2]);
            const id = addStmt({ line: l, text: trimmed, kind: 'phi', memDef: virtual?.[0], memPhi: !!virtual });
            const s = phi[1].length;
            scanNames(t, l, s, s + phi[2].length, 'def', id, { phi: true });
            const argsFrom = t.indexOf(phi[3], s + phi[2].length);
            for (const [a, b] of splitArgs(t, argsFrom, argsFrom + phi[3].length)) {
                const arg = t.slice(a, b);
                const bb = /\((\d+)\)\s*$/.exec(arg);
                if (bb) {
                    const p = a + bb.index + 1;
                    bbRefs.push({ bb: Number(bb[1]), line: l, start: p, end: p + bb[1].length });
                }
                scanNames(t, l, a, b, 'use', id, { phi: true });
            }
            return;
        }
        const vdef = /^(\s*#\s*)(\.MEM_\d+)(?:\(ab\))?\s*=\s*VDEF\s*<\s*(\.MEM_\d+)?/.exec(t);
        if (vdef) {
            const id = addStmt({ line: l, text: trimmed, kind: 'stmt', debug: true, memDef: vdef[2], memUse: vdef[3] });
            scanNames(t, l, vdef[1].length, vdef[1].length + vdef[2].length, 'def', id, { phi: true });
            scanNames(t, l, t.indexOf('VDEF') + 4, t.length, 'use', id);
            return;
        }
        const vuse = /^#\s*VUSE\s*<\s*(\.MEM_\d+)?/.exec(trimmed);
        if (vuse) {
            const id = addStmt({ line: l, text: trimmed, kind: 'stmt', debug: true, memUse: vuse[1] });
            scanNames(t, l, lead, t.length, 'use', id);
            return;
        }
        if (trimmed.startsWith('#'))
            return;
        const control = /^(?:if\s*\(|else\b|goto\b|switch\s*\(|return\b|resx\b|eh_dispatch\b|gimple_(?:cond|switch|return|goto|label|resx|eh_dispatch)\b)/.test(trimmed);
        const lp = /\[LP (\d+)\]/.exec(lines[l]);
        const rawCall = /^gimple_call\s*<\s*/.exec(trimmed);
        const rawCallee = rawCall ? (RAW_OPERATOR.exec(trimmed.slice(rawCall[0].length))?.[1] ?? /^[^,>]+/.exec(trimmed.slice(rawCall[0].length))?.[0]) : undefined;
        const id = addStmt({ line: l, text: trimmed, kind: control ? 'control' : 'stmt', lp: lp ? Number(lp[1]) : undefined,
            call: control ? undefined : rawCallee?.trim().replace(/D\.\d+$/, '') ?? calleeOf(t.slice(assignIndex(t) + 1)) });
        // Labels jumped to: "goto <bb 3>;", "goto <L7>;", "case 0: <L0>", "goto retry;".
        for (const m of t.matchAll(/<bb (\d+)>/g)) {
            const p = m.index + 4;
            bbRefs.push({ bb: Number(m[1]), line: l, start: p, end: p + m[1].length });
        }
        for (const m of t.matchAll(/<((?:L|D\.)\d+)>/g))
            labelRefs.push({ name: m[1], line: l, start: m.index + 1, end: m.index + 1 + m[1].length });
        const gotoName = /\bgoto ([A-Za-z_][\w.$]*);/.exec(t);
        if (gotoName)
            labelRefs.push({ name: gotoName[1], line: l, start: gotoName.index + 5, end: gotoName.index + 5 + gotoName[1].length });
        if (control) {
            scanNames(t, l, lead, t.length, 'use', id);
            return;
        }
        // Raw dumps: gimple_assign <code, lhs, rhs...>, gimple_call <fn, lhs, args...>.
        const raw = /^(\s*gimple_(assign|call)\s*<)(.*)>\s*$/.exec(t);
        if (raw) {
            let from = raw[1].length;
            const parts = [];
            if (raw[2] === 'call') {
                // The callee may be an operator with commas or angle brackets in its name.
                const callee = RAW_OPERATOR.exec(t.slice(from));
                if (callee) {
                    parts.push([from, from + callee[0].length - 1]);
                    from += callee[0].length;
                }
            }
            parts.push(...splitArgs(t, from, raw[1].length + raw[3].length));
            parts.forEach(([a, b], k) => {
                if (k === 0)
                    return; // the tree code, or the callee
                if (k === 1) {
                    lhsNames(t, l, a, b, id, raw[2] === 'call');
                    return;
                }
                const before = raws.length;
                scanNames(t, l, a, b, 'use', id);
                const operand = t.slice(a, b).trim();
                for (const r of raws.slice(before))
                    if (r.start === a + t.slice(a, b).indexOf(operand))
                        r.whole = true;
            });
            if (raw[2] === 'call')
                markAddressArgsWritten(first);
            return;
        }
        if (/\b__asm__\b/.test(t)) {
            asm(lines[l], t, l, id);
            return;
        }
        const eq = assignIndex(t);
        const isCall = stmts[stmts.length - 1].call !== undefined;
        if (eq < 0) {
            // A call without a result, or another expression statement. &x passed to a call may be written.
            scanNames(t, l, lead, t.length, 'use', id, {});
            if (isCall)
                markAddressArgsWritten(first);
            return;
        }
        // GENERIC "x += 1", "x <<= 2": read and written.
        const compound = /(?:[-+*/%&|^]|<<|>>)$/.exec(t.slice(lead, eq).trimEnd());
        const lhsText = t.slice(lead, eq - (compound ? compound[0].length : 0)).trimEnd();
        // ".original": "int s = 0;" declares and defines.
        const declInit = new RegExp(`^(${TYPE})(${NAME})$`).exec(lhsText);
        if (generic && declInit && /\s/.test(lhsText) && !/^(?:MEM|REALPART_EXPR|IMAGPART_EXPR|BIT_FIELD_REF|VIEW_CONVERT_EXPR)\b/.test(lhsText)) {
            const s = lead + lhsText.length - declInit[2].length;
            const key = resolve(declInit[2]) === declInit[2] && !declared.has(declInit[2]) ? declare(declInit[2], l) : resolve(declInit[2]);
            if (!declared.has(key))
                declared.set(key, { type: declInit[1].trim(), line: l, start: s, display: declInit[2] });
            raws.push({ name: declInit[2], key, line: l, start: s, role: 'def', stmt: id });
        }
        else {
            const before = raws.length;
            lhsNames(t, l, lead, lead + lhsText.length, id, false);
            if (compound)
                for (const r of raws.slice(before))
                    if (r.role === 'def')
                        r.role = 'both';
        }
        const before = raws.length;
        scanNames(t, l, eq + 1, t.length, 'use', id);
        // "= g;", "= g.a;", "= garr[2];": the first name is a variable, whatever else it is.
        const rhs = t.slice(eq + 1).replace(/;\s*$/, '');
        const operand = new RegExp(`^\\s*(${NAME}|<retval>)\\s*(?:$|[.[])`).exec(rhs);
        if (operand)
            for (const r of raws.slice(before))
                if (r.start === eq + 1 + rhs.indexOf(operand[1]))
                    r.whole = true;
        if (isCall)
            markAddressArgsWritten(first);
    }
    /**
     * The left-hand side: a whole name is a def. A store into part of an
     * object (s.a, a[i], MEM[(int *)&s + 4B], REALPART_EXPR <z>) writes it
     * partially; other names there (indices, pointers in *p_1 or p_1->f) are read.
     */
    function lhsNames(t, l, from, to, id, callLhs) {
        const lhs = t.slice(from, to).trim();
        if (callLhs && lhs === 'NULL')
            return;
        const whole = new RegExp(`^(${NAME}|\\.MEM_\\d+|<retval>)$`).exec(lhs);
        const s = from + t.slice(from, to).indexOf(lhs);
        if (whole) {
            raws.push({ name: whole[1], key: resolve(whole[1]), line: l, start: s, role: 'def', stmt: id, whole: true });
            return;
        }
        const wrapper = /^(?:REALPART_EXPR|IMAGPART_EXPR|BIT_FIELD_REF|VIEW_CONVERT_EXPR)\b/.test(lhs);
        const objectFirst = !wrapper && /^[A-Za-z_$<]/.test(lhs) && !/^MEM\b/.test(lhs);
        const before = raws.length;
        scanNames(t, l, from, to, 'use', id);
        raws.slice(before).forEach((r, k) => {
            const after = t.slice(r.start + r.name.length).trimStart();
            const base = k === 0 && objectFirst && r.start === s && /^[.[]/.test(after);
            if (r.inMem || (k === 0 && wrapper) || base) {
                r.role = 'both';
                r.partial = true;
                if (base || (k === 0 && wrapper))
                    r.whole = true;
            }
        });
    }
    /** "__asm__ ("..." : "=r" x_2 : "r" y_3 : "memory");" outputs are defs ("+" ones read too). */
    function asm(original, t, l, id) {
        const open = t.indexOf('(', t.indexOf('__asm__'));
        const sections = [];
        let depth = 0, s = open + 1;
        for (let k = open + 1; k < t.length; k++) {
            const ch = t[k];
            if (ch === '(')
                depth++;
            else if (ch === ')') {
                if (depth === 0) {
                    sections.push([s, k]);
                    break;
                }
                depth--;
            }
            else if (ch === ':' && depth === 0) {
                sections.push([s, k]);
                s = k + 1;
            }
        }
        sections.forEach(([a, b], k) => {
            if (k !== 1) {
                if (k > 1)
                    scanNames(t, l, a, b, 'use', id);
                return;
            }
            for (const [x, y] of splitArgs(t, a, b)) {
                const readToo = /"[^"]*\+/.test(original.slice(x, y));
                const before = raws.length;
                scanNames(t, l, x, y, 'def', id);
                for (const r of raws.slice(before))
                    if (readToo) {
                        r.role = 'both';
                        r.partial = true;
                    }
            }
        });
    }
    /** foo (&x): the callee may read and write x. */
    function markAddressArgsWritten(first) {
        for (const r of raws.slice(first))
            if (r.address && !r.inMem && r.role === 'note') {
                r.role = 'both';
                r.partial = true;
            }
    }
    // ---- SSA names versus variables ---------------------------------------------
    // -uid prints declarations as xD.5684 but SSA names as x_1: find the variable an SSA base names.
    const byPlainName = new Map();
    for (const n of [...params.keys(), ...declared.keys()]) {
        const m = /^(.+)D\.\d+$/.exec(n);
        if (m && !byPlainName.has(m[1]))
            byPlainName.set(m[1], n);
    }
    const baseVar = (base) => declared.has(base) || params.has(base) ? base : byPlainName.get(base);
    const isSsaForm = raws.some(r => /^_\d+$|^\.MEM_\d+$/.test(r.name) || r.defaultDef || r.phi);
    // _5, .MEM_7 and versions of compiler temporaries (g.0_2, ivtmp.19_6) can only be SSA names; SSA dumps
    // declare the latter like variables.
    const alwaysSsa = (n) => /^_\d+$|^\.MEM_\d+$|\.\d+[\w$]*_\d+$/.test(n);
    const certain = new Set();
    for (const r of raws) {
        if (alwaysSsa(r.name) || r.defaultDef || r.abnormal || (r.phi && SSA_VERSIONED.test(r.name)))
            certain.add(r.name);
    }
    const versionOwner = new Map();
    const claim = (n) => {
        const v = SSA_VERSIONED.exec(n)?.[2];
        if (v === undefined)
            return true;
        const owner = versionOwner.get(v);
        if (owner && owner !== n)
            return false;
        versionOwner.set(v, n);
        return true;
    };
    const ssa = new Set();
    for (const n of certain)
        if ((alwaysSsa(n) || !declared.has(n)) && claim(n))
            ssa.add(n);
    const fullDefs = new Map();
    const inMemory = new Set(); // written in part or address taken
    for (const r of raws) {
        if (r.role === 'def' && !r.partial)
            fullDefs.set(r.name, (fullDefs.get(r.name) ?? 0) + 1);
        if (r.partial || r.address)
            inMemory.add(r.name);
    }
    const seen = new Set();
    for (const r of raws) {
        const n = r.name;
        if (seen.has(n) || ssa.has(n))
            continue;
        seen.add(n);
        const vm = SSA_VERSIONED.exec(n);
        if (!vm || params.has(n) || (declCount.get(n) ?? 0) > 1)
            continue;
        const knownBase = baseVar(vm[1]) !== undefined || /\.\d+$/.test(vm[1]);
        const defs = fullDefs.get(n) ?? 0;
        const memory = inMemory.has(n);
        // SSA dumps declare SSA names whose variable is only a name (pretmp_35, prephitmp_36). A declared
        // x_1 is still a user variable when x is a variable too, or when it is written twice or through memory.
        const ok = declared.has(n)
            ? isSsaForm && baseVar(vm[1]) === undefined && defs === 1 && !memory && !declared.get(n).storage
            : (knownBase && defs <= 1) || (isSsaForm && defs === 1 && !memory);
        if (ok && claim(n))
            ssa.add(n);
    }
    const variables = new Set([...declared.keys(), ...params.keys()].filter(n => !ssa.has(n)));
    for (const r of raws)
        if (r.name.startsWith('D#') || r.name === '<retval>')
            variables.add(r.key);
    // Names declared outside the function (globals, file-scope statics): used as whole operands, stored
    // into or address-taken, and never called. Types in casts and called functions never qualify.
    const globals = new Set();
    {
        const called = new Set(raws.filter(r => r.called).map(r => r.name));
        const evidence = new Set();
        for (const r of raws)
            if (r.whole || r.address || r.partial)
                evidence.add(r.name);
        for (const n of evidence)
            if (!called.has(n) && !ssa.has(n) && !variables.has(n) && !declCount.has(n) && !labels.has(n) && !/^(?:NULL|MEM|CLOBBER|D)$/.test(n) &&
                !n.startsWith('.') && !n.startsWith('D#') && !/^_\d+$/.test(n))
                globals.add(n);
        for (const n of globals)
            variables.add(n);
    }
    // ---- statements -> insns, blocks and edges -----------------------------------
    const insns = new Map();
    stmts.forEach((s, seq) => insns.set(s.id, { uid: s.id, kind: s.kind === 'phi' ? 'phi' : 'stmt', line: s.line, endLine: s.line, bb: s.bb, seq }));
    // Labels whose address is taken (&&l in C): the targets of computed gotos.
    const addressLabels = new Set(raws.filter(r => r.address && labels.has(r.name)).map(r => r.name));
    for (const r of raws)
        if (r.address && labels.has(r.name))
            labelRefs.push({ name: r.name, line: r.line, start: r.start, end: r.start + r.name.length });
    const cfg = { labelBlock, lpLabel, catchLabels, addressLabels };
    let flowBlocks;
    let cfgSource;
    let cfgUncertain;
    if (blocks.length) {
        const byIndex = new Map(blocks.map(b => [b.index, b]));
        for (const s of stmts)
            if (s.bb !== undefined && s.kind !== 'control' && !s.debug)
                byIndex.get(s.bb).insnCount++;
        if (dumpEdges.length) {
            cfgSource = 'dump';
            for (const [from, to] of dumpEdges) {
                const a = byIndex.get(from), b = byIndex.get(to);
                if (a && !a.succs.includes(to))
                    a.succs.push(to);
                if (b && !b.preds.includes(from))
                    b.preds.push(from);
            }
        }
        else {
            cfgSource = 'computed';
            cfgUncertain = computeCfg(blocks, stmts, cfg) || undefined;
        }
    }
    else if (stmts.length && !generic) {
        // No <bb N>: blocks between labels and after jumps, for dataflow only.
        flowBlocks = [];
        let current;
        let ended = true;
        const blockOfStmt = new Map();
        for (const s of stmts) {
            const leader = !!s.label || s.eh !== undefined;
            if (!current || ended || leader) {
                current = { index: 1000 + flowBlocks.length, line: s.line, endLine: s.line, insnCount: 0, preds: [], succs: [] };
                flowBlocks.push(current);
            }
            current.endLine = s.line;
            if (s.kind !== 'control' && !s.debug)
                current.insnCount++;
            insns.get(s.id).flowBb = current.index;
            blockOfStmt.set(s.id, current.index);
            if (s.label)
                for (const [n, ln] of labels)
                    if (ln === s.line)
                        labelBlock.set(n, current.index);
            ended = /^(?:goto\b|return\b|resx\b|eh_dispatch\b|switch\s*\(|gimple_(?:goto|return|switch|resx|eh_dispatch)\b)/.test(s.text) ||
                /^(?:if\s*\()/.test(s.text) && /\bgoto\b/.test(s.text) || /^gimple_cond\b.*<(?:L|D\.)\d+>/.test(s.text) ||
                (s.call !== undefined && isNoreturn(s.call));
        }
        // Anything in a try body may throw into its handlers.
        const extra = [];
        for (const t of tryBodies) {
            const to = blockOfStmt.get(t.handler);
            for (const s of stmts)
                if (s.line > t.from && s.line < t.to && s.kind !== 'control')
                    extra.push([blockOfStmt.get(s.id), to]);
        }
        const uncertain = computeCfg(flowBlocks, stmts.map(s => ({ ...s, bb: insns.get(s.id).flowBb })), cfg, extra);
        // A returns-twice call (setjmp) or a try (EH edges are approximate) makes the derived edges uncertain.
        cfgUncertain = uncertain || tryBodies.length > 0 || sawTry || stmts.some(s => s.call && RETURNS_TWICE.test(s.call)) || undefined;
    }
    // ---- variables ----------------------------------------------------------------
    const vars = new Map();
    const varOf = (key) => {
        let v = vars.get(key);
        if (!v) {
            v = { key, occurrences: [], modes: new Set(), flags: new Set() };
            if (ssa.has(key)) {
                v.ssa = true;
                if (key.startsWith('.MEM'))
                    v.virtual = true;
                const vm = SSA_VERSIONED.exec(key);
                if (vm && !/^_\d+$/.test(key) && !v.virtual)
                    v.base = baseVar(vm[1]) ?? vm[1];
                v.type = declared.get(key)?.type ?? (v.base ? (declared.get(v.base) ?? params.get(v.base))?.type : undefined);
            }
            else {
                const d = declared.get(key);
                v.type = (d ?? params.get(key))?.type;
                v.declLine = (d ?? params.get(key))?.line;
                if (d?.storage)
                    v.storage = d.storage;
                if (globals.has(key))
                    v.storage = 'global';
                if (d && d.display !== key)
                    v.display = d.display;
            }
            vars.set(key, v);
        }
        return v;
    };
    for (const r of raws) {
        const key = ssa.has(r.name) ? r.name : r.key;
        if (!ssa.has(key) && !variables.has(key))
            continue;
        const v = varOf(key);
        if (r.defaultDef)
            v.defaultDef = true;
        if (r.abnormal)
            v.abnormal = true;
        if (r.address)
            v.addressTaken = true;
        let role = r.role;
        // A store into part of an SSA name cannot happen; a "&x_1" is impossible too. Keep the read.
        if (v.ssa && r.partial)
            role = 'use';
        v.occurrences.push({ line: r.line, start: r.start, endLine: r.line, end: r.start + r.name.length, role,
            uid: r.stmt, partial: r.partial && !v.ssa ? true : undefined });
    }
    for (const [n, notes] of defaultNotes)
        if (vars.get(n)?.ssa)
            (vars.get(n).annotations ??= []).push(...notes);
    if (annotations.size)
        for (const v of vars.values())
            for (const o of v.occurrences)
                if (v.ssa && o.role === 'def' && o.uid !== undefined && annotations.has(o.uid))
                    (v.annotations ??= []).push(...annotations.get(o.uid));
    // ---- mentions outside the body (pass logging) ----------------------------------
    for (let l = line; l <= endLine; l++) {
        if (body && l >= (sigLine ?? body.open) && l <= body.close)
            continue;
        const text = lines[l];
        if (!text)
            continue;
        for (const m of text.matchAll(/(?:<bb |\bbasic block |\bBB |\bbb ?)(\d+)\b/g)) {
            const p = m.index + m[0].length - m[1].length;
            bbRefs.push({ bb: Number(m[1]), line: l, start: p, end: p + m[1].length });
        }
        // "Threading edge 3->5", "exit 4->5", "Removing edge (2, 3)".
        if (/\b(?:edges?|exit|Edge)\b/.test(text))
            for (const m of text.matchAll(/\b(\d+)\s*->\s*(\d+)\b|\((\d+), (\d+)\)/g)) {
                const nums = [m[1] ?? m[3], m[2] ?? m[4]];
                let at = m.index;
                for (const n of nums) {
                    const p = text.indexOf(n, at);
                    bbRefs.push({ bb: Number(n), line: l, start: p, end: p + n.length });
                    at = p + n.length;
                }
            }
        if (text.startsWith(';;')) {
            const succ = /^;; (\d+) succs \{([\d ]*)\}/.exec(text);
            if (succ)
                for (const m of text.matchAll(/\d+/g))
                    bbRefs.push({ bb: Number(m[0]), line: l, start: m.index, end: m.index + m[0].length });
            continue;
        }
        const t = mask(text);
        IDENT.lastIndex = 0;
        let m;
        while ((m = IDENT.exec(t)) !== null) {
            const tok = m[0];
            // Short variable names (i, s, n) are too common in log prose to link.
            if (!ssa.has(tok) && !(variables.has(tok) && !params.has(tok) && tok.length > 2))
                continue;
            const before = t.slice(Math.max(0, m.index - 2), m.index);
            if (!tok.startsWith('.') && (before.endsWith('.') || before === '->'))
                continue;
            varOf(tok).occurrences.push({ line: l, start: m.index, endLine: l, end: m.index + tok.length, role: 'log' });
        }
    }
    for (const v of vars.values())
        v.occurrences.sort((x, y) => x.line - y.line || x.start - y.start);
    const blockTargets = new Map();
    for (const b of blocks)
        blockTargets.set(b.index, b.line);
    return {
        name, line, endLine, blocks, vars, insns, uidRefs: [], bbRefs, cfgSource, cfgUncertain, blockTargets,
        // A goto to something that is not a label is a computed goto: no label reference.
        labelRefs: labelRefs.filter(r => labels.has(r.name)), labels, flowBlocks, signatureLine: sigLine, stmtKind: 'stmt',
    };
}
/**
 * Edges from the statements: gotos, switch labels, returns and EH landing
 * pads, plus a fallthrough into the next block unless the block ends in a
 * jump, a return or a call that never returns. GIMPLE dumps print a goto for
 * every edge that does not fall into the next block, so this is exact except
 * for EH edges without [LP n] markers and calls to noreturn functions GCC
 * knows from their declarations. PHI arguments name every incoming edge and
 * override the rest; virtual operands (-vops) catch the noreturn calls.
 * Returns whether some edges could not be derived.
 */
function computeCfg(blocks, stmts, cfg, extra = []) {
    const { labelBlock, lpLabel, catchLabels, addressLabels } = cfg;
    const byBb = new Map();
    for (const s of stmts)
        if (s.bb !== undefined) {
            if (!byBb.has(s.bb))
                byBb.set(s.bb, []);
            byBb.get(s.bb).push(s);
        }
    const index = new Set(blocks.map(b => b.index));
    const succs = new Map(blocks.map(b => [b.index, new Set()]));
    let uncertain = false;
    // setjmp & co: .ABNORMAL_DISPATCHER jumps back to the blocks that start with a returns-twice call, and every
    // call that may longjmp goes to the dispatcher.
    const firstReal = (bb) => byBb.get(bb)?.find(s => s.kind !== 'phi' && !s.debug && !s.label);
    const dispatchers = blocks.filter(b => byBb.get(b.index)?.some(s => s.call === '.ABNORMAL_DISPATCHER')).map(b => b.index);
    const receivers = blocks.filter(b => { const s = firstReal(b.index); return s?.call !== undefined && RETURNS_TWICE.test(s.call); })
        .map(b => b.index);
    const callFalls = new Map(); // block ending in a call -> the block it falls into
    blocks.forEach((b, k) => {
        const list = byBb.get(b.index) ?? [];
        const out = succs.get(b.index);
        const target = (text) => {
            for (const m of text.matchAll(/<bb (\d+)>/g))
                if (index.has(Number(m[1])))
                    out.add(Number(m[1]));
            for (const m of text.matchAll(/<((?:L|D\.)\d+)>/g)) {
                const t = labelBlock.get(m[1]);
                if (t !== undefined)
                    out.add(t);
            }
            const g = /\bgoto ([A-Za-z_][\w.$]*);/.exec(text);
            if (g) {
                const t = labelBlock.get(g[1]);
                if (t !== undefined)
                    out.add(t);
                else {
                    // goto gotovar.1_6: any label whose address is taken; without one, any named label.
                    const targets = addressLabels.size ? [...addressLabels] : [...labelBlock.keys()].filter(n => !/^(?:L|D\.)\d+$/.test(n));
                    if (!addressLabels.size)
                        uncertain = true;
                    for (const n of targets)
                        out.add(labelBlock.get(n));
                }
            }
        };
        let falls = true;
        for (const s of list) {
            if (/\bgoto\b|^switch\s*\(|^gimple_(?:goto|cond|switch)\b/.test(s.text))
                target(s.text);
            if (s.lp) {
                const t = labelBlock.get(lpLabel.get(s.lp) ?? '');
                if (t !== undefined)
                    out.add(t);
            }
            const dispatch = /^(?:gimple_)?eh_dispatch\s*<?\s*(\d+)/.exec(s.text);
            for (const label of dispatch ? catchLabels.get(Number(dispatch[1])) ?? [] : []) {
                const t = labelBlock.get(label);
                if (t !== undefined)
                    out.add(t);
            }
        }
        const last = [...list].reverse().find(s => s.kind !== 'phi' && !s.debug && !s.label);
        // A call that may longjmp ends its block; a "goto" after it only spells out the normal edge.
        const lastCall = [...list].reverse().find(s => s.kind !== 'phi' && !s.debug && !s.label && !/^(?:goto|else)\b/.test(s.text));
        if (lastCall?.call !== undefined && lastCall.call !== '.ABNORMAL_DISPATCHER' && dispatchers.length &&
            !lastCall.call.startsWith('__builtin_') && !lastCall.call.startsWith('.'))
            for (const d of dispatchers)
                out.add(d);
        if (last) {
            const t = last.text;
            if (/^return\b|^gimple_return\b/.test(t)) {
                out.add(types_1.EXIT_BLOCK);
                falls = false;
            }
            else if (/^goto\b|^switch\s*\(|^resx\b|^gimple_(?:goto|switch|resx)\b/.test(t))
                falls = false;
            else if (/^gimple_cond\b.*<(?:L|D\.)\d+>/.test(t))
                falls = false;
            else if (/^(?:if\s*\(|else\b|gimple_cond\b)/.test(t) || (/\bgoto\b/.test(t) && /\belse\b/.test(t)))
                falls = !/\bgoto\b/.test(t);
            else if (last.call !== undefined) {
                if (last.call === '.ABNORMAL_DISPATCHER')
                    for (const r of receivers)
                        out.add(r);
                if (isNoreturn(last.call))
                    falls = false;
            }
            // "if (x) goto <bb 3>; else goto <bb 4>;" over several lines: the block ends in the else goto.
            if (falls && list.some(s => /^else\b/.test(s.text)) && /^goto\b/.test(t))
                falls = false;
        }
        if (falls) {
            const next = k + 1 < blocks.length ? blocks[k + 1].index : types_1.EXIT_BLOCK;
            out.add(next);
            if (last?.call !== undefined && next !== types_1.EXIT_BLOCK)
                callFalls.set(b.index, next);
        }
    });
    for (const [from, to] of extra)
        succs.get(from)?.add(to);
    // PHI arguments list exactly the incoming edges.
    const phiPreds = new Map();
    for (const s of stmts) {
        if (s.kind !== 'phi' || s.bb === undefined || phiPreds.has(s.bb))
            continue;
        const args = new Set();
        for (const m of s.text.matchAll(/\((\d+)\)\s*(?=[,>]|$)/g))
            args.add(Number(m[1]));
        phiPreds.set(s.bb, args);
    }
    const incoming = new Map();
    for (const [from, set] of succs)
        for (const to of set) {
            if (!incoming.has(to))
                incoming.set(to, []);
            incoming.get(to).push(from);
        }
    for (const [bb, preds] of phiPreds) {
        for (const from of incoming.get(bb) ?? [])
            if (!preds.has(from))
                succs.get(from).delete(bb);
        for (const p of preds)
            succs.get(p)?.add(bb);
    }
    // With virtual operands, a call that falls into a block must hand it its memory state: if the block (with no
    // virtual PHI) starts from another .MEM version, the call does not return (a user noreturn function).
    for (const [from, to] of callFalls) {
        const list = byBb.get(to) ?? [];
        if (phiPreds.has(to) && list.some(s => s.memPhi))
            continue;
        const out = [...(byBb.get(from) ?? [])].reverse().find(s => s.memDef)?.memDef;
        const into = list.find(s => s.memUse || s.memDef)?.memUse;
        if (out && into && out !== into)
            succs.get(from).delete(to);
    }
    for (const b of blocks) {
        b.succs = [...succs.get(b.index)];
        b.preds = [];
    }
    if (blocks.length)
        blocks[0].preds.push(types_1.ENTRY_BLOCK);
    const byIndex = new Map(blocks.map(b => [b.index, b]));
    for (const [from, set] of succs)
        for (const to of set)
            byIndex.get(to)?.preds.push(from);
    return uncertain || blocks.slice(1).some(b => b.preds.length === 0);
}
//# sourceMappingURL=gimpleModel.js.map