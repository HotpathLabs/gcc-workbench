import * as assert from 'assert';
import { scanMdTokens, MdLookup } from '../src/mdTokenScan';

const KINDS: Record<string, 'iterator' | 'attribute'> = {
    any_extend: 'iterator', any_fix: 'iterator', any_float: 'iterator', GPR: 'iterator',
    wa_v: 'attribute', mode_name: 'attribute',
};
const lookup: MdLookup = n => KINDS[n];

const found = (src: string) =>
    scanMdTokens(src.split('\n'), lookup).map(t => `${src.split('\n')[t.line].substr(t.start, t.length)}:${t.kind}`);

describe('scanMdTokens', () => {
    it('finds iterator declarations', () => {
        assert.deepStrictEqual(found('(define_code_iterator any_extend\t[sign_extend zero_extend])'), ['any_extend:iterator']);
        assert.deepStrictEqual(found('(define_code_iterator any_fix\t\t[fix unsigned_fix])'), ['any_fix:iterator']);
    });

    it('finds the attribute name at its declaration', () => {
        assert.deepStrictEqual(found('(define_mode_attr wa_v [(SF "wa") (DF "wa")'), ['wa_v:attribute']);
    });

    it('does not colour an attribute name used bare', () => {
        assert.deepStrictEqual(found('(set_attr "x" "wa_v")'), []);
    });

    it('finds <attr> and <ITER:attr> inside strings', () => {
        assert.deepStrictEqual(found('(define_insn "<wa_v>_add<mode_name>"'), ['wa_v:attribute', 'mode_name:attribute']);
        assert.deepStrictEqual(found('"x<GPR:mode_name>y"'), ['GPR:iterator', 'mode_name:attribute']);
    });

    it('finds iterators used as RTL codes in code but not as plain words in strings', () => {
        assert.deepStrictEqual(found('(any_extend:DI (match_operand 1))'), ['any_extend:iterator']);
        assert.deepStrictEqual(found('"any_extend is a word here"'), []);
    });

    it('ignores comments, including after code', () => {
        assert.deepStrictEqual(found(';; any_extend in a comment <wa_v>'), []);
        assert.deepStrictEqual(found('(foo any_fix) ; any_extend'), ['any_fix:iterator']);
    });

    it('is not fooled by a semicolon inside a string', () => {
        assert.deepStrictEqual(found('"a;b" any_fix'), ['any_fix:iterator']);
    });

    it('ignores unknown names', () => {
        assert.deepStrictEqual(found('(set (reg:SI 1) <unknown>)'), []);
    });

    it('reports exact columns', () => {
        const [t] = scanMdTokens(['(x <wa_v>)'], lookup);
        assert.deepStrictEqual([t.line, t.start, t.length], [0, 4, 4]);
    });
});
