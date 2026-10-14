/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
// Typen der gemeinsam genutzten Palette-Quelle (Implementierung: assets/palette.mjs).
export declare const ACCENT: string;
export declare const MOCKUP_PRESET: { name: string; fur: string; outline: string; eyes: string };
export declare function MIX_HEX(from: string, to: string, t: number): string;
export declare function buildPalette(fur: string, outline: string, eyes: string): Record<string, string>;
export declare function buildCompanionPalette(fur: string, outline: string, eyes: string): Record<string, string>;
