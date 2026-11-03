import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseRtlDump } from '../src/dumpModel/rtlModel';
import { parseGimpleDump } from '../src/dumpModel/gimpleModel';
import { FlowQuery, FunctionInfo, Occurrence, PositionIndex, findVarAt } from '../src/dumpModel/types';
import { computeLiveness } from '../src/dumpModel/liveness';

const ROOT = path.join(__dirname, '..', '..');

const RTL = `;; Function f (f, funcdef_no=0)

(note 7 0 52 2 [bb 2] NOTE_INSN_BASIC_BLOCK)
(insn 52 7 2 2 (set (reg/v/f:DI 108 [ a ])
        (reg:DI 0 x0 [ a ])) "t.c":399:1 -1
     (expr_list:REG_DEAD (reg:DI 0 x0 [ a ])
        (nil)))
(insn 19 18 20 4 (set (reg:SI 112)
        (mem:SI (post_inc:DI (reg:DI 102)) [1 *a_1+0 S4 A32])) "t.c":3:1 65 {*movsi}
     (expr_list:REG_INC (reg:DI 102)
        (nil)))
(insn 20 19 23 4 (parallel [
            (set (mem/c:SI (plus:DI (reg/f:DI 29 x29)
                        (const_int 28)) [1 i+0 S4 A32])
                (reg:SI 112))
            (clobber (reg:CC 66 cc))
        ]) "t.c":4:1 -1
     (nil))
(jump_insn 24 23 25 4 (set (pc)
        (if_then_else (ne (reg:CC 66 cc)
                (const_int 0 [0]))
            (label_ref 22)
            (pc))) "t.c":5:1 -1
     (nil))
(code_label 22 20 21 5 3 (nil) [1 uses])
(call_insn/i 8 3 52 5 (parallel [
            (set (reg:SI 0 x0)
                (call (mem:DI (symbol_ref:DI ("foo") [flags 0x41]) [0 foo S8 A8])
                    (const_int 0 [0])))
            (clobber (reg:DI 30 x30))
        ]) "t.c":6:1 -1
     (nil))

;; Function g (g, funcdef_no=1)

(note 3 0 4 2 [bb 2] NOTE_INSN_BASIC_BLOCK)
(insn 4 3 0 2 (set (reg:SI 100)
        (reg:SI 101)) "t.c":9:1 -1
     (nil))
`;

const GIMPLE = `;; Function foo (foo, funcdef_no=0, decl_uid=1, cgraph_uid=1)

foo (int a, int b)
{
  int _1;
  int _2;
  int _4;

  <bb 2> :
  _1 = a_3(D) + b_5(D);
  _2 = _1 * 2;
  foo_9 (_2);
  printf ("x_7 and _8\\n");
  if (_2 > 0)
    goto <bb 3>; [50.00%]
  else
    goto <bb 4>; [50.00%]

  <bb 3> :
  # _4 = PHI <_2(2), _1(4)>
  return _4;

}
`;

describe('parseRtlDump', () => {
    const m = parseRtlDump(RTL.split('\n'));
    const f = m.functions[0];

    it('finds functions and their ranges', () => {
        assert.deepStrictEqual(m.functions.map(x => x.name), ['f', 'g']);
        assert.ok(f.endLine < m.functions[1].line);
    });

    it('builds blocks from the bb field', () => {
        assert.deepStrictEqual(f.blocks.map(b => b.index), [2, 4, 5]);
        assert.strictEqual(f.blocks[0].insnCount, 1);
    });

    it('treats set destinations as defs and sources as uses', () => {
        const r108 = f.vars.get('r108')!;
        assert.deepStrictEqual(r108.occurrences.map(o => o.role), ['def']);
        const r0 = f.vars.get('r0')!;
        assert.deepStrictEqual(r0.occurrences.map(o => o.role).sort(), ['def', 'note', 'use']);
    });

    it('keeps registers inside a mem destination as uses', () => {
        const r29 = f.vars.get('r29')!;
        assert.deepStrictEqual(r29.occurrences.map(o => o.role), ['use']);
    });

    it('treats clobber as a def and post_inc as both', () => {
        assert.strictEqual(f.vars.get('r66')!.occurrences[0].role, 'def');
        assert.ok(f.vars.get('r102')!.occurrences.some(o => o.role === 'both'));
    });

    it('treats REG_DEAD / REG_INC registers as notes', () => {
        assert.ok(f.vars.get('r102')!.occurrences.some(o => o.role === 'note'));
    });

    it('records modes, flags, hard names and debug names', () => {
        const r108 = f.vars.get('r108')!;
        assert.deepStrictEqual([...r108.modes], ['DI']);
        assert.deepStrictEqual([...r108.flags].sort(), ['f', 'v']);
        assert.strictEqual(r108.userName, 'a');
        assert.strictEqual(f.vars.get('r0')!.hardName, 'x0');
        assert.strictEqual(f.vars.get('r29')!.hardName, 'x29');
    });

    it('does not mix registers across functions', () => {
        assert.ok(!m.functions[1].vars.has('r108'));
        assert.ok(m.functions[1].vars.has('r100'));
    });

    it('collects insn uids, including flagged insns', () => {
        assert.ok(f.insns.has(52) && f.insns.has(8));
        assert.strictEqual(f.insns.get(8)!.kind, 'call_insn');
    });

    it('collects prev/next and label_ref uid references with positions', () => {
        const refs = f.uidRefs.filter(r => r.uid === 22);
        assert.ok(refs.length >= 1);
        const r = refs[0];
        assert.strictEqual(RTL.split('\n')[r.line].slice(r.start, r.end), '22');
    });

    it('locates the register under the cursor', () => {
        const lines = RTL.split('\n');
        const li = lines.findIndex(l => l.includes('(reg/v/f:DI 108'));
        const col = lines[li].indexOf('108');
        const hit = findVarAt(m, li, col)!;
        assert.strictEqual(hit.variable.key, 'r108');
        assert.strictEqual(hit.occurrence.role, 'def');
    });

    it('is fast on a real combine dump and finds the register defs', () => {
        const file = path.join(ROOT, 'testcase', 'testcase.c.286r.combine');
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        const t = Date.now();
        const real = parseRtlDump(lines);
        assert.ok(Date.now() - t < 500, 'parse took too long');
        assert.ok(real.functions.length >= 5);
        const sum = real.functions.find(x => x.name === 'sum_array')!;
        assert.ok(sum.blocks.length >= 4);
        assert.ok([...sum.vars.values()].some(v => v.occurrences.some(o => o.role === 'def')));
    });

    it('ignores pass logging that looks like RTL', () => {
        const file = path.join(ROOT, 'testcase', 'testcase.c.286r.combine');
        const real = parseRtlDump(fs.readFileSync(file, 'utf8').split('\n'));
        for (const fn of real.functions)
            for (const i of fn.insns.values())
                assert.ok(['insn', 'jump_insn', 'call_insn', 'debug_insn', 'note', 'code_label', 'barrier', 'jump_table_data'].includes(i.kind));
    });
});

const SEMANTICS = `;; Function int ns::f<int>(int) (_ZN2ns1fIiEEii, funcdef_no=3, decl_uid=1, cgraph_uid=1, symbol_order=3)

(note 3 0 4 2 [bb 2] NOTE_INSN_BASIC_BLOCK)
(insn 4 3 5 2 (set (strict_low_part (subreg:QI (reg:SI 110) 0))
        (reg:QI 111)) "t.c":1:1 -1
     (nil))
(insn 5 4 6 2 (set (subreg:SI (reg:DI 112) 0)
        (reg:SI 113)) "t.c":1:1 -1
     (nil))
(insn 6 5 7 2 (set (subreg:DI (reg:TI 114) 8)
        (reg:DI 115)) "t.c":1:1 -1
     (nil))
(insn/f 7 6 8 2 (set (reg/f:DI 31 sp)
        (plus:DI (reg/f:DI 31 sp)
            (const_int -16 [0xfffffffffffffff0]))) "t.c":1:1 -1
     (expr_list:REG_CFA_ADJUST_CFA (set (reg/f:DI 31 sp)
            (plus:DI (reg/f:DI 31 sp)
                (const_int -16 [0xfffffffffffffff0])))
        (nil)))
(insn 8 7 9 2 (cond_exec (ne (reg:CC 66 cc)
            (const_int 0 [0]))
        (set (reg:SI 116)
            (reg:SI 117))) "t.c":1:1 -1
     (nil))
(debug_insn 9 8 10 2 (var_location:SI i (reg:SI 116)) "t.c":2:1 -1
     (nil))
(insn 10 9 11 2 (set (zero_extract:DI (reg:DI 118)
            (const_int 8 [0x8])
            (const_int 0 [0]))
        (reg:DI 119)) "t.c":3:1 -1
     (insn_list:REG_DEP_TRUE 8 (nil)))
`;

