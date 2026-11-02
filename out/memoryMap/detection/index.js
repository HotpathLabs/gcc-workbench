"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LldDetector = exports.GnuLdDetector = exports.formatRegistry = void 0;
exports.initializeFormatDetectors = initializeFormatDetectors;
const formatDetector_1 = require("./formatDetector");
const gnuLdDetector_1 = require("./gnuLdDetector");
const lldDetector_1 = require("./lldDetector");
/**
 * Initialize format detectors
 * Call this once during extension activation
 */
function initializeFormatDetectors() {
    // Register detectors in priority order
    // More specific detectors should be registered first
    formatDetector_1.formatRegistry.register(new lldDetector_1.LldDetector());
    formatDetector_1.formatRegistry.register(new gnuLdDetector_1.GnuLdDetector());
    // TODO: Add GnuGoldDetector, Ld64Detector, GenericDetector
}
// Re-export for convenience
var formatDetector_2 = require("./formatDetector");
Object.defineProperty(exports, "formatRegistry", { enumerable: true, get: function () { return formatDetector_2.formatRegistry; } });
var gnuLdDetector_2 = require("./gnuLdDetector");
Object.defineProperty(exports, "GnuLdDetector", { enumerable: true, get: function () { return gnuLdDetector_2.GnuLdDetector; } });
var lldDetector_2 = require("./lldDetector");
Object.defineProperty(exports, "LldDetector", { enumerable: true, get: function () { return lldDetector_2.LldDetector; } });
// Made with Bob
//# sourceMappingURL=index.js.map