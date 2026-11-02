import * as assert from 'assert';
import { DUMP_REGEX, sourceKeyOf } from '../src/dumpNames';

const key = (base: string, bases: string[] = [], files: string[] = []) =>
    sourceKeyOf(base, new Set(bases), new Set(files));

describe('DUMP_REGEX', () => {
    it('splits base, pass number, kind and pass name', () => {
        const m = DUMP_REGEX.exec('a-testcase.c.297r.combine')!;
        assert.deepStrictEqual([m[1], m[2], m[3], m[4]], ['a-testcase.c', '297', 'r', 'combine']);
    });
    it('keeps .dot as part of the pass name', () => {
        assert.strictEqual(DUMP_REGEX.exec('x.c.266r.expand.dot')![4], 'expand.dot');
    });
    it('rejects non-dump files', () => {
        assert.strictEqual(DUMP_REGEX.exec('testcase.c'), null);
    });
});

describe('sourceKeyOf', () => {
    it('strips the default a- prefix from a source name', () => {
        assert.strictEqual(key('a-testcase.c'), 'testcase.c');
    });
    it('strips a custom output prefix when the source file exists', () => {
        assert.strictEqual(key('prog-testcase.c', [], ['testcase.c']), 'testcase.c');
    });
    it('strips a custom prefix when a plain dump set exists too', () => {
        assert.strictEqual(key('prog-testcase.c', ['prog-testcase.c', 'testcase.c']), 'testcase.c');
    });
    it('does not split a hyphenated source name', () => {
        assert.strictEqual(key('my-file.c'), 'my-file.c');
    });
    it('does not treat a- as a prefix when the rest is not a source', () => {
        assert.strictEqual(key('a-thing'), 'a-thing');
    });
    it('leaves plain names alone', () => {
        assert.strictEqual(key('testcase.c', ['testcase.c']), 'testcase.c');
    });
});
