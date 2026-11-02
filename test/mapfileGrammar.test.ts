import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vsctm from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';

const ROOT = path.join(__dirname, '..', '..');

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
            fs.readFileSync(path.join(ROOT, 'syntaxes', 'mapfile.tmLanguage.json'), 'utf8'), 'mapfile.json'),
    });
    grammar = (await registry.loadGrammar('source.mapfile'))!;
});

/** Scope of the first token whose text equals `text` on a single line. */
function scopeOf(input: string, text: string): string | undefined {
    // Multi-line input is tokenized in order; the last line is the one inspected.
    let stack = vsctm.INITIAL;
    let tokens: vsctm.IToken[] = [];
    let line = '';
    for (line of input.split('\n')) {
        const r = grammar.tokenizeLine(line, stack);
        stack = r.ruleStack;
        tokens = r.tokens;
    }
    const tok = tokens.find(t => line.slice(t.startIndex, t.endIndex).trim() === text);
    return tok?.scopes[tok.scopes.length - 1].replace(/\.mapfile$/, '');
}

describe('mapfile grammar', () => {
    const cases: Array<[string, string, string]> = [
        ['.text           0x0000000000001060      0xa41', '.text', 'entity.name.section.output'],
        ['.text           0x0000000000001060      0xa41', '0x0000000000001060', 'constant.numeric.address'],
        ['.text           0x0000000000001060      0xa41', '0xa41', 'constant.numeric.size'],
        [' .text          0x0000000000001086        0x0 /usr/lib/crti.o', '.text', 'entity.name.section.input'],
        [' .text          0x0000000000001086        0x0 /usr/lib/crti.o', 'crti.o', 'entity.name.filename.object'],
        ['                0x0000000000001159                sum_array', 'sum_array', 'entity.name.function.symbol'],
        ['                0x0000000000001060                _start', '_start', 'support.variable.builtin'],
        ['                0x0000000000001040                strlen@@GLIBC_2.2.5', 'strlen', 'entity.name.function.imported'],
        ['                0x0000000000001040                strlen@@GLIBC_2.2.5', '@@GLIBC_2.2.5', 'variable.other.version'],
        ['                0x0000000000001030                __strcat_chk@@GLIBC_2.3.4', '__strcat_chk', 'entity.name.function.imported'],
        ['                0x0000000000003fe8                _GLOBAL_OFFSET_TABLE_', '_GLOBAL_OFFSET_TABLE_', 'support.variable.builtin'],
        ['                0x0000000000004018                __dso_handle', '__dso_handle', 'support.variable.builtin'],
        ['                0x000000000041fde8                . = DATA_SEGMENT_ALIGN (CONSTANT (MAXPAGESIZE), CONSTANT (COMMONPAGESIZE))', 'DATA_SEGMENT_ALIGN', 'support.function.linker'],
        ['                0x000000000041fde8                . = DATA_SEGMENT_ALIGN (CONSTANT (MAXPAGESIZE), CONSTANT (COMMONPAGESIZE))', 'MAXPAGESIZE', 'support.constant.linker'],
        ['                0x0000000000003fe8                . = DATA_SEGMENT_RELRO_END (., (SIZEOF (.got.plt) >= 0x18)?0x18:0x0)', 'DATA_SEGMENT_RELRO_END', 'support.function.linker'],
        ['                0x0000000000006030                . = DATA_SEGMENT_END (.)', 'DATA_SEGMENT_END', 'support.function.linker'],
        ['                0x0000000000002000                . = SEGMENT_START ("rodata-segment", 0x0)', 'SEGMENT_START', 'support.function.linker'],
        [' *(LARGE_COMMON)', 'LARGE_COMMON', 'support.constant.linker'],
        [' *(COMMON)', 'COMMON', 'support.constant.linker'],
        ['                [!provide]                        PROVIDE (__etext = .)', 'PROVIDE', 'keyword.control.linker'],
        ['                [!provide]                        PROVIDE (__etext = .)', '__etext', 'support.variable.builtin'],
        [' *fill*         0x0000000000001086        0xa', '*fill*', 'comment.line.annotation'],
        ['LOAD /usr/lib/gcc/x86_64-pc-linux-gnu/16/libgcc.a', 'LOAD', 'keyword.control.linker'],
        ['Memory Configuration\n\nName             Origin             Length             Attributes\nFLASH           0x08000000         0x00100000         xr', 'FLASH', 'entity.name.type.region'],
        ['Memory Configuration\n\nName             Origin             Length             Attributes\nFLASH           0x08000000         0x00100000         xr', 'xr', 'storage.modifier.attribute'],
        ['Memory Configuration', 'Memory Configuration', 'markup.heading'],
        ['__ram_noinit$$ 0x20000000 0x10', '__ram_noinit$$', 'entity.name.section.output'],
    ];
    for (const [line, text, expected] of cases) {
        it(`${JSON.stringify(text)} in ${JSON.stringify(line.split('\n').pop()!.trim().slice(0, 40))} is ${expected}`, () => {
            assert.strictEqual(scopeOf(line, text), expected);
        });
    }

    it('leaves no meaningful token unscoped in the Linux sample maps', () => {
        for (const name of ['Aarch64.map', 'PowerPC.map', 'X86_64.map']) {
            const lines = fs.readFileSync(path.join(ROOT, 'testcase', name), 'utf8').split('\n');
            let stack = vsctm.INITIAL;
            const unscoped: string[] = [];
            lines.forEach((line, i) => {
                const r = grammar.tokenizeLine(line, stack);
                stack = r.ruleStack;
                for (const t of r.tokens) {
                    const txt = line.slice(t.startIndex, t.endIndex);
                    if (txt.trim() && t.scopes.length === 1 && /[A-Za-z0-9_]/.test(txt)) {
                        unscoped.push(`${name}:${i + 1} ${JSON.stringify(txt)}`);
                    }
                }
            });
            assert.deepStrictEqual(unscoped, []);
        }
    });
});
