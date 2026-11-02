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

/**
 * Linker format types supported by the extension
 */
export type LinkerType = 'gnu-ld' | 'gnu-gold' | 'lld' | 'ld64' | 'generic';

/**
 * Detected linker format information
 */
export interface LinkerFormat {
    type: LinkerType;
    version?: string;
    features: string[];
    confidence: number; // 0-100
}

/**
 * Interface for format detectors
 */
export interface FormatDetector {
    readonly name: string;
    readonly type: LinkerType;
    
    /**
     * Calculate confidence score for this format
     * @param text Map file content
     * @returns Confidence score 0-100
     */
    detect(text: string): number;
    
    /**
     * Extract format details if this is the detected format
     * @param text Map file content
     * @returns Format information or null
     */
    extractFormat(text: string): LinkerFormat | null;
}

/**
 * Registry for format detectors
 */
export class FormatDetectorRegistry {
    private detectors: FormatDetector[] = [];
    
    /**
     * Register a format detector
     */
    register(detector: FormatDetector): void {
        this.detectors.push(detector);
    }
    
    /**
     * Detect the format of a map file
     * @param text Map file content
     * @returns Detected format or null if no detector is confident enough
     */
    detectFormat(text: string): LinkerFormat | null {
        let bestDetector: FormatDetector | null = null;
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
    getDetectors(): FormatDetector[] {
        return [...this.detectors];
    }
}

/**
 * Global format detector registry
 */
export const formatRegistry = new FormatDetectorRegistry();

// Made with Bob
