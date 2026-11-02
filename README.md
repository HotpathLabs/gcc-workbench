# GCC Workbench

<p align="center">
  <img src="https://raw.githubusercontent.com/RegAlloc/gcc-workbench/main/pictures/gcc.png" alt="GCC Workbench Logo" width="300"/>
</p>

**Extension version:** 2.1.0

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
* **Toggle Noise:** Click the **Eye Icon** to hide `comment` lines, basic block headers.
* Helps you focus purely on the instruction logic and data flow.

### 7. Control Flow Visualization
* **Open Graph:** One-click button to render the current dump as a Control Flow Graph (CFG) using Graphviz.
* *Note: Requires a generic Graphviz/DOT extension to be installed for the final rendering.*

![CFG Preview](https://raw.githubusercontent.com/RegAlloc/gcc-workbench/main/pictures/cfg.png)

### 8. Intelligent MDL/RTL Editing
* **Go to Definition:** Jump from iterator usages or attribute names in `.md` files directly to their definitions.
* **Hovers:** Hover over standard RTL codes (like `define_insn`, `parallel`, `set`) to view their official documentation (parsed directly from `rtl.def`).

---

## 🎨 Syntax Highlighting Support

When hacking on GCC, you often need to read and understand complex internal formats. Reading all of this as plain, uncolored text is painful. This extension provides TextMate grammars to support the following:

### 1. Machine Description Files (`.md`)
* **Constructs:** `define_insn`, `define_expand`, `define_split`, `define_peephole2`, iterators, attributes.
* **Operands:** Distinct coloring for registers, modes, and constraints.
* **Embedded Code:** Highlights C/C++ blocks embedded inside MD files.

![GCC Machine Description Preview](https://raw.githubusercontent.com/RegAlloc/gcc-workbench/main/pictures/GCC-Machine-Description.png)

### 2. RTL Dumps (`.expand`, `.vregs`, etc.)
* **Records:** `insn`, `jump_insn`, `call_insn`, `note`, `barrier`, `code_label`.
* **Data:** Registers (`reg:DI 3`), vector modes, `const_int`.

### 3. GIMPLE Dumps (`.ssa`, `.optimized`, etc.)
* **Structure:** Basic blocks, PHI nodes, and SSA names.
* **Statements:** `gimple_call`, `gimple_assign`, `gimple_cond`, `gimple_switch`.

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