/** A loop without ;; succ lines: bb 3 jumps back to itself, then falls into bb 4. */
const LOOP = `;; Function loop (loop, funcdef_no=0, decl_uid=1, cgraph_uid=1, symbol_order=0)

(note 1 0 3 NOTE_INSN_DELETED)
(note 3 1 5 2 [bb 2] NOTE_INSN_BASIC_BLOCK)
(insn 5 3 9 2 (set (reg:SI 100)
        (const_int 0 [0])) "t.c":1:1 -1
     (nil))
(code_label 9 5 10 3 2 (nil) [1 uses])
(note 10 9 11 3 [bb 3] NOTE_INSN_BASIC_BLOCK)
(insn 11 10 12 3 (set (reg:SI 100)
        (plus:SI (reg:SI 100)
            (const_int 1 [0x1]))) "t.c":2:1 -1
     (nil))
(insn 12 11 13 3 (set (reg:CC 66 cc)
        (compare:CC (reg:SI 100)
            (const_int 10 [0xa]))) "t.c":2:1 -1
     (nil))
(jump_insn 13 12 14 3 (set (pc)
        (if_then_else (ne (reg:CC 66 cc)
                (const_int 0 [0]))
            (label_ref 9)
            (pc))) "t.c":2:1 -1
     (nil)
 -> 9)
(note 14 13 15 4 [bb 4] NOTE_INSN_BASIC_BLOCK)
(insn 15 14 16 4 (set (reg:SI 0 x0)
        (reg:SI 100)) "t.c":3:1 -1
     (nil))
(jump_insn 16 15 17 4 (simple_return) "t.c":3:1 -1
     (nil)
 -> simple_return)
(barrier 17 16 0)
`;

const occAt = (fn: FunctionInfo, key: string, uid: number, role?: string): Occurrence =>
    fn.vars.get(key)!.occurrences.find(o => o.uid === uid && (!role || o.role === role))!;

describe('RTL def/use semantics', () => {
    const m = parseRtlDump(SEMANTICS.split('\n'));
    const f = m.functions[0];
    const roles = (key: string) => f.vars.get(key)!.occurrences.map(o => o.role + (o.partial ? '/partial' : ''));

    it('keeps C++ function names with spaces', () => {
        assert.strictEqual(f.name, 'int ns::f<int>(int)');
    });

    it('treats strict_low_part and zero_extract stores as partial', () => {
        assert.deepStrictEqual(roles('r110'), ['both/partial']);
        assert.deepStrictEqual(roles('r118'), ['both/partial']);
    });

    it('treats a word-sized subreg store as a full def and a multi-word one as partial', () => {
        assert.deepStrictEqual(roles('r112'), ['def']);
        assert.deepStrictEqual(roles('r114'), ['both/partial']);
    });

    it('does not turn a set inside a REG note into a def', () => {
        assert.deepStrictEqual(roles('r31'), ['def', 'use', 'note', 'note']);
    });

    it('treats a cond_exec store as partial', () => {
        assert.strictEqual(occAt(f, 'r116', 8).partial, true);
        assert.strictEqual(occAt(f, 'r66', 8).role, 'use');
    });

    it('marks debug_insn operands as debug, not uses', () => {
        assert.strictEqual(occAt(f, 'r116', 9).role, 'debug');
    });

    it('turns insn_list uids into insn references', () => {
        const lines = SEMANTICS.split('\n');
        const r = f.uidRefs.find(x => x.uid === 8 && lines[x.line].includes('REG_DEP_TRUE'));
        assert.ok(r);
        assert.strictEqual(lines[r!.line].slice(r!.start, r!.end), '8');
    });
});

describe('RTL control flow and reaching definitions', () => {
    const lines = LOOP.split('\n');
    const f = parseRtlDump(lines).functions[0];

    it('derives the CFG from jumps and barriers when there are no ;; succ lines', () => {
        assert.strictEqual(f.cfgSource, 'computed');
        const succ = (bb: number) => f.blocks.find(b => b.index === bb)!.succs.slice().sort();
        assert.deepStrictEqual(succ(2), [3]);
        assert.deepStrictEqual(succ(3), [3, 4]);
        assert.deepStrictEqual(succ(4), [1]);
    });

    it('finds the defs that reach a use around a loop', () => {
        const q = new FlowQuery(f, f.vars.get('r100')!);
        const use = occAt(f, 'r100', 11, 'use');
        assert.deepStrictEqual(q.reachingDefs(use).occurrences.map(o => o.uid).sort(), [11, 5]);
        const exitUse = occAt(f, 'r100', 15, 'use');
        assert.deepStrictEqual(q.reachingDefs(exitUse).occurrences.map(o => o.uid), [11]);
    });

    it('finds the uses a def reaches', () => {
        const q = new FlowQuery(f, f.vars.get('r100')!);
        const uses = q.reachedUses(occAt(f, 'r100', 5, 'def')).occurrences.map(o => o.uid);
        assert.deepStrictEqual(uses, [11]);
        const loopUses = q.reachedUses(occAt(f, 'r100', 11, 'def')).occurrences.map(o => o.uid).sort();
        assert.deepStrictEqual(loopUses, [11, 12, 15]);
    });

    it('records basic block numbers and jumps to the NOTE_INSN_BASIC_BLOCK', () => {
        const li = lines.findIndex(l => l.startsWith('(insn 11 '));
        const ref = f.bbRefs!.find(r => r.line === li)!;
        assert.strictEqual(lines[li].slice(ref.start, ref.end), '3');
        assert.strictEqual(lines[f.blockTargets!.get(3)!], '(note 10 9 11 3 [bb 3] NOTE_INSN_BASIC_BLOCK)');
        const noteRef = f.bbRefs!.find(r => r.line === f.blockTargets!.get(3) && lines[r.line][r.start - 1] === ' ' && lines[r.line][r.end] === ']');
        assert.ok(noteRef, 'the [bb 3] number is a reference too');
    });

    it('records the uid after "->" on a jump', () => {
        const li = lines.findIndex(l => l.trim() === '-> 9)');
        assert.ok(f.uidRefs.some(r => r.line === li && r.uid === 9));
    });
});

describe('RTL navigation in a real combine dump', () => {
    const file = path.join(ROOT, 'testcase', 'testcase.c.286r.combine');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const f = parseRtlDump(lines).functions.find(x => x.name === 'sum_array')!;

    it('takes the CFG from ;; pred / succ lines, including continuation lines', () => {
        assert.strictEqual(f.cfgSource, 'dump');
        const b4 = f.blocks.find(b => b.index === 4)!;
        assert.deepStrictEqual(b4.succs.slice().sort(), [4, 6]);
        assert.deepStrictEqual(b4.preds.slice().sort(), [3, 4]);
        assert.strictEqual(b4.loopDepth, 0);
    });

    it('jumps from a block number to its NOTE_INSN_BASIC_BLOCK', () => {
        assert.ok(/^\(note \d+ \d+ \d+ 4 \[bb 4\] NOTE_INSN_BASIC_BLOCK\)/.test(lines[f.blockTargets!.get(4)!]));
        const header = lines.findIndex(l => l.startsWith(';; basic block 4,'));
        assert.ok(f.bbRefs!.some(r => r.line === header && r.bb === 4));
    });

    it('reaches across the loop back edge and from function entry', () => {
        const r97 = f.vars.get('r97')!;
        const q = new FlowQuery(f, r97);
        const use19 = r97.occurrences.find(o => o.uid === 19 && o.role === 'use')!;
        assert.deepStrictEqual(q.reachingDefs(use19).occurrences.map(o => o.uid).sort((a, b) => a! - b!), [5, 19]);
        const r0 = f.vars.get('r0')!;
        const use51 = r0.occurrences.find(o => o.uid === 51 && o.role === 'use')!;
        const reach = new FlowQuery(f, r0).reachingDefs(use51);
        assert.strictEqual(reach.occurrences.length, 0);
        assert.ok(reach.fromEntry);
    });

    it('links log listings and dataflow sets to insns and registers', () => {
        const trying = lines.findIndex(l => l.startsWith('Trying 3 -> 11:'));
        assert.deepStrictEqual(f.uidRefs.filter(r => r.line === trying).map(r => r.uid), [3, 11]);
        const slim = lines.findIndex((l, i) => i > trying && l.includes('11: cc:CC=cmp(r99:SI,0)'));
        const logged = (key: string) => f.vars.get(key)!.occurrences.some(o => o.line === slim && o.role === 'log');
        assert.ok(logged('r99') && logged('r66'), 'slim r99 and hard cc are register mentions');
        const lrDef = lines.findIndex(l => l.startsWith(';; lr  def') && l.includes(' 98 99 103 104'));
        assert.ok(f.vars.get('r103')!.occurrences.some(o => o.line === lrDef));
    });
});

