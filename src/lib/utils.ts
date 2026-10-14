/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui's standard class-merging helper: lets components accept a
 * `className` override without fighting Tailwind's specificity rules. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
