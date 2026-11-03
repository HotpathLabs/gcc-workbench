import * as assert from 'assert';
import { explainFlags, flagHeadAt } from '../src/dumpModel/rtlFlags';

describe('RTL flag meanings (rtl.h accessors)', () => {
    const macros = (code: string, letters: string) => explainFlags(code, letters.split('')).map(f => f.macro);

    it('gives each letter the meaning of its rtx code', () => {
        assert.deepStrictEqual(macros('reg', 'vfi'), ['REG_USERVAR_P', 'REG_POINTER', 'REG_FUNCTION_VALUE_P']);
        assert.deepStrictEqual(macros('mem', 'vufjci'),
            ['MEM_VOLATILE_P', 'MEM_READONLY_P', 'MEM_POINTER', 'MEM_KEEP_ALIAS_SET_P', 'MEM_NOTRAP_P', 'MEM_INDEPENDENT_P']);
        assert.deepStrictEqual(macros('call_insn', 'ujci'),
            ['RTL_CONST_CALL_P', 'SIBLING_CALL_P', 'RTL_LOOPING_CONST_OR_PURE_CALL_P', 'RTL_PURE_CALL_P']);
        assert.deepStrictEqual(macros('jump_insn', 'uj'), ['INSN_ANNULLED_BRANCH_P', 'CROSSING_JUMP_P']);
        assert.deepStrictEqual(macros('insn', 'f'), ['RTX_FRAME_RELATED_P']);
        assert.deepStrictEqual(macros('symbol_ref', 'vufi'),
            ['SYMBOL_REF_FLAG', 'CONSTANT_POOL_ADDRESS_P', 'TREE_CONSTANT_POOL_ADDRESS_P', 'SYMBOL_REF_WEAK']);
        assert.deepStrictEqual(macros('label_ref', 'v'), ['LABEL_REF_NONLOCAL_P']);
        // /f on a reg is a pointer; on an insn it is frame related; /i on a call is pure, not a return value.
        assert.notStrictEqual(macros('reg', 'f')[0], macros('insn', 'f')[0]);
    });

    it('reads the sign of a promoted subreg from /u and /v together (SUBREG_PROMOTED_SET)', () => {
        const kind = (letters: string) => explainFlags('subreg', letters.split('')).map(f => f.text).join(' | ');
        assert.match(kind('sv'), /zero-extended \(SRP_UNSIGNED\)/);
        assert.match(kind('su'), /sign-extended \(SRP_SIGNED\)/);
        assert.match(kind('svu'), /both sign- and zero-extended/);
        assert.match(kind('s'), /pointer extension \(SRP_POINTER\)/);
        assert.deepStrictEqual(macros('subreg', 'svu'), ['SUBREG_PROMOTED_VAR_P', 'SUBREG_PROMOTED_UNSIGNED_P', 'SUBREG_PROMOTED_SIGNED_P']);
    });

    it('reads a label kind from /j and /c together (LABEL_KIND)', () => {
        const kind = (letters: string) => explainFlags('code_label', letters.split('')).map(f => f.text).join();
        assert.match(kind('c'), /LABEL_STATIC_ENTRY/);
        assert.match(kind('j'), /LABEL_GLOBAL_ENTRY/);
        assert.match(kind('jc'), /LABEL_WEAK_ENTRY/);
    });

    it('says so for a bit with no meaning on that code', () => {
        assert.match(explainFlags('reg', ['c'])[0].text, /no documented meaning/);
    });

    it('finds the flagged head and each flag column under the cursor', () => {
        const line = '        (subreg/s/u:QI (reg/v:SI 102 [ _8 ]) 0))';
        const at = (s: string) => line.indexOf(s);
        const h = flagHeadAt(line, at('/u') + 1)!;
        assert.strictEqual(h.code, 'subreg');
        assert.deepStrictEqual(h.letters, ['s', 'u']);
        assert.deepStrictEqual(h.spans.map(([s, e]) => line.slice(s, e)), ['/s', '/u']);
        assert.strictEqual(line.slice(h.start, h.end), '(subreg/s/u:QI');
        assert.strictEqual(flagHeadAt(line, at('reg/v') + 3)!.code, 'reg');
        assert.strictEqual(flagHeadAt(line, at('102')), undefined);
        assert.strictEqual(flagHeadAt('(insn:TI 8 3 9 (set (reg:SI 1 x1)', 3), undefined, 'a mode is not a flag');
        assert.strictEqual(flagHeadAt('(call_insn/u/c 22 21', 5)!.code, 'call_insn');
    });
});