describe('RTL navigation in a -slim dump', () => {
    const file = path.join(ROOT, 'testcase', 'testcase.c.297r.combine.slim');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const f = parseRtlDump(lines).functions.find(x => x.name === 'sum_array')!;
    const lineOf = (re: RegExp) => lines.findIndex(l => re.test(l));

    it('reads the slim insn chain, not the slim listings in pass logs', () => {
        const insn = f.insns.get(20)!;
        assert.strictEqual(insn.kind, 'insn');
        assert.strictEqual(insn.bb, 4);
        assert.ok(lines[insn.line].includes('20: r107:SI=r107:SI+r112:SI'));
        assert.strictEqual(f.insns.get(24)!.kind, 'jump_insn');
        assert.strictEqual(f.insns.get(22)!.kind, 'code_label');
        assert.strictEqual(f.insns.get(22)!.bb, 4, 'a label belongs to the block whose note follows it');
    });

    it('classifies slim defs, uses, auto-increments and notes', () => {
        const roles = (key: string, uid: number) => f.vars.get(key)!.occurrences.filter(o => o.uid === uid).map(o => o.role);
        assert.deepStrictEqual(roles('r107', 20), ['def', 'use']);
        assert.deepStrictEqual(roles('r102', 19), ['both', 'note']);
        assert.deepStrictEqual(roles('r0', 31), ['use']);
    });

    it('uses hard register names from the ;; dataflow sets', () => {
        assert.strictEqual(f.vars.get('r0')!.hardName, 'x0');
        assert.ok(f.vars.get('r66')!.occurrences.some(o => o.uid === 11 && o.role === 'def'));
    });

    it('builds blocks, the CFG and reaching definitions', () => {
        assert.strictEqual(f.cfgSource, 'dump');
        assert.ok(/^\s+18: NOTE_INSN_BASIC_BLOCK 4$/.test(lines[f.blockTargets!.get(4)!]));
        const r107 = f.vars.get('r107')!;
        const use = r107.occurrences.find(o => o.uid === 30 && o.role === 'use')!;
        assert.deepStrictEqual(new FlowQuery(f, r107).reachingDefs(use).occurrences.map(o => o.uid).sort((a, b) => a! - b!), [6, 20]);
    });

    it('links L labels and fall-through block numbers', () => {
        const jump = lineOf(/^\s+24: pc=/);
        assert.ok(f.uidRefs.some(r => r.line === jump && r.uid === 22 && !r.decl));
        const ft = lineOf(/; pc falls through to BB 6/);
        assert.ok(f.bbRefs!.some(r => r.line === ft && r.bb === 6));
    });
});

/**
 * The model checked against GCC's own dataflow: the ;; lr sets the dump prints
 * per block, and the REG_DEAD / REG_UNUSED notes on each insn.
 */
for (const name of ['testcase.c.286r.combine', 'testcase.c.297r.combine.slim']) {
    describe(`RTL model agrees with GCC's dataflow in ${name}`, () => {
        const lines = fs.readFileSync(path.join(ROOT, 'testcase', name), 'utf8').split('\n');
        const model = parseRtlDump(lines);
        const withDf = model.functions.filter(f => f.dumpDataflow?.blocks.size);

        it('has per-block dataflow sets to compare against', () => {
            assert.ok(withDf.length >= 9);
        });

        it('computes the same lr use / in / out sets for every block', () => {
            const problems: string[] = [];
            for (const f of withDf) {
                const live = computeLiveness(f);
                const hard = new Set([...f.vars.values()].filter(v => v.hardName).map(v => Number(v.key.slice(1))));
                const callBlocks = new Set([...f.insns.values()].filter(i => i.kind === 'call_insn').map(i => i.bb));
                for (const [bb, ours] of live) {
                    const gcc = f.dumpDataflow!.blocks.get(bb)!;
                    for (const [set, mine] of [['lr use', ours.use], ['lr in', ours.in], ['lr out', ours.out]] as const) {
                        const theirs = new Set(gcc.get(set) ?? []);
                        const skip = (_r: number) => false;
                        const diff = [...theirs].filter(r => !mine.has(r) && !skip(r)).map(r => '-' + r)
                            .concat([...mine].filter(r => !theirs.has(r) && !skip(r)).map(r => '+' + r));
                        if (diff.length) problems.push(`${f.name} bb${bb} ${set}: ${diff.join(' ')}`);
                    }
                }
            }
            assert.deepStrictEqual(problems, []);
        });

        it('finds every lr def, and GCC only adds defs of insns the pass deleted', () => {
            const problems: string[] = [];
            for (const f of withDf) {
                const live = computeLiveness(f);
                const callBlocks = new Set([...f.insns.values()].filter(i => i.kind === 'call_insn').map(i => i.bb));
                for (const [bb, ours] of live) {
                    const theirs = new Set(f.dumpDataflow!.blocks.get(bb)!.get('lr def') ?? []);
                    for (const r of ours.def) if (!theirs.has(r)) problems.push(`${f.name} bb${bb} extra def r${r}`);
                    for (const r of theirs) {
                        const v = f.vars.get('r' + r);
                        if (ours.def.has(r)) continue;
                        // Stale in GCC's print: the def was in an insn combine turned into NOTE_INSN_DELETED.
                        const deleted = [...f.insns.values()].some(i => i.bb === bb && i.kind === 'note' &&
                            lines[i.line].includes('NOTE_INSN_DELETED') &&
                            lines.slice(f.line, i.line).some(l => new RegExp(`^\\s*(?:insn_cost \\d+ for\\s+)?${i.uid}: \\{?(?:r${r}|${v?.hardName ?? '$^'}):`).test(l)));
                        if (!deleted) problems.push(`${f.name} bb${bb} missing def r${r}`);
                    }
                }
            }
            assert.deepStrictEqual(problems, []);
        });

        it('agrees with every REG_DEAD and REG_UNUSED note', () => {
            const problems: string[] = [];
            let checked = 0;
            for (const f of model.functions) {
                for (const v of f.vars.values()) {
                    const q = new FlowQuery(f, v);
                    const regno = Number(v.key.slice(1));
                    for (const o of v.occurrences) {
                        if (o.role !== 'note' || o.uid === undefined) continue;
                        const insn = f.insns.get(o.uid)!;
                        if (insn.bb === undefined) continue;
                        if (/REG_UNUSED/.test(lines[o.line])) {
                            checked++;
                            const d = v.occurrences.find(x => x.uid === o.uid && (x.role === 'def' || x.role === 'both'))!;
                            const reached = q.reachedUses(d).occurrences.filter(x => x.role !== 'debug');
                            if (reached.length) problems.push(`${f.name} ${v.key} REG_UNUSED at ${o.uid} reaches ${reached.map(x => x.uid)}`);
                        } else if (/REG_DEAD/.test(lines[o.line])) {
                            checked++;
                            // The next real mention in the block must not read the dead value...
                            const seq = (x: Occurrence) => f.insns.get(x.uid!)!.seq;
                            const next = v.occurrences
                                .filter(x => x.uid !== undefined && ['def', 'use', 'both'].includes(x.role) &&
                                             f.insns.get(x.uid)!.bb === insn.bb && seq(x) > insn.seq)
                                .sort((a, b) => seq(a) - seq(b))[0];
                            if (next && (next.role === 'use' || next.partial)) problems.push(`${f.name} ${v.key} read after REG_DEAD at ${o.uid}`);
                            // ...and if the block does not redefine it, GCC must not have it live out.
                            const out = f.dumpDataflow?.blocks.get(insn.bb)?.get('lr out');
                            if (!next && out?.includes(regno)) problems.push(`${f.name} ${v.key} live out after REG_DEAD at ${o.uid}`);
                            const reach = q.reachingDefs(o);
                            if (!v.hardName && !reach.occurrences.length && !reach.fromEntry) problems.push(`${f.name} ${v.key} no def reaches REG_DEAD at ${o.uid}`);
                        }
                    }
                }
            }
            assert.ok(checked > 100, `only ${checked} notes checked`);
            assert.deepStrictEqual(problems, []);
        });

        it('gives a reached use to every pseudo def GCC keeps live', () => {
            const problems: string[] = [];
            for (const f of withDf) {
                for (const v of f.vars.values()) {
                    if (v.hardName) continue;
                    const q = new FlowQuery(f, v);
                    for (const o of v.occurrences) {
                        if (o.role !== 'def' || o.uid === undefined) continue;
                        const bb = f.insns.get(o.uid)!.bb!;
                        const live = f.dumpDataflow!.blocks.get(bb)?.get('lr out')?.includes(Number(v.key.slice(1)));
                        const reached = q.reachedUses(o).occurrences.filter(x => x.role !== 'debug');
                        const unused = v.occurrences.some(x => x.uid === o.uid && x.role === 'note' && /REG_UNUSED/.test(lines[x.line]));
                        if (!reached.length && !unused) problems.push(`${f.name} ${v.key} def at ${o.uid} reaches nothing${live ? ' but is live out' : ''}`);
                    }
                }
            }
            assert.deepStrictEqual(problems, []);
        });
    });
}

