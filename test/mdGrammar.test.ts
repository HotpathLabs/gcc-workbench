import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vsctm from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';

const ROOT = path.join(__dirname, '..', '..');
let grammar: vsctm.IGrammar;

function loadMdGrammar() { return (async () => {
    // Shares the oniguruma WASM with the other grammar tests; loading twice throws.
    const wasm = fs.readFileSync(path.join(ROOT, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm'));
    try {
        await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
    } catch { /* already initialised */ }
    const registry = new vsctm.Registry({
        onigLib: Promise.resolve({
            createOnigScanner: (s: string[]) => new oniguruma.OnigScanner(s),
            createOnigString: (s: string) => new oniguruma.OnigString(s),
        }),
        loadGrammar: async () => vsctm.parseRawGrammar(
            fs.readFileSync(path.join(ROOT, 'syntaxes', 'md.tmLanguage.json'), 'utf8'), 'md.json'),
    });
    grammar = (await registry.loadGrammar('source.gcc.md'))!;
})(); }

function scopeOf(line: string, text: string): string | undefined {
    const r = grammar.tokenizeLine(line, vsctm.INITIAL);
    const t = r.tokens.find(tok => line.slice(tok.startIndex, tok.endIndex) === text);
    return t?.scopes[t.scopes.length - 1];
}

describe('md grammar - rtl.def directives are highlighted', () => {
    before(loadMdGrammar);

    const directives = [
        'automata_option', 'define_reservation', 'exclusion_set', 'presence_set', 'final_presence_set',
        'absence_set', 'final_absence_set', 'define_enum_attr', 'define_subst', 'define_subst_attr',
        'define_insn_and_rewrite', 'define_special_predicate', 'define_special_memory_constraint',
        'define_relaxed_memory_constraint', 'define_c_enum', 'define_enum', 'define_constants',
    ];
    for (const d of directives) {
        it(d, () => {
            const scope = scopeOf(`(${d} "x" [`, d);
            assert.ok(scope && scope.startsWith('keyword.control.define'), `${d} -> ${scope}`);
        });
    }

    it('automata_option shares the scheduling colour', () => {
        assert.strictEqual(scopeOf('(automata_option "no-minimization")', 'automata_option'),
                           scopeOf('(define_automaton "a")', 'define_automaton'));
    });
});
