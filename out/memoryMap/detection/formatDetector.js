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
exports.formatRegistry = exports.FormatDetectorRegistry = void 0;
/**
 * Registry for format detectors
 */
class FormatDetectorRegistry {
    detectors = [];
    /**
     * Register a format detector
     */
    register(detector) {
        this.detectors.push(detector);
    }
    /**
     * Detect the format of a map file
     * @param text Map file content
     * @returns Detected format or null if no detector is confident enough
     */
    detectFormat(text) {
        let bestDetector = null;
        let bestConfidence = 0;
        // Find detector with highest confidence
        for (const detector of this.detectors) {
            const confidence = detector.detect(text);
            if (confidence > bestConfidence) {
                bestConfidence = confidence;
                bestDetector = detector;
            }
        }
        // Require at least 50% confidence
        if (bestDetector && bestConfidence >= 50) {
            return bestDetector.extractFormat(text);
        }
        return null;
    }
    /**
     * Get all registered detectors
     */
    getDetectors() {
        return [...this.detectors];
    }
}
exports.FormatDetectorRegistry = FormatDetectorRegistry;
/**
 * Global format detector registry
 */
exports.formatRegistry = new FormatDetectorRegistry();
// Made with Bob
//# sourceMappingURL=formatDetector.js.map