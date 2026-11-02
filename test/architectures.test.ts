import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseMap, isGccMapFile } from '../src/memoryMap/parsers/mapParser';

const DIR = path.join(__dirname, '..', '..', 'testcase');

// Hosted Linux links of testcase.c: no MEMORY command, only "*default*".
const CASES = [
    { file: 'Aarch64.map', textAddr: 0x4005c0, textSize: 2640, discarded: 6 },
    { file: 'PowerPC.map', textAddr: 0x100004e0, textSize: 3472, discarded: 6 },
    { file: 'X86_64.map', textAddr: 0x1060, textSize: 2625, discarded: 5 },
];

for (const c of CASES) {
    describe(`parseMap - ${c.file}`, () => {
        const text = fs.readFileSync(path.join(DIR, c.file), 'utf-8');
        const layout = parseMap(text);

        it('is recognised as a GCC map file', () => {
            assert.strictEqual(isGccMapFile(text), true);
        });

        it('parses .text with the expected address and size', () => {
            const sec = layout.sections.find(s => s.name === '.text');
            assert.ok(sec);
            assert.strictEqual(sec!.address, c.textAddr);
            assert.strictEqual(sec!.size, c.textSize);
            assert.ok(sec!.symbols.length > 0);
        });

        it('synthesizes regions when only *default* is present', () => {
            assert.ok(layout.regions.length >= 1);
            assert.ok(layout.regions.every(r => r.attributes === 'synthesized'));
            assert.ok(layout.regions.every(r => r.used > 0 && r.used <= r.length));
        });

        it('assigns every allocated section to exactly one region', () => {
            const placed = layout.regions.flatMap(r => r.sections);
            assert.strictEqual(new Set(placed).size, placed.length);
            for (const s of layout.sections.filter(s => s.size > 0 && s.address !== 0)) {
                assert.ok(placed.includes(s), `${s.name} was not assigned`);
            }
        });

        it('leaves non-alloc sections (address 0) out of the regions', () => {
            const comment = layout.sections.find(s => s.name === '.comment');
            assert.ok(comment);
            assert.strictEqual(comment!.region, undefined);
        });

        it('counts discarded input sections, including wrapped entries', () => {
            assert.strictEqual(layout.discardedCount, c.discarded);
        });
    });
}
