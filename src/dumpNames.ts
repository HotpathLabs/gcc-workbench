/*
 * Copyright (C) 2025 Kishan Parmar
 *
 * This file is part of GCC Workbench.
 *
 * GCC Workbench is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

export const DUMP_REGEX = /^(.+)\.(\d{3})([tri])\.(.+)$/;

/** Source extensions GCC accepts; used to recognise the bare `a-` output prefix. */
const SOURCE_EXT_REGEX = /\.(c|cc|cpp|cxx|c\+\+|C|i|ii|s|S|f|f90|go|d)$/;

/**
 * Maps a dump base name to the source file it belongs to.
 *
 * GCC prefixes dump names with `<output>-` when it compiles and links in one
 * step (`gcc x.c -o a.out` gives `a-x.c.*`, `-o prog` gives `prog-x.c.*`).
 * The prefix is stripped only when the rest is known to be a real source,
 * i.e. another dump set or a file exists with that name, or the prefix is the
 * default `a-` and the rest has a source extension. Otherwise `my-file.c`
 * would wrongly split into `my-` and `file.c`.
 */
export function sourceKeyOf(base: string, knownBases: Set<string>,
                     dirFiles: Set<string>): string {
  for (let i = base.indexOf('-'); i > 0; i = base.indexOf('-', i + 1)) {
    const rest = base.slice(i + 1);
    if (!rest)
      continue;
    if (knownBases.has(rest) || dirFiles.has(rest) ||
        (base.slice(0, i) === 'a' && SOURCE_EXT_REGEX.test(rest))) {
      return rest;
    }
  }
  return base;
}
