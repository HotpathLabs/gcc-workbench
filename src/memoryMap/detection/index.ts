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

import { formatRegistry } from './formatDetector';
import { GnuLdDetector } from './gnuLdDetector';
import { LldDetector } from './lldDetector';

/**
 * Initialize format detectors
 * Call this once during extension activation
 */
export function initializeFormatDetectors(): void {
    // Register detectors in priority order
    // More specific detectors should be registered first
    formatRegistry.register(new LldDetector());
    formatRegistry.register(new GnuLdDetector());
    // TODO: Add GnuGoldDetector, Ld64Detector, GenericDetector
}

// Re-export for convenience
export { formatRegistry, FormatDetector, LinkerFormat, LinkerType } from './formatDetector';
export { GnuLdDetector } from './gnuLdDetector';
export { LldDetector } from './lldDetector';

// Made with Bob
