import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vsctm from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';
import { findNoiseLines } from '../src/rtlNoise';

const ROOT = path.join(__dirname, '..', '..');
const SAMPLE = fs.readFileSync(path.join(ROOT, 'testcase', 'testcase.c.286r.combine'), 'utf8').split('\n');

let grammar: vsctm.IGrammar;

before(async () => {
    const wasm = fs.readFileSync(path.join(ROOT, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm'));
    await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
    const registry = new vsctm.Registry({
        onigLib: Promise.resolve({
            createOnigScanner: (s: string[]) => new oniguruma.OnigScanner(s),
            createOnigString: (s: string) => new oniguruma.OnigString(s),
        }),
        loadGrammar: async () => vsctm.parseRawGrammar(
            fs.readFileSync(path.join(ROOT, 'syntaxes', 'rtl.tmLanguage.json'), 'utf8'), 'rtl.json'),
    });
    grammar = (await registry.loadGrammar('source.gcc.rtl'))!;
});

/** Per line: true when every non-blank token carries a comment scope. */
function commentFlags(lines: string[]): boolean[] {
    let stack = vsctm.INITIAL;
    return lines.map(line => {
        const r = grammar.tokenizeLine(line, stack);
        stack = r.ruleStack;
        const toks = r.tokens.filter(t => line.slice(t.startIndex, t.endIndex).trim());
        return toks.length > 0 && toks.every(t => t.scopes.some(s => s.startsWith('comment.')));
    });
}

const LOG = [
    'Trying 3 -> 11:',
    '    3: r99:SI=r104:SI',
    '      REG_DEAD r104:SI',
    '  Adding insn 12 to worklist',
    'Failed to match this instruction:',
    '(parallel [',
    '        (set (reg:CC 66 cc)',
    '            (compare:CC (reg:SI 104)',
    '                (const_int 0 [0])))',
    '    ])',
    '',
    '( )->[0]->( 2 )',
];

const REAL = [
    '(insn 52 7 2 2 (set (reg:DI 114)',
    '        (reg:DI 0 x0 [ a ])) "testcase.c":399:1 -1',
    '     (nil))',
];

describe('RTL grammar - pass logging', () => {
    it('scopes log text, compact listings, candidate RTL and edge summaries as comments', () => {
        const flags = commentFlags(LOG);
        LOG.forEach((line, i) => {
            if (line.trim()) { assert.ok(flags[i], `not a comment: ${JSON.stringify(line)}`); }
        });
    });

    it('does not scope real insns as comments', () => {
        assert.deepStrictEqual(commentFlags(REAL), [false, false, false]);
    });

    it('resumes normal scopes after a candidate block', () => {
        const flags = commentFlags([...LOG.slice(4, 9), ...REAL]);
        assert.deepStrictEqual(flags.slice(5), [false, false, false]);
    });
});

describe('findNoiseLines', () => {
    it('fades every logging line and no real insn in a combine dump', () => {
        const noisy = new Set(findNoiseLines(SAMPLE));
        const trying = SAMPLE.findIndex(l => l.startsWith('Trying '));
        assert.ok(trying >= 0 && noisy.has(trying));
        SAMPLE.forEach((line, i) => {
            if (/^\((insn|jump_insn|call_insn)\b/.test(line)) {
                assert.ok(!noisy.has(i), `real insn faded at line ${i + 1}`);
            }
        });
    });

    it('keeps fading ;; comments, clobbers, uses and barriers', () => {
        const noisy = findNoiseLines([';; Function f', '(insn 2 1 3 2 (set (reg:SI 1)', '    (clobber (reg:CC 66 cc))', '    (use (reg:SI 2))))', '(barrier 5 4 6)']);
        assert.deepStrictEqual(noisy, [0, 2, 3, 4]);
    });

    it('never fades notes, so NOTE_INSN_BASIC_BLOCK stays visible', () => {
        const lines = ['(note 28 27 0 5 [bb 5] NOTE_INSN_BASIC_BLOCK)', '(note 4 3 7 2 NOTE_INSN_FUNCTION_BEG)'];
        assert.deepStrictEqual(findNoiseLines(lines), []);
        const sample = new Set(findNoiseLines(SAMPLE));
        SAMPLE.forEach((line, i) => {
            if (/^\(note\b/.test(line)) { assert.ok(!sample.has(i), `note faded at line ${i + 1}`); }
        });
    });

    it('fades indented log text such as "Adding insn N to worklist"', () => {
        assert.deepStrictEqual(findNoiseLines(['  Adding insn 12 to worklist', '(insn 2 1 3 2 (nil) -1', '        ]) "t.c":1:1 2 {x}', '     (nil))']), [0]);
    });

    it('fades a whole candidate block up to the next column-0 line', () => {
        const lines = ['Failed to match this instruction:', '(set (pc)', '    (label_ref 3))', '', 'Trying 1 -> 2:'];
        assert.deepStrictEqual(findNoiseLines(lines), [0, 1, 2, 3, 4]);
    });
});

describe('RTL grammar - memory references', () => {
    const scopeOf = (line: string, text: string, from = 0) => {
        const r = grammar.tokenizeLine(line, vsctm.INITIAL);
        const t = r.tokens.find(tok => tok.startIndex >= from && line.slice(tok.startIndex, tok.endIndex).trim() === text);
        return t?.scopes[t.scopes.length - 1];
    };
    const LINE = '        (mem:SI (post_inc:DI (reg:DI 94 [ ivtmp.18 ])) [1 MEM[(const int *)_5]+0 S4 A32])))';

    it('gives the mem form its own scope', () => {
        assert.strictEqual(scopeOf(LINE, 'mem'), 'keyword.rtl-memory.gcc.rtl');
    });
    it('scopes the MEM[...] expression like mem', () => {
        assert.strictEqual(scopeOf(LINE, 'MEM'), 'keyword.rtl-memory.gcc.rtl');
    });
    it('scopes size and alignment', () => {
        assert.strictEqual(scopeOf(LINE, 'S4'), 'constant.other.memory-attr.gcc.rtl');
        assert.strictEqual(scopeOf(LINE, 'A32'), 'constant.other.memory-attr.gcc.rtl');
    });
    it('leaves reg alone', () => {
        assert.strictEqual(scopeOf(LINE, 'reg'), 'keyword.rtl-construct.gcc.rtl');
    });
});

describe('RTL grammar - insn names and flags', () => {
    const scopes = (line: string, text: string) => {
        const r = grammar.tokenizeLine(line, vsctm.INITIAL);
        const t = r.tokens.find(tok => line.slice(tok.startIndex, tok.endIndex).trim() === text);
        return t?.scopes[t.scopes.length - 1];
    };

    for (const [line, name] of [
        ['(call_insn/i 8 3 52 2 (parallel [', 'call_insn'],
        ['(call_insn 51 50 52 6 (parallel [', 'call_insn'],
        ['(insn/f 90 89 91 2 (set (reg:DI 31 sp)', 'insn'],
        ['(jump_insn/j 12 11 13 2 (set (pc)', 'jump_insn'],
        ['(insn 52 7 2 2 (set (reg:DI 114)', 'insn'],
        ['(jump_table_data 106 105 107 8 (addr_vec:SI [', 'jump_table_data'],
    ]) {
        it(`${name} in ${JSON.stringify(line.slice(0, 20))} is an instruction keyword`, () => {
            assert.strictEqual(scopes(line, name), 'keyword.control.instruction.gcc.rtl');
        });
    }

    it('scopes the flag suffix and the uid', () => {
        assert.strictEqual(scopes('(call_insn/i 8 3 52 2 (parallel [', '/i'), 'storage.modifier.flag.gcc.rtl');
        assert.strictEqual(scopes('(call_insn/i 8 3 52 2 (parallel [', '8'), 'constant.numeric.uid.gcc.rtl');
    });
});

describe('RTL grammar - rtl.def coverage', () => {
    const ONE = (line: string, text: string) => {
        const r = grammar.tokenizeLine(line, vsctm.INITIAL);
        const t = r.tokens.find(tok => line.slice(tok.startIndex, tok.endIndex).trim() === text);
        return t?.scopes[t.scopes.length - 1];
    };
    for (const code of ['pre_inc', 'post_dec', 'post_modify', 'var_location', 'entry_value', 'const_wide_int', 'pc', 'cond_exec', 'zero_extract']) {
        it(`${code} is highlighted`, () => {
            assert.notStrictEqual(ONE(`        (${code} (reg:DI 1)`, code), 'source.gcc.rtl');
            assert.ok(ONE(`        (${code} (reg:DI 1)`, code));
        });
    }
    for (const code of ['ss_plus', 'us_minus', 'smul_highpart', 'copysign', 'bitreverse']) {
        it(`${code} is an arithmetic operator`, () => {
            assert.strictEqual(ONE(`        (${code}:SI (reg:SI 1)`, code), 'keyword.operator.arithmetic.gcc.rtl');
        });
    }
});
