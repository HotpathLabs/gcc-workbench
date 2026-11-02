/*
 * Script to pre-compile GCC definitions into JSON.
 * Usage: node scripts/generate_rtl_json.js
 * * Features:
 * - Parses rtl.def (Converts keys to LOWERCASE to match dump format)
 * - Parses reg-notes.def (Keeps UPPERCASE)
 * - Parses insn-notes.def (Keeps UPPERCASE)
 * - Supports shared documentation & whitespace preservation
 */

const fs = require('fs');
const path = require('path');

// Paths
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUT_FILE = path.join(DATA_DIR, 'rtl_definitions.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
    console.error(`Error: 'data' directory not found at ${DATA_DIR}`);
    process.exit(1);
}

// Global Definitions Map
const definitions = {};

// ----------------------------------------------------------------------------
// 1. Helper: Text Formatter (Golden Rule #2: Preserve Spaces)
// ----------------------------------------------------------------------------
function formatComment(rawLines) {
    return rawLines
        .map(line => {
            // Remove /* and preceding whitespace
            let clean = line.replace(/^\s*\/\*+/, '');
            
            // Remove */ and trailing whitespace
            clean = clean.replace(/\*+\/\s*$/, '');
            
            // Remove leading '*' decoration common in C blocks (e.g. " * Text")
            clean = clean.replace(/^\s*\*\s?/, '');

            return clean; // Retain all other internal spaces
        })
        .filter((line, index, arr) => {
            // Remove empty lines only from the absolute start/end
            if (line.trim() === '' && (index === 0 || index === arr.length - 1)) return false;
            return true;
        })
        .join('  \n'); // Markdown Hard Break
}

// ----------------------------------------------------------------------------
// 2. Helper: Documentation Extractor (Golden Rule #1: Shared Docs)
// ----------------------------------------------------------------------------
function extractDoc(lines, currentIndex, isDefFn, normalizeKeyFn) {
    // 1. Look Backwards
    // A single blank line may separate a doc comment from its definition
    // (e.g. define_c_enum). Once a blank has been crossed only a comment may
    // follow: another definition or code there means the doc is not ours.
    let crossedBlank = false;
    for (let j = currentIndex - 1; j >= 0; j--) {
        const prevLine = lines[j].trim();

        if (prevLine === '') {
            if (crossedBlank) break; // Two blanks: nothing is attached
            crossedBlank = true;
            continue;
        }
        if (prevLine.startsWith('#')) continue; // Ignore preprocessor

        if (crossedBlank && !prevLine.endsWith('*/')) break;

        // CASE A: Inheritance (Shared Documentation)
        if (isDefFn(prevLine)) {
            const rawName = isDefFn(prevLine);
            if (rawName) {
                const prevKey = normalizeKeyFn(rawName);
                if (definitions[prevKey]) {
                    return definitions[prevKey]; // Return the parent's doc
                }
            }
            continue;
        }

        // CASE B: Found a Comment Block
        if (prevLine.endsWith('*/')) {
            let commentLines = [];
            // Scan backwards for the start of the comment /*
            for (let k = j; k >= 0; k--) {
                const commentLine = lines[k]; // Keep original indentation
                commentLines.unshift(commentLine);
                if (commentLine.trim().startsWith('/*')) break;
            }
            return formatComment(commentLines);
        }
    }
    return undefined;
}

// ----------------------------------------------------------------------------
// 3. Parsers
// ----------------------------------------------------------------------------

function parseRtlDef() {
    const filePath = path.join(DATA_DIR, 'rtl.def');
    if (!fs.existsSync(filePath)) return console.warn('Warning: rtl.def not found.');

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Regex: DEF_RTL_EXPR(NAME, ...)
    const regex = /DEF_RTL_EXPR\s*\(\s*([A-Z0-9_]+)\s*,/;
    
    const checkDef = (line) => {
        const m = regex.exec(line);
        return m ? m[1] : null;
    };
    
    // FIX: RTL codes must be LOWERCASE to match dump files (e.g., "insn", "set")
    const normKey = (name) => name.toLowerCase();

    lines.forEach((line, i) => {
        const name = checkDef(line);
        if (name) {
            const finalKey = normKey(name);
            const doc = extractDoc(lines, i, checkDef, normKey);
            definitions[finalKey] = doc || `**${finalKey}**`;
        }
    });
    console.log(`Parsed rtl.def (Converted to lowercase keys)`);
}

function parseRegNotes() {
    const filePath = path.join(DATA_DIR, 'reg-notes.def');
    if (!fs.existsSync(filePath)) return console.warn('Warning: reg-notes.def not found.');

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    const regex = /(?:REG_NOTE|REG_CFA_NOTE)\s*\(\s*([A-Z0-9_]+)\s*\)/;

    const checkDef = (line) => {
        const m = regex.exec(line);
        return m ? m[1] : null;
    };
    // Notes stay UPPERCASE (e.g., "REG_DEAD")
    const normKey = (name) => "REG_" + name; 

    lines.forEach((line, i) => {
        const name = checkDef(line);
        if (name) {
            const finalKey = normKey(name);
            const doc = extractDoc(lines, i, checkDef, normKey);
            definitions[finalKey] = doc || `**${finalKey}**`;
        }
    });
    console.log(`Parsed reg-notes.def`);
}

function parseInsnNotes() {
    const filePath = path.join(DATA_DIR, 'insn-notes.def');
    if (!fs.existsSync(filePath)) return console.warn('Warning: insn-notes.def not found.');

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    const regex = /INSN_NOTE\s*\(\s*([A-Z0-9_]+)\s*\)/;

    const checkDef = (line) => {
        const m = regex.exec(line);
        return m ? m[1] : null;
    };
    // Insn notes stay UPPERCASE (e.g., "NOTE_INSN_BASIC_BLOCK")
    const normKey = (name) => "NOTE_INSN_" + name;

    lines.forEach((line, i) => {
        const name = checkDef(line);
        if (name) {
            const finalKey = normKey(name);
            const doc = extractDoc(lines, i, checkDef, normKey);
            definitions[finalKey] = doc || `**${finalKey}**`;
        }
    });
    console.log(`Parsed insn-notes.def`);
}

// ----------------------------------------------------------------------------
// 4. Execution
// ----------------------------------------------------------------------------

parseRtlDef();
parseRegNotes();
parseInsnNotes();

fs.writeFileSync(OUT_FILE, JSON.stringify(definitions, null, 2));
console.log(`\nSuccessfully generated ${OUT_FILE}`);
console.log(`Total Definitions: ${Object.keys(definitions).length}`);