describe('RTL CFG without ;; succ lines', () => {
    it('flags edges guessed in a cfglayout-mode dump (no barriers)', () => {
        const lines = fs.readFileSync(path.join(ROOT, 'testcase', 'testcase.c.286r.combine'), 'utf8').split('\n');
        const f = parseRtlDump(lines, {computeCfg: true}).functions.find(x => x.name === 'sum_array')!;
        assert.strictEqual(f.cfgSource, 'computed');
        assert.strictEqual(f.cfgUncertain, true);
        assert.strictEqual(parseRtlDump(lines).functions.find(x => x.name === 'sum_array')!.cfgUncertain, undefined);
    });

    it('trusts edges when barriers show the dump is in cfgrtl mode', () => {
        const f = parseRtlDump(LOOP.split('\n')).functions[0];
        assert.strictEqual(f.cfgUncertain, undefined);
    });

    it('follows a jump table to all its case labels', () => {
        const text = `;; Function sw (sw, funcdef_no=0, decl_uid=1, cgraph_uid=1, symbol_order=0)

(note 2 0 3 2 [bb 2] NOTE_INSN_BASIC_BLOCK)
(jump_insn 3 2 4 2 (parallel [
            (set (pc)
                (reg:DI 100))
            (use (label_ref 4))
        ]) "t.c":1:1 -1
     (nil)
 -> 4)
(code_label 4 3 5 7 "" [2 uses])
(jump_table_data 5 4 6 (addr_vec:DI [
            (label_ref:DI 7)
            (label_ref:DI 10)
        ]))
(barrier 6 5 7)
(code_label 7 6 8 3 8 (nil) [1 uses])
(note 8 7 9 3 [bb 3] NOTE_INSN_BASIC_BLOCK)
(insn 9 8 10 3 (set (reg:SI 0 x0)
        (const_int 1 [0x1])) "t.c":2:1 -1
     (nil))
(code_label 10 9 11 4 9 (nil) [1 uses])
(note 11 10 12 4 [bb 4] NOTE_INSN_BASIC_BLOCK)
(insn 12 11 0 4 (set (reg:SI 0 x0)
        (const_int 2 [0x2])) "t.c":3:1 -1
     (nil))
`;
        const f = parseRtlDump(text.split('\n')).functions[0];
        assert.strictEqual(f.insns.get(4)!.bb, undefined, 'a jump table label is outside any block; 7 is its label number');
        assert.deepStrictEqual(f.blocks.map(b => b.index), [2, 3, 4]);
        assert.deepStrictEqual(f.blocks[0].succs.slice().sort(), [3, 4]);
    });
});

describe('RTL parser robustness', () => {
    it('reads insns printed without a bb field (after free_cfg)', () => {
        const text = `;; Function late (late, funcdef_no=0, decl_uid=1, cgraph_uid=1, symbol_order=0)

(note 1 0 5 NOTE_INSN_DELETED)
(insn 5 1 6 (set (reg:SI 0 x0)
        (reg:SI 1 x1)) "t.c":1:1 65 {*movsi_aarch64}
     (nil))
(code_label 6 5 7 12 "" [0 uses])
`;
        const f = parseRtlDump(text.split('\n')).functions[0];
        assert.strictEqual(f.insns.get(5)!.bb, undefined);
        assert.deepStrictEqual(f.vars.get('r0')!.occurrences.map(o => o.role), ['def']);
        assert.deepStrictEqual(f.vars.get('r1')!.occurrences.map(o => o.role), ['use']);
        assert.strictEqual(f.insns.get(6)!.bb, undefined, '12 is the label number, not a block');
        assert.strictEqual(f.blocks.length, 0);
    });

    it('keeps one declaration per uid when an insn is printed twice', () => {
        const once = `(insn 9 8 10 2 (set (reg:SI 100)
        (reg:SI 101)) "t.c":1:1 -1
     (nil))`;
        const text = `;; Function d (d, funcdef_no=0, decl_uid=1, cgraph_uid=1, symbol_order=0)\n\n${once}\nlog line\n(note 8 0 9 2 [bb 2] NOTE_INSN_BASIC_BLOCK)\n${once}\n`;
        const f = parseRtlDump(text.split('\n')).functions[0];
        assert.strictEqual(f.uidRefs.filter(r => r.uid === 9 && r.decl).length, 1);
        assert.deepStrictEqual(f.vars.get('r100')!.occurrences.map(o => o.role), ['log', 'def']);
    });

    it('survives absurdly deep nesting and unterminated strings', () => {
        const deep = '(insn 1 0 2 2 ' + '('.repeat(20000) + 'reg:SI 100' + ')'.repeat(20000) + ' "t.c":1:1 -1 (nil))';
        const text = [';; Function x (x, funcdef_no=0, decl_uid=1, cgraph_uid=1, symbol_order=0)', '', deep,
                      '(insn 2 1 0 2 (set (reg:SI 101) (reg:SI 102)) "unterminated -1 (nil))', ''];
        const f = parseRtlDump(text).functions[0];
        assert.ok(f.insns.has(1) && f.insns.has(2));
        assert.ok(f.vars.has('r101'));
    });

    it('finds the same targets through the position index as by scanning', () => {
        const lines = RTL.split('\n');
        const m = parseRtlDump(lines);
        const idx = new PositionIndex(m);
        for (let l = 0; l < lines.length; l++)
            for (let c = 0; c <= lines[l].length; c++) {
                const a = findVarAt(m, l, c), b = idx.varAt(l, c);
                assert.strictEqual(a?.occurrence, b?.occurrence, `line ${l} col ${c}`);
            }
        const li = lines.findIndex(l => l.startsWith('(code_label 22'));
        assert.strictEqual(idx.targetAt(li, lines[li].indexOf('22'))?.kind, 'uid');
        const t = idx.targetAt(li, lines[li].indexOf(' 5 ') + 1);
        assert.ok(t?.kind === 'bb' && t.ref.bb === 5);
    });
});

