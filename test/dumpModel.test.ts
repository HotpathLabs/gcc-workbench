import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseRtlDump } from '../src/dumpModel/rtlModel';
import { parseGimpleDump } from '../src/dumpModel/gimpleModel';
import { findVarAt } from '../src/dumpModel/types';

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
        assert.strictEqual(decl.role, 'note');
    });

    it('treats a (D) default definition as the def', () => {
        const a = f.vars.get('a_3')!;
        assert.strictEqual(a.occurrences[0].role, 'def');
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
