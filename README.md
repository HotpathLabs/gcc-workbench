# GCC Workbench

<p align="center">
  <img src="https://raw.githubusercontent.com/RegAlloc/gcc-workbench/main/pictures/gcc.png" alt="GCC Workbench Logo" width="300"/>
</p>

**Extension version:** 2.1.0

> [!WARNING]
> **Dataflow analysis and the language server features for RTL and GIMPLE dumps are experimental.** You may run into bugs or inaccuracies. We have tried hard to get them right, but if you find a problem, please [open an issue](https://github.com/HotpathLabs/gcc-workbench/issues). Describe what you saw and what you expected. A testcase or the pass dump that shows the problem helps a lot. Thank you!

This repository contains **GCC Workbench**, a Visual Studio Code / VSCodium extension designed to make life easier for GCC compiler engineers.

It goes beyond simple syntax highlighting for **GCC internals** by adding navigation, visualization, and noise-filtering tools specifically tailored for GCC's internal dump files (`.rtl`, `.gimple`, `.md`), plus **linker memory map visualization** for embedded development.


## What is this useful for?

GCC produces hundreds of dump files during compilation. Navigating them manually is tedious, and reading them is often cluttered with debug noise. This extension organizes that chaos into a simple workspace.

---

## Key Features

### 📊 Stack Usage Analysis (NEW!)
Analyze function stack usage directly in your editor with GCC's `-fstack-usage` output!

**Features:**
* **Toggle button** in editor toolbar (pulse icon) - click to enable/disable stack usage analysis
* **Disabled by default** - only activates when you need it
* **File-specific loading** - automatically loads the `.su` file for the currently active C/C++ file
* **Auto-refresh on tab switch** - seamlessly updates when switching between files
* **Two tree views** in GCC Explorer:
  * **GCC Stack Usage** - Shows all functions sorted by stack usage (dynamic/static categories)
  * **Current File Stack Usage** - Shows functions in the active file only
* **Code lens annotations** - Inline stack usage information above each function
* **Smart file detection** - For `testcase.c`, automatically looks for `a-testcase.su` or `testcase.su`

**Usage:**
1. Compile your code with `-fstack-usage` flag: `gcc -fstack-usage -o program program.c`
2. Open a C/C++ file in VS Code
3. Click the pulse icon (⚡) in the editor title bar to enable stack usage analysis
4. View stack usage in the GCC Explorer sidebar and as code lenses
5. Switch between files - data automatically updates for each file

**File Naming Convention:**
The extension looks for `.su` files matching your source file:
- For `myfile.c` → looks for `a-myfile.su` or `myfile.su`
- For `test.cpp` → looks for `a-test.su` or `test.su`

### 🗺️ Memory Map Visualization
Visualize GCC linker map files (`.map`) and linker scripts (`.ld`) with an interactive graphical memory map — perfect for embedded systems development across **ALL architectures**!

**Features:**
* **Toggle button** in editor toolbar - click to open/close memory map panel
* **Color-coded memory regions** showing proportional section sizes at a glance
* **Interactive drill-down** - click any section to view all symbols with their addresses and sizes
* **Symbol search** with instant navigation to definitions in your source code
* **Statistics panel** showing flash/RAM usage, top 10 largest symbols, and discarded sections
* **Editor decorations** - color-coded section highlighting in `.map` files
* **Find in Memory Map** - right-click any symbol in your source code to locate it in the memory map

**Universal Architecture Support:**
Works with ANY GCC-based toolchain - ARM (Cortex-M, Cortex-A), AVR, ESP32, STM32, RISC-V, PowerPC, MIPS, AArch64, x86, x86_64, and more! If GCC can compile for it, we can visualize its memory map.

### Source <-> RTL Mapping

![Source <-> RTL Mapping Preview](https://raw.githubusercontent.com/RegAlloc/gcc-workbench/main/pictures/source-rtl.png)

### Instant Hover Documentation
Understand GCC internals without leaving the editor.
* **RTL Definitions:** Hover over ir insns like `set`, `parallel`, or regnotes `REG_DEAD` to see their official documentation (parsed from `rtl.def` and `reg-notes.def`).
* **Gimple Definitions:** Same as above, but for gimple.
![Documentation Preview](https://raw.githubusercontent.com/RegAlloc/gcc-workbench/main/pictures/documentation.png)

---

## 🔧 Workbench Tools

### 1. Compilation Pass Explorer
Instead of `ls -ltr *expand*`, use the **GCC Explorer** sidebar view.
* Automatically finds all GCC dump files (`.t`, `.r`, `.i`) in your workspace.
* Sorts them chronologically by pass number (e.g., `005t` -> `300r`).
* Filters passes by type (GIMPLE vs RTL) or name.

![Explorer Preview](https://raw.githubusercontent.com/RegAlloc/gcc-workbench/main/pictures/Explorer.png)

### 2. Pass Navigation ("Surfing")
Move through the compilation pipeline without leaving the editor.
* **Next/Prev Pass:** Click the arrow icons in the editor title bar (or use `Ctrl+Alt+]` / `Ctrl+Alt+[`) to jump to the immediate next or previous pass file.
* **Context Aware:** Automatically detects if you are in a GIMPLE or RTL file and finds the correct successor.

### 3. Stack Usage Commands
* **Toggle Stack Usage Analysis:** Enable/disable stack usage analysis (pulse icon in editor toolbar)
* **Reload Stack Usage Files:** Manually refresh the current file's stack usage data

### 4. Memory Map Commands
* **Show Memory Map:** Open the graphical memory map visualization
* **Refresh Memory Map:** Re-parse the current `.map` or `.ld` file
* **Find in Memory Map:** Right-click any symbol in source code to locate it in the memory map

### 5. Pass Diff
* **Compare with Previous:** One-click button to open a diff view against the previous pass.
* Instantly visualize exactly what optimizations were performed by a specific pass.

![Diff View](https://raw.githubusercontent.com/RegAlloc/gcc-workbench/main/pictures/Diff-view.png)

### 6. Focus Mode (Noise Filter)
RTL and GIMPLE dumps are often 50% metadata.
* **Toggle Noise:** Click the **Eye Icon** to fade `comment` lines, basic block headers and pass logging (combine's `Trying …` listings, IRA/LRA diagnostics, candidate RTL).
* REG notes and the insn chain of `-slim` dumps stay visible.
* Helps you focus purely on the instruction logic and data flow.

### 7. Control Flow Visualization
* **Open Graph:** One-click button to render the current dump as a Control Flow Graph (CFG) using Graphviz.
* *Note: Requires a generic Graphviz/DOT extension to be installed for the final rendering.*

![CFG Preview](https://raw.githubusercontent.com/RegAlloc/gcc-workbench/main/pictures/cfg.png)

### 8. Intelligent MDL/RTL Editing
* **Go to Definition:** Jump from iterator usages or attribute names in `.md` files directly to their definitions.
* **Hovers:** Hover over standard RTL codes (like `define_insn`, `parallel`, `set`) to view their official documentation (parsed directly from `rtl.def`).
* **Iterator colours:** `define_*_iterator` and `define_*_attr` names, and their `<attr>` uses, get their own colours.

### 9. Dump Navigation (RTL and GIMPLE)
A language server for dump files. It works on the dump text alone (no `.dot` files, no GCC run), for both full and `-slim` RTL and every GIMPLE pass.

**Everywhere**
* **Go to Definition** jumps to the definitions that actually *reach* the spot you clicked, following the control flow graph (CFG).
* **Find All References** and **highlights** list every def and use; hover tells which one you are on (*written here*, *read here*, *address taken here*).
* **Hover** shows the type or mode, the reaching defs and the uses they reach, with clickable links to each line.
* **Outline and breadcrumbs** list the functions and their basic blocks.
* Names mentioned in pass logging (combine's `Trying 3 -> 11:`, VRP, DOM, ...) link back to the function body.

**RTL**
* **Registers:** reaching defs follow the dump's `;; pred/succ` edges, or jumps and barriers when the dump has none. Hover shows mode, flags, hard reg, debug names, reaching defs and reached uses.
* **Partial stores** (`strict_low_part`, `zero_extract`, multi-word `subreg`, `cond_exec`) keep earlier defs alive.
* **Calls** clobber the call-used hard registers, narrowed per call under `-fipa-ra` using the dump's `;; lr def`.
* **Insn uids:** prev/next fields, `label_ref`, `-> N`, `L22`, `insn_list` and log lines jump to the insn; hover previews it.
* **Basic blocks:** click a block number (the bb field of an insn, `[bb N]`, `;; basic block N`, `pred/succ`, `prev/next block`) to jump to its `NOTE_INSN_BASIC_BLOCK`. Hover shows preds, succs, loop depth and GCC's `lr in`/`lr out`.
* **Hard registers:** a value wider than one register (`(reg:TI 0 x0)`, `V2x4SI` tuples) counts for every register it occupies, and EH landing pads define the EH data registers.
* **RTX flags:** hover a flag such as `/v` in `subreg/s/v`, `reg/v/f`, `mem/c` or `call_insn/i` to see what it means on that code, using the accessor macros in GCC's `rtl.h` (`SUBREG_PROMOTED_UNSIGNED_P`, `REG_POINTER`, `MEM_NOTRAP_P`, `RTL_PURE_CALL_P`, …). Flags that only mean something together are explained together: `/u` and `/v` on a promoted subreg give the extension (`SRP_SIGNED`, `SRP_UNSIGNED`, or `SRP_POINTER` when neither is set), and `/j` and `/c` on a `code_label` give `LABEL_KIND`. A register hover also lists the flags on that occurrence. `-slim` dumps do not print flags.
* **rs6000:** reads both default names (`(reg:DI 3 3)`) and `-mregnames` names (`%r3`, `%f1`, `%v2`, `%cr7`), and sizes values the way `rs6000_hard_regno_nregs` does (IBM long double and `_Decimal128` take an FPR pair, VSX vectors and IEEE 128-bit one register, MMA pairs and accumulators two and four). In `-slim` dumps without `-mregnames`, a hard register prints as a bare number (`%31` is r31, f31 or v31), so those are not tracked. `TFmode` counts as one register, because whether it is IBM or IEEE depends on `-mabi`.
* **Late passes:** insns marked by sched2 (`insn:TI`), blocks after `free_cfg` and passes that print the chain twice (`bbro`) are read from the final chain. Full and `-slim` dumps give the same answers, except where `-slim` leaves information out (call argument registers, `asm` inputs).
* The model is checked against GCC's own `;; lr` sets and `REG_DEAD`/`REG_UNUSED` notes. In passes that rewrite insns after printing those sets (cprop, combine, ...), GCC's sets describe the chain before the change.

**GIMPLE**
* **SSA names:**
  * Go to Definition jumps to the single def: a PHI, an assignment, a call result or an `asm` output.
  * A default def (`x_3(D)`) goes to the parameter in the signature, or to the `-alias` line `int x_3(D) = x;`.
  * Hover shows the type, the variable it versions, `# PT`/`# RANGE` annotations, the def and every use.
* **Variables** (pre-SSA dumps, address-taken locals, statics, globals): reaching definitions over the CFG.
  * A store into part of an object (`s.a = …`, `MEM[(int *)&s + 4B] = …`) keeps the rest of the object alive.
  * `&x` passed to a call may write `x`.
  * `x ={v} {CLOBBER}` ends its life.
  * A variable redeclared in an inner block (`{ int s; … }`) is a separate variable. Hover shows "declared on line N (shadows an outer `s`)".
  * Function `static`s and globals are marked as outliving the call.
* **Telling names apart:**
  * A user variable called `tmp_1` is not an SSA name, while `g.0_2` and `pretmp_35` are.
  * In `# DEBUG x => x_5`, `x` is a debug binding, not a read.
* **Labels:** `<L7>`, `<D.5666>` and user labels jump to their definition.
* **Control flow:** the CFG comes from `-blocks` when present. Otherwise it is built from the statements and checked against the PHI arguments:
  * gotos, switch labels, returns, noreturn calls;
  * `[LP n]` landing pads and `eh_dispatch` catch handlers;
  * `setjmp` and other returns-twice calls (`.ABNORMAL_DISPATCHER` edges; `(ab)` names are marked);
  * a computed `goto`, which only reaches labels whose address is taken (`&&l1`);
  * pre-EH `try`/`finally`/`catch`, whose bodies get edges into their handlers.
* **Dump flags:** works with `-raw` (including multi-line `gimple_asm`, where OUTPUT operands are writes and INPUT operands are reads), `-lineno`, `-uid`, `-alias`, `-vops`, `-eh`, `-blocks`, `-details` and `-all`. C++ names (templates, operators, lambdas, `a#0` parameter packs) are read correctly. `.original` (GENERIC) gets navigation without dataflow.

**Limits.** When the dump cannot settle the CFG, hover says so instead of guessing silently. This happens for C++ exceptions without `-eh` and for `try`/`finally` before EH lowering. Without `-blocks` or `-vops`, a call to your own `noreturn` function still gets a fallthrough edge, because nothing in the dump says it doesn't return. This is conservative: a definition can only seem to reach more places, never fewer.

---

## 🎨 Syntax Highlighting Support

When hacking on GCC, you often need to read and understand complex internal formats. Reading all of this as plain, uncolored text is painful. This extension provides TextMate grammars to support the following:

### 1. Machine Description Files (`.md`)
* **Constructs:** `define_insn`, `define_expand`, `define_split`, `define_peephole2`, iterators, attributes.
* **Operands:** Distinct coloring for registers, modes, and constraints.
* **Embedded Code:** Highlights C/C++ blocks embedded inside MD files.

![GCC Machine Description Preview](https://raw.githubusercontent.com/RegAlloc/gcc-workbench/main/pictures/GCC-Machine-Description.png)

### 2. RTL Dumps (`.expand`, `.vregs`, etc.)
* **Records:** `insn`, `jump_insn`, `call_insn`, `note`, `barrier`, `code_label`, with their flags (`insn/f`, `call_insn/i`, `jump_insn/j`).
* **Data:** Registers with flags (`reg/v/f:DI 108 [ a ]`, `subreg/s/v`), memory references (`mem/c:SI`, `MEM[...]`) in their own colour, vector modes, `const_int`, and every code in `rtl.def`.
* **Logging:** pass diagnostics (combine, IRA, LRA, ...) are coloured as comments, so they stand apart from real RTL. The `-slim` insn chain is coloured as code.

### 3. GIMPLE Dumps (`.ssa`, `.optimized`, etc.)
* **Structure:** Basic blocks, PHI nodes, and SSA names.
* **Statements:** `gimple_call`, `gimple_assign`, `gimple_cond`, `gimple_switch`.
* Navigation and hover for SSA names, variables, labels and blocks are described in [Dump Navigation](#9-dump-navigation-rtl-and-gimple).

### 4. `match.pd` Patterns
* **Rules:** `match` / `simplify` rules.
* **Trees:** Operator trees (e.g., `plus`, `mult`, `bit_and`) and capture logic (`@x`).

![Match Pattern Preview](https://raw.githubusercontent.com/RegAlloc/gcc-workbench/main/pictures/Match.png)

### 5. Additional Formats
* **PowerPC/RS6000 Builtins:** `rs6000-builtin.def` highlighting.
* **Option Files:** `.opt` syntax support.
* **DejaGnu Scripts:** `.exp` syntax support.

---
## Support the Project

GCC Workbench is an open-source labor of love dedicated to making compiler internals accessible and productive.
Maintaining and innovating on these tools requires time and research.

If this extension has improved your workflow or helped you debug a complex RTL issue, consider supporting its ongoing development.

<div align="center">
  <a href="https://www.buymeacoffee.com/RegAlloc">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" >
  </a>
</div>

## License

This project is licensed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)**.

See the [LICENSE](./LICENSE) file for details.

### Credits & Legal
* **DejaGnu expect scripts (.exp) Syntax:** The syntax highlighting for `.exp` files in this extension is a derivative work based on the [vscode-tcl](https://github.com/bitwisecook/vscode-tcl/tree/master) repository by **James Deucker** (Copyright (c) 2019), which is licensed under the **MIT License**.
    * *Modifications:* The original YAML logic was converted to JSON and adapted for GCC DejaGnu expect scripts by Kishan Parmar in 2025.
* **All other files:** Original work licensed under GPL-3.0-or-later.

---

### Project Status & Contributing

The project is now open for the community to utilize, maintain, and evolve.

* **Found a bug?**
    Please raise an issue on the issue tracker:
    [https://github.com/RegAlloc/gcc-workbench/issues](https://github.com/RegAlloc/gcc-workbench/issues)

* **Want to contribute?**
    Everyone is welcome to continue or expand on this project. Feel free to fork the repository and raise a Pull Request here:
    [https://github.com/RegAlloc/gcc-workbench](https://github.com/RegAlloc/gcc-workbench)

### Publisher Trust & Security

This extension is open-source and published by Kishan Parmar.

Source code is publicly available on GitHub and can be audited by anyone.

No telemetry, tracking, or data collection is performed by this extension.