/** GCC 14 aarch64 dumps of testcase/gimple/u/u.c and u.cc (one or two functions each). */
describe('RTL model against GCC 14 dataflow', () => {
    const RDIR = path.join(ROOT, 'testcase', 'rtl');
    const rload = (rel: string) => {
        const lines = fs.readFileSync(path.join(RDIR, rel), 'utf8').split('\n');
        return {lines, model: parseRtlDump(lines)};
    };
    const rfn = (rel: string, name: string) => {
        const {lines, model} = rload(rel);
        const fn = model.functions.find(f => f.name === name);
        assert.ok(fn, `${name} in ${rel}`);
        return {lines, fn: fn!};
    };
    /** Block sets GCC printed that ours differ from, hard registers included. */
    const lrDiff = (fn: FunctionInfo) => {
        const out: string[] = [];
        for (const [bb, ours] of computeLiveness(fn)) {
            const gcc = fn.dumpDataflow?.blocks.get(bb);
            for (const [set, mine] of [['lr use', ours.use], ['lr def', ours.def], ['lr in', ours.in], ['lr out', ours.out]] as const) {
                if (!gcc?.has(set)) continue;
                const theirs = new Set(gcc.get(set));
                const d = [...theirs].filter(r => !mine.has(r)).map(r => '-' + r).concat([...mine].filter(r => !theirs.has(r)).map(r => '+' + r));
                if (d.length) out.push(`bb${bb} ${set}: ${d.join(' ')}`);
            }
        }
        return out;
    };
    const edges = (fn: FunctionInfo) => fn.blocks.flatMap(b => b.succs.map(s => `${b.index}>${s}`)).sort();

    it('reads EH edges in df block summaries: ( 2 )->[3]->( 5(EH) 4 )', () => {
        const {fn} = rfn('O2/u.cc.296r.ud_dce', 'raii');
        assert.ok(fn.blocks.find(b => b.index === 3)!.succs.includes(5));
        // bb 3's sets were filed under bb 2 when the line was not recognised.
        assert.deepStrictEqual(fn.dumpDataflow!.blocks.get(2)!.get('lr def'), [66, 103]);
    });

    it('matches every lr use/def/in/out set, with EH landing pads and partial writes', () => {
        for (const [rel, name] of [['O2/u.cc.296r.ud_dce', 'raii'], ['O2/u.cc.296r.ud_dce', 'tryf'], ['O2/u.c.274r.cprop1', 'mkp']])
            assert.deepStrictEqual(lrDiff(rfn(rel, name).fn), [], `${rel} ${name}`);
    });

    it('counts a zero_extract write as a def, as GCC 14 does', () => {
        const live = computeLiveness(rfn('O2/u.c.274r.cprop1', 'mkp').fn).get(2)!;
        assert.ok(live.def.has(101) && live.use.has(101) && live.in.has(101));
    });

    it('defines the EH data registers at the top of a landing pad', () => {
        const live = computeLiveness(rfn('O2/u.cc.296r.ud_dce', 'tryf').fn);
        const pad = [...live].find(([bb]) => rfn('O2/u.cc.296r.ud_dce', 'tryf').fn.dumpDataflow!.blocks.get(bb)!.get('artificial defs')!.length)!;
        assert.ok([0, 1].every(r => pad[1].def.has(r) && !pad[1].in.has(r)));
    });

    it('reads insns that sched2 marked with a mode (insn:TI)', () => {
        const {lines, fn} = rfn('O2/u.c.349r.barriers', 'nr2');
        const ti = lines.map((l, i) => [l, i] as const).filter(([l, i]) => i >= fn.line && i <= fn.endLine && /^\((?:insn|jump_insn|call_insn)\S*:TI /.test(l));
        assert.ok(ti.length > 0);
        for (const [l] of ti) assert.ok(fn.insns.has(Number(/:TI (\d+)/.exec(l)![1])), l);
    });

    it('takes blocks from NOTE_INSN_BASIC_BLOCK after free_cfg, as in -slim', () => {
        for (const name of ['nr2', 'sj']) {
            const full = rfn('O2/u.c.349r.barriers', name).fn, slim = rfn('O2-slim/u.c.349r.barriers', name).fn;
            assert.ok(full.blocks.length > 1, name);
            assert.deepStrictEqual(edges(full), edges(slim), name);
        }
    });

    it('does not take the EH region of NOTE_INSN_EH_REGION_BEG for a block', () => {
        const full = rfn('O0/u.cc.352r.eh_ranges', 'raii').fn, slim = rfn('O0-slim/u.cc.352r.eh_ranges', 'raii').fn;
        assert.ok(!full.blocks.some(b => b.index < 2));
        assert.deepStrictEqual(edges(full), edges(slim));
    });

    it('keeps only the last print of a chain printed twice (bbro)', () => {
        const full = rfn('O3/u.c.336r.bbro', 'va').fn, slim = rfn('O3-slim/u.c.336r.bbro', 'va').fn;
        assert.deepStrictEqual([...full.insns.keys()].sort((a, b) => a - b), [...slim.insns.keys()].sort((a, b) => a - b));
        assert.deepStrictEqual(edges(full), edges(slim));
        const last = Math.min(...[...full.insns.values()].map(i => i.line));
        assert.ok(/^\(note \d+ 0 /.test(rload('O3/u.c.336r.bbro').lines[last]));
    });

    it('reads tuple modes and post-modify addresses in -slim', () => {
        const {lines, fn} = rfn('O3-slim/u.c.336r.bbro', 'va');
        const line = lines.map(l => /V2x4SI=/.test(l)).lastIndexOf(true); // the final chain
        assert.ok(line > 0);
        assert.ok([...fn.vars.values()].some(v => v.occurrences.some(o => o.line === line && o.role === 'def' && o.mode === 'V2x4SI')));
        const post = rfn('O2-slim/u.c.296r.ud_dce', 'va');
        const pl = post.lines.findIndex(l => /\[post r\d+:DI\+=/.test(l));
        const reg = Number(/\[post r(\d+)/.exec(post.lines[pl])![1]);
        assert.strictEqual(post.fn.vars.get('r' + reg)!.occurrences.find(o => o.line === pl)!.role, 'both');
    });

    it('spreads a value over the hard registers it occupies', () => {
        const {lines, fn} = rfn('O3/u.c.336r.bbro', 'va');
        const line = lines.map(l => /\(set \(reg:V2x4SI \d+ v\d+/.test(l)).lastIndexOf(true); // the final chain
        const regno = Number(/\(reg:V2x4SI (\d+)/.exec(lines[line])![1]);
        const second = fn.vars.get('r' + (regno + 1))!.occurrences.find(o => o.line === line)!;
        assert.ok(second.implicit && second.role === 'def');
        // A DImode value in x0 is one register on a 64-bit target.
        const mkp = rfn('O2/u.c.274r.cprop1', 'mkp').fn;
        assert.ok(!mkp.vars.get('r1')!.occurrences.some(o => o.uid !== undefined));
    });
});

/**
 * rs6000, written the way print-rtl.cc prints it (no PowerPC GCC was at hand): full dumps print
 * "(reg:TI 3 %r3)" (regno, then reg_names[regno]); -slim prints the name, "%r3:TI". Default names
 * are bare numbers ("(reg:DI 3 3)", slim "%3:DI"); -mregnames gives %rN, %fN, %vN, %crN.
 */
describe('RTL on rs6000', () => {
    const HEAD = ';; Function f (f, funcdef_no=0, decl_uid=1, cgraph_uid=1, symbol_order=0)';
    const occ = (fn: FunctionInfo, regno: number) => fn.vars.get('r' + regno)?.occurrences.filter(o => o.uid !== undefined) ?? [];
    const full = (insns: string[]) => parseRtlDump([HEAD, '', '(note 1 0 9 NOTE_INSN_DELETED)',
        '(note 9 1 2 2 [bb 2] NOTE_INSN_BASIC_BLOCK)', '(insn 2 9 3 2 (set (reg/f:DI 1 %r1) (reg/f:DI 1 %r1)) -1 (nil))',
        ...insns.map((p, k) => `(insn ${10 + k} 3 4 2 ${p} -1 (nil))`)]).functions[0];

    it('counts each register a value occupies, as rs6000_hard_regno_nregs does', () => {
        const fn = full([
            '(set (reg:TI 3 %r3) (const_int 0))',          // GPRs are 8 bytes on ppc64: r3-r4
            '(set (reg:IF 33 %f1) (reg:IF 40 %f8))',        // IBM long double: an FPR pair
            '(set (reg:TD 36 %f4) (reg:TD 40 %f8))',        // _Decimal128: an FPR pair
            '(set (reg:KF 44 %f12) (reg:KF 45 %f13))',      // IEEE 128-bit: one VSX register
            '(set (reg:V4SI 46 %f14) (reg:V4SI 66 %v2))',   // VSX vector: one register
            '(set (reg:OO 70 %v6) (reg:OO 72 %v8))',        // vector pair: two
            '(set (reg:XO 48 %f16) (reg:XO 52 %f20))',      // MMA accumulator: four FPRs
            '(set (reg:DF 56 %f24) (reg:DF 57 %f25))',      // one FPR
        ]);
        const defs = (r: number) => occ(fn, r).filter(o => o.role === 'def').length;
        assert.deepStrictEqual([3, 4, 5].map(defs), [1, 1, 0]);
        assert.deepStrictEqual([33, 34, 35].map(defs), [1, 1, 0]);
        assert.deepStrictEqual([36, 37, 38].map(defs), [1, 1, 0]);
        assert.deepStrictEqual([44, 45].map(defs), [1, 0]);
        assert.deepStrictEqual([46, 47].map(defs), [1, 0]);
        assert.deepStrictEqual([70, 71, 72].map(defs), [1, 1, 0]);
        assert.deepStrictEqual([48, 49, 50, 51, 52].map(defs), [1, 1, 1, 1, 0]);
        assert.deepStrictEqual([56, 57].map(defs), [1, 0]);
        assert.strictEqual(fn.vars.get('r33')!.hardName, '%f1');
    });

    it('reads default register names (bare numbers) in full dumps', () => {
        const fn = full(['(set (reg:TI 3 3) (reg:TI 30 30))', '(set (reg:DF 60 28) (reg:DF 33 1))']);
        assert.deepStrictEqual([3, 4, 30, 31, 60, 33].map(r => occ(fn, r).length), [1, 1, 1, 1, 1, 1]);
    });

    it('maps -mregnames names in -slim dumps, without a dataflow table', () => {
        const fn = parseRtlDump([HEAD, '', '    1: NOTE_INSN_DELETED', '    9: NOTE_INSN_BASIC_BLOCK 2',
            '    2: %r3:TI=%r30:TI', '    4: %f28:DF=%f1:DF', '    5: %v2:V4SI=%v3:V4SI', '    6: %cr7:CC=cmp(%r9:SI,0)',
            '    7: %r1:DI=%r1:DI-0x10', '    8: ctr:DI=%r12:DI']).functions[0];
        const at = (r: number) => occ(fn, r).map(o => o.role).join(',');
        assert.deepStrictEqual([3, 4, 30, 31, 60, 33, 66, 67, 107, 9, 97, 12].map(at),
            ['def', 'def', 'use', 'use', 'def', 'use', 'def', 'use', 'def', 'use', 'def', 'use']);
        assert.strictEqual(fn.vars.get('r60')!.hardName, '%f28');
        assert.ok(!fn.vars.has('r28') || !occ(fn, 28).length, '%f28 is not GPR 28');
    });

    it('leaves default -slim names (%31 is r31, f31 or v31) unresolved rather than guessing', () => {
        const fn = parseRtlDump([HEAD, '', ';;  entry block defs \t 1 [1] 3 [3] 33 [1]', '    1: NOTE_INSN_DELETED',
            '    9: NOTE_INSN_BASIC_BLOCK 2', '    2: %3:DI=%31:DI']).functions[0];
        assert.ok(![...fn.vars.values()].some(v => v.occurrences.some(o => o.uid === 2)));
    });
});

describe('parseGimpleDump', () => {
    const m = parseGimpleDump(GIMPLE.split('\n'));
    const f = m.functions[0];

    it('finds the function and basic blocks', () => {
        assert.strictEqual(f.name, 'foo');
        assert.deepStrictEqual(f.blocks.map(b => b.index), [2, 3]);
    });

    it('marks LHS names as defs and later mentions as uses', () => {
        assert.strictEqual(f.vars.get('_1')!.occurrences.filter(o => o.role === 'def').length, 1);
        assert.strictEqual(f.vars.get('_1')!.occurrences.filter(o => o.role === 'use').length, 2);
    });

    it('does not count the declaration as a use', () => {
        const decl = f.vars.get('_2')!.occurrences[0];
        assert.strictEqual(decl.role, 'decl');
    });

    it('treats a (D) name as a default def of the parameter', () => {
        const a = f.vars.get('a_3')!;
        assert.ok(a.ssa && a.defaultDef);
        assert.strictEqual(a.base, 'a');
        assert.strictEqual(a.type, 'int');
        assert.deepStrictEqual(a.occurrences.map(o => o.role), ['use']);
        const param = f.vars.get('a')!.occurrences[0];
        assert.strictEqual(param.role, 'decl');
        assert.strictEqual(param.line, f.signatureLine);
    });

    it('treats a PHI result as a def', () => {
        const defs = f.vars.get('_4')!.occurrences.filter(o => o.role === 'def');
        assert.strictEqual(defs.length, 1);
        assert.ok(GIMPLE.split('\n')[defs[0].line].includes('PHI'));
    });

    it('ignores function names and names inside strings', () => {
        assert.ok(!f.vars.has('foo_9'));
        assert.ok(!f.vars.has('x_7'));
        assert.ok(!f.vars.has('_8'));
    });

    it('records exact columns', () => {
        const lines = GIMPLE.split('\n');
        const o = f.vars.get('a_3')!.occurrences[0];
        assert.strictEqual(lines[o.line].slice(o.start, o.end), 'a_3');
    });
});

/** GCC 14 dumps of testcase/gimple/t.c and t.cc with various -fdump-tree flags. */
const GDIR = path.join(ROOT, 'testcase', 'gimple');
const gload = (rel: string) => {
    const lines = fs.readFileSync(path.join(GDIR, rel), 'utf8').split('\n');
    return {lines, model: parseGimpleDump(lines)};
};
const gfn = (rel: string, name: string) => {
    const {lines, model} = gload(rel);
    const fn = model.functions.find(x => x.name === name);
    assert.ok(fn, `${name} in ${rel}`);
    return {lines, fn: fn!};
};
/** The occurrence of `name` on the first line containing `text` (the nth match on that line). */
const gocc = (lines: string[], fn: FunctionInfo, name: string, text: string, nth = 0): Occurrence => {
    const line = lines.findIndex((l, i) => i >= (fn.signatureLine ?? fn.line) && i <= fn.endLine && l.includes(text));
    assert.ok(line >= 0, text);
    const list = fn.vars.get(name)?.occurrences.filter(o => o.line === line) ?? [];
    assert.ok(list[nth], `${name} on "${text}"`);
    return list[nth];
};
const textOf = (lines: string[], o: Occurrence) => lines[o.line].trim();

describe('GIMPLE model against GCC dumps', () => {
    const dumps = (function walk(dir: string): string[] {
        return fs.readdirSync(dir).flatMap(f => {
            const p = path.join(dir, f);
            return fs.statSync(p).isDirectory() ? walk(p) : /\.\d+t\./.test(f) ? [path.relative(GDIR, p)] : [];
        });
    })(GDIR);

    it('has the fixtures', () => assert.ok(dumps.length >= 10));

    for (const rel of dumps) {
        it(`${rel}: one def per SSA name, every use defined, defs dominate uses`, () => {
            const {lines, model} = gload(rel);
            assert.ok(model.functions.length > 0);
            for (const fn of model.functions) {
                const order = fn.blocks.map(b => b.index);
                const dom = new Map(order.map(i => [i, new Set(order)]));
                if (order.length) dom.set(order[0], new Set([order[0]]));
                for (let changed = true; changed;) {
                    changed = false;
                    for (const i of order.slice(1)) {
                        let d: Set<number> | undefined;
                        for (const p of fn.blocks.find(b => b.index === i)!.preds) {
                            const pd = dom.get(p);
                            if (pd) d = d ? new Set([...d].filter(x => pd.has(x))) : new Set(pd);
                        }
                        const next = new Set([...(d ?? []), i]);
                        if (next.size !== dom.get(i)!.size) { dom.set(i, next); changed = true; }
                    }
                }
                for (const v of fn.vars.values()) {
                    if (!v.ssa) continue;
                    const defs = v.occurrences.filter(o => (o.role === 'def' || o.role === 'both') && o.uid !== undefined);
                    const uses = v.occurrences.filter(o => o.role === 'use' && o.uid !== undefined);
                    assert.ok(defs.length <= 1, `${fn.name} ${v.key} has ${defs.length} defs`);
                    assert.ok(defs.length === 1 || v.defaultDef || !uses.length, `${fn.name} ${v.key} has no def`);
                    if (defs.length !== 1 || !fn.blocks.length) continue;
                    const d = fn.insns.get(defs[0].uid!)!;
                    for (const u of uses) {
                        const ui = fn.insns.get(u.uid!)!;
                        // A PHI argument is used at the end of the incoming block.
                        const phiBb = ui.kind === 'phi' ? /^(?:\((?:D|ab)\))?\((\d+)\)/.exec(lines[u.line].slice(u.end)) : null;
                        const bb = phiBb ? Number(phiBb[1]) : ui.bb!;
                        // Without -eh, landing pads have no visible preds; the model says so with cfgUncertain.
                        if (fn.cfgUncertain && bb !== order[0] && !fn.blocks.find(b => b.index === bb)!.preds.length) continue;
                        const ok = bb === d.bb ? phiBb !== null || d.seq < ui.seq : dom.get(bb)?.has(d.bb!);
                        assert.ok(ok, `${rel} ${fn.name}: def of ${v.key} on line ${d.line + 1} does not dominate line ${u.line + 1}`);
                    }
                }
            }
        });

        it(`${rel}: every _N in a body is found`, () => {
            const {lines, model} = gload(rel);
            for (const fn of model.functions) {
                const at = new Set<string>();
                for (const v of fn.vars.values()) for (const o of v.occurrences) at.add(`${o.line}:${o.start}`);
                for (let l = fn.signatureLine ?? fn.line; l <= fn.endLine; l++) {
                    const t = lines[l].replace(/"(?:[^"\\]|\\.)*"/g, x => ' '.repeat(x.length));
                    for (const x of t.matchAll(/(?<![\w.$>])_\d+\b/g))
                        assert.ok(at.has(`${l}:${x.index}`), `${rel} line ${l + 1}: ${lines[l].trim()}`);
                }
            }
        });
    }

    it('derives the same CFG as -blocks prints (gotos, switches, noreturn calls, EH)', () => {
        for (const rel of ['blocks/t.c.121t.vrp1', 'dbg/t.cc.265t.optimized']) {
            const {lines, model} = gload(rel);
            const stripped = parseGimpleDump(lines.filter(l => !/^;;\s+(?:pred|succ):|^;;\s+(?:\d+|ENTRY|EXIT)\b/.test(l)));
            for (const fn of model.functions) {
                assert.strictEqual(fn.cfgSource, 'dump');
                const other = stripped.functions.find(x => x.name === fn.name)!;
                assert.strictEqual(other.cfgSource, 'computed');
                const edges = (x: FunctionInfo) => x.blocks.flatMap(b => b.succs.map(s => `${b.index}->${s}`)).sort();
                assert.deepStrictEqual(edges(other), edges(fn), `${rel} ${fn.name}`);
                assert.ok(!other.cfgUncertain, `${rel} ${fn.name}`);
            }
        }
    });

    it('checks PHI arguments against the predecessors', () => {
        const {lines, model} = gload('blocks/t.c.121t.vrp1');
        let phis = 0;
        for (const fn of model.functions) for (const b of fn.blocks) {
            const phi = lines.slice(b.line, b.endLine + 1).find(l => /= PHI </.test(l));
            if (!phi) continue;
            phis++;
            const args = [...phi.matchAll(/\((\d+)\)(?=[,>])/g)].map(x => Number(x[1])).sort();
            assert.deepStrictEqual(args, [...b.preds].sort(), `${fn.name} bb ${b.index}`);
        }
        assert.ok(phis > 0);
    });

    it('tells user variables from SSA names that look alike', () => {
        const {lines, fn} = gfn('plain/t.c.022t.ssa', 'addr');
        const tmp = fn.vars.get('tmp_1')!; // int tmp_1 in the source
        assert.ok(!tmp.ssa && tmp.addressTaken);
        assert.strictEqual(tmp.type, 'int');
        const g0 = [...fn.vars.values()].find(v => /^g\.0_\d+$/.test(v.key))!;
        assert.ok(g0.ssa && g0.base === 'g.0');
        const t11 = [...fn.vars.values()].find(v => /^tmp_1\.1_\d+$/.test(v.key))!;
        assert.ok(t11.ssa && t11.base === 'tmp_1.1');
        assert.ok(lines.some(l => l.includes('={v}')));
    });

    it('reads stores into memory correctly', () => {
        const {lines, fn} = gfn('plain/t.c.022t.ssa', 'addr');
        // p_14 = &tmp_1: taking the address reads nothing.
        assert.strictEqual(gocc(lines, fn, 'tmp_1', '= &tmp_1').role, 'note');
        // s.a = v: writes part of s.
        const sa = gocc(lines, fn, 's', 's.a = ');
        assert.strictEqual(sa.role, 'both');
        assert.ok(sa.partial);
        // _6 = s.a: reads s.
        assert.strictEqual(gocc(lines, fn, 's', '= s.a').role, 'use');
        // s ={v} {CLOBBER(eos)}: the end of s's life.
        const clob = gocc(lines, fn, 's', 's ={v}');
        assert.strictEqual(clob.role, 'def');
        assert.ok(!clob.partial);
        assert.ok(!fn.vars.has('v') || !fn.vars.get('v')!.occurrences.some(o => lines[o.line].includes('{CLOBBER')));
    });

    it('follows reaching definitions of variables in a pre-SSA dump', () => {
        const {lines, fn} = gfn('plain/t.c.006t.gimple', 'loop');
        assert.ok(fn.flowBlocks && fn.flowBlocks.length >= 3);
        const s = fn.vars.get('s')!;
        const use = gocc(lines, fn, 's', 's = s + _4', 1);
        assert.strictEqual(use.role, 'use');
        const reach = new FlowQuery(fn, s).reachingDefs(use);
        assert.deepStrictEqual(reach.occurrences.map(o => textOf(lines, o)), ['s = 0;', 's = s + _4;']);
        assert.ok(!reach.fromEntry);
        const ret = gocc(lines, fn, 'D.5711', 'return D.5711');
        const r2 = new FlowQuery(fn, fn.vars.get('D.5711')!).reachingDefs(ret);
        assert.deepStrictEqual(r2.occurrences.map(o => textOf(lines, o)), ['D.5711 = s;']);
    });

    it('joins every switch case at the label they jump to', () => {
        const {lines, fn} = gfn('plain/t.c.006t.gimple', 'sw');
        const use = gocc(lines, fn, 'y', 'D.5713 = y');
        const reach = new FlowQuery(fn, fn.vars.get('y')!).reachingDefs(use);
        assert.deepStrictEqual(reach.occurrences.map(o => textOf(lines, o)),
                               ['y = y + 3;', 'y = y * 7;', 'y = y + -11;', 'y = sq (y);']);
        assert.ok(!reach.fromEntry);
    });

    it('reports a possibly uninitialised variable', () => {
        const {lines, fn} = gfn('plain/t.c.006t.gimple', 'unin');
        const use = gocc(lines, fn, 'u', '= u;');
        const reach = new FlowQuery(fn, fn.vars.get('u')!).reachingDefs(use);
        assert.deepStrictEqual(reach.occurrences.map(o => textOf(lines, o)), ['u = 4;']);
        assert.ok(reach.fromEntry);
    });

    it('ends blocks at noreturn calls', () => {
        const {lines, fn} = gfn('plain/t.c.022t.ssa', 'nr');
        for (const call of ['abort ()', '__builtin_unreachable ()']) {
            const line = lines.findIndex((l, i) => i > fn.line && l.includes(call));
            const b = fn.blocks.find(x => line >= x.line && line <= x.endLine)!;
            assert.deepStrictEqual(b.succs, [], call);
        }
        assert.ok(!fn.cfgUncertain);
    });

    it('follows EH edges, landing pads and catch handlers', () => {
        const {lines, fn} = gfn('dbg/t.cc.013t.eh', 'use');
        const blockOf = (text: string) => {
            const line = lines.findIndex((l, i) => i > fn.line && l.includes(text));
            return fn.flowBlocks!.find(b => line >= b.line && line <= b.endLine)!;
        };
        // [LP 1] push_back may throw to <D.28508>: [LP 1]; eh_dispatch 2 goes to the catch at <D.28507>.
        assert.ok(blockOf('push_back').succs.includes(blockOf('<D.28508>: [LP 1]').index));
        assert.ok(blockOf('eh_dispatch 2').succs.includes(blockOf('<D.28507>:').index));
        // The handler's D.28504 = -1 reaches the return; nothing comes from the entry.
        const reach = new FlowQuery(fn, fn.vars.get('D.28504')!).reachingDefs(gocc(lines, fn, 'D.28504', 'return D.28504'));
        assert.deepStrictEqual(reach.occurrences.map(o => textOf(lines, o)), ['D.28504 = _5 + r.0_6;', 'D.28504 = -1;']);
        assert.ok(!reach.fromEntry);
        // Parameters are found past the Eh tree.
        assert.deepStrictEqual([...fn.vars.keys()].filter(k => fn.vars.get(k)!.occurrences.some(o => o.line === fn.signatureLine)),
                               ['v', 'x']);
    });

    it('reads -alias default defs and their points-to annotations', () => {
        const {lines, fn} = gfn('alias/t.c.265t.optimized', 'loop');
        const a = fn.vars.get('a_9')!;
        assert.ok(a.ssa && a.defaultDef);
        const def = a.occurrences.find(o => o.role === 'def')!;
        assert.ok(lines[def.line].includes('int * a_9(D) = a;'));
        assert.deepStrictEqual(a.annotations, ['# PT = nonlocal null']);
    });

    it('handles -raw dumps', () => {
        const {lines, fn} = gfn('raw/t.c.022t.ssa', 'sw');
        assert.strictEqual(fn.cfgSource, 'computed');
        assert.ok(!fn.cfgUncertain);
        const sw = fn.blocks.find(b => b.index === 2)!;
        assert.deepStrictEqual([...sw.succs].sort(), [3, 4, 5, 6, 7]);
        const phi = gocc(lines, fn, 'y_1', 'gimple_phi <y_1');
        assert.strictEqual(phi.role, 'def');
        const pre = gfn('raw/t.c.006t.gimple', 'loop');
        const s = pre.fn.vars.get('s')!;
        const use = gocc(pre.lines, pre.fn, 's', 'gimple_assign <plus_expr, s, s', 1);
        const reach = new FlowQuery(pre.fn, s).reachingDefs(use);
        assert.strictEqual(reach.occurrences.length, 2);
        assert.ok(!reach.fromEntry);
    });

    it('handles -lineno dumps', () => {
        const {lines, fn} = gfn('lineno/t.c.006t.gimple', 'loop');
        const o = gocc(lines, fn, 's', '] s = s + _4', 1);
        assert.strictEqual(lines[o.line].slice(o.start, o.end), 's');
        assert.strictEqual(o.role, 'use');
        assert.ok(fn.vars.get('a')!.occurrences.some(x => x.line === fn.signatureLine));
    });

    it('marks names in pass logging as log mentions', () => {
        const {lines, fn} = gfn('details/t.c.121t.vrp1', 'loop');
        const close = lines.findIndex((l, i) => i > fn.signatureLine! && l === '}');
        const logs = [...fn.vars.values()].flatMap(v => v.occurrences.filter(o => o.role === 'log'));
        assert.ok(logs.length > 0);
        assert.ok(logs.every(o => o.line < fn.signatureLine! || o.line > close));
        // Inside the body nothing is a log mention.
        const inBody = [...fn.vars.values()].flatMap(v => v.occurrences.filter(o => o.line > fn.signatureLine! && o.line < close));
        assert.ok(inBody.length > 0 && inBody.every(o => o.role !== 'log'));
    });

    it('does no dataflow on GENERIC (.original)', () => {
        const {lines, fn} = gfn('plain/t.c.005t.original', 'loop');
        assert.strictEqual(fn.flowBlocks, undefined);
        assert.strictEqual(gocc(lines, fn, 'i', 'i++').role, 'both');
        const u = gfn('plain/t.c.005t.original', '_OSSwapInt64');
        assert.ok(!u.fn.vars.has('_ull') && u.fn.vars.has('_u'));
    });

    it('resolves labels', () => {
        const {lines, model} = gload('plain/t.c.006t.gimple');
        const fn = model.functions.find(x => x.name === 'loop')!;
        const idx = new PositionIndex(model);
        const li = lines.findIndex(l => l.includes('goto <D.5667>;'));
        const t = idx.targetAt(li, lines[li].indexOf('D.5667'));
        assert.ok(t?.kind === 'label' && t.ref.name === 'D.5667');
        assert.strictEqual(lines[fn.labels!.get('D.5667')!].trim(), '<D.5667>:');
    });

    it('gives shadowed declarations their own key', () => {
        const {lines, fn} = gfn('u/dplain/u.c.006t.gimple', 'shadow');
        const inner = [...fn.vars.values()].filter(v => v.display === 's');
        assert.strictEqual(inner.length, 1);
        const sIn = inner[0];
        assert.strictEqual(lines[sIn.declLine!].trim(), 'int s;');
        assert.deepStrictEqual(sIn.occurrences.map(o => `${o.role} ${textOf(lines, o)}`), ['decl int s;', 'def s = 5;', 'use g = s;']);
        // The outer s is untouched by the inner block and reaches the return.
        assert.strictEqual(gocc(lines, fn, 's', 'D.5572 = s;').role, 'use');
        assert.ok(!fn.vars.get('s')!.occurrences.some(o => textOf(lines, o) === 'g = s;'));
        // Two loops each declare their own i.
        const is = [...fn.vars.values()].filter(v => (v.display ?? v.key) === 'i');
        assert.strictEqual(is.length, 2);
        assert.ok(is.every(v => v.occurrences.filter(o => o.role === 'def').length === 2));
    });

    it('knows statics and globals outlive the call', () => {
        const c = gfn('u/dplain/u.c.006t.gimple', 'counter');
        assert.strictEqual(c.fn.vars.get('count')!.storage, 'static');
        const {fn} = gfn('u/dplain/u.c.006t.gimple', 'glob');
        assert.strictEqual(fn.vars.get('g')!.storage, 'global');
        assert.strictEqual(fn.vars.get('garr')!.storage, 'global');
        assert.ok(!fn.vars.has('ext'), 'callees are not variables');
    });

    it('builds abnormal edges for setjmp like -blocks prints', () => {
        const {lines, model} = gload('u/d-blocks/u.c.022t.ssa');
        const stripped = parseGimpleDump(lines.filter(l => !/^;;\s+(?:pred|succ):|^;;\s+(?:\d+|ENTRY|EXIT)\b/.test(l)));
        const edges = (x: FunctionInfo) => x.blocks.flatMap(b => b.succs.map(s => `${b.index}->${s}`)).sort();
        for (const name of ['sj', 'cgoto', 'ulabel', 'shadow', 'va'])
            assert.deepStrictEqual(edges(stripped.functions.find(f => f.name === name)!), edges(model.functions.find(f => f.name === name)!), name);
        const sj = gfn('u/dg/u.c.022t.ssa', 'sj').fn;
        assert.ok([...sj.vars.values()].some(v => v.abnormal));
    });

    it('sends a computed goto only to labels whose address is taken', () => {
        const {fn} = gfn('u/dplain/u.c.006t.gimple', 'cgoto');
        const B = fn.flowBlocks!;
        assert.deepStrictEqual(B[0].succs, [B[1].index, B[2].index]);
        assert.ok(!fn.vars.has('l1') && !fn.vars.has('l2'));
        assert.ok(!fn.cfgUncertain);
    });

    it('finds user labels in -lineno dumps', () => {
        const {lines, fn} = gfn('u/d-lineno/u.c.006t.gimple', 'ulabel');
        assert.ok(fn.labelRefs!.some(r => r.name === 'retry' && r.decl));
        assert.ok(fn.labelRefs!.some(r => r.name === 'retry' && !r.decl && lines[r.line].includes('goto retry')));
        assert.ok(!fn.vars.has('retry'));
        const B = fn.flowBlocks!;
        const loop = B.find(b => lines[b.line].includes('retry:'))!;
        assert.ok(B.some(b => b !== loop && b.succs.includes(loop.index) && b.line > loop.line), 'back edge to retry');
    });

    it('reads multi-line asm in -raw dumps', () => {
        const {lines, fn} = gfn('u/d-raw/u.c.022t.ssa', 'asmf');
        assert.strictEqual(gocc(lines, fn, 'r_3', 'OUTPUT: "=r" r_3').role, 'def');
        assert.strictEqual(gocc(lines, fn, 'k_2', 'INPUT: "0" k_2').role, 'use');
        assert.strictEqual(gocc(lines, fn, 'a_1', 'INPUT: "r" a_1(D)').role, 'use');
    });

    it('reads operator calls and parameter packs', () => {
        const {lines, fn} = gfn('u/d-raw/u.cc.006t.gimple', 'useop');
        assert.strictEqual(gocc(lines, fn, '_2', 'gimple_call <operator<').role, 'def');
        assert.strictEqual(fn.vars.get('o')!.occurrences.filter(o => textOf(lines, o).startsWith('gimple_call <operator<')).length, 2);
        const sum = gfn('u/dplain/u.cc.022t.ssa', 'sum<int&, int&, int>').fn;
        assert.ok(sum.vars.get('a#0')!.occurrences.some(o => o.role === 'decl'));
        assert.strictEqual(sum.vars.get('a#0_6')!.base, 'a#0');
        assert.ok(sum.vars.get('a#0_6')!.defaultDef);
    });

    it('treats try bodies as reaching their handlers and says the CFG is a guess', () => {
        const {lines, fn} = gfn('u/dplain/u.cc.006t.gimple', 'tryf');
        assert.ok(fn.cfgUncertain);
        const B = fn.flowBlocks!;
        const tryB = B.find(b => lines[b.line].trim() === 'try')!;
        const handler = B.find(b => lines[b.line].trim() === 'catch')!;
        assert.ok(tryB.succs.includes(handler.index));
    });

    it('keeps vops annotations to themselves and names in DEBUG binds as notes', () => {
        const {model} = gload('u/d-vops-alias/u.c.022t.ssa');
        for (const fn of model.functions) for (const v of fn.vars.values())
            assert.ok(!(v.annotations ?? []).some(a => /^#\s*(?:USE|CLB)\b/.test(a)), `${fn.name} ${v.key}`);
        const {lines, fn} = gfn('u/dg/u.c.022t.ssa', 'asmf');
        assert.strictEqual(gocc(lines, fn, 'k', '# DEBUG k => k_2').role, 'note');
        assert.strictEqual(gocc(lines, fn, 'k_2', '# DEBUG k => k_2').role, 'debug');
    });

    it('reads <unnamed-unsigned:N> declarations', () => {
        const {lines, fn} = gfn('u/d-vops-alias/u.c.022t.ssa', 'bits');
        assert.strictEqual(fn.vars.get('_1')!.type, '<unnamed-unsigned:5>');
        assert.strictEqual(gocc(lines, fn, '_2', '<unnamed-unsigned:3> _2;').role, 'decl');
    });

    it('drops the fallthrough after a call that vops show never returns', () => {
        const {fn} = gfn('u/d-vops-alias/u.c.022t.ssa', 'nr2');
        assert.deepStrictEqual(fn.blocks.map(b => b.succs), [[3, 4], [], [1]]);
    });

    it('parses C++ function names', () => {
        const {model} = gload('dbg/t.cc.265t.optimized');
        assert.ok(model.functions.some(x => x.name === 'std::vector<int>::_M_realloc_append<const int&>'));
    });
});
