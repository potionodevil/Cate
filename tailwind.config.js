/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-primary)",
        foreground: "var(--text-primary)",
        card: "var(--bg-elevated)",
        "card-foreground": "var(--text-primary)",
        popover: "var(--bg-elevated)",
        "popover-foreground": "var(--text-primary)",
        primary: "var(--accent)",
        "primary-foreground": "var(--accent-ink)",
        secondary: "var(--bg-elevated-2)",
        "secondary-foreground": "var(--text-primary)",
        muted: "var(--bg-elevated-2)",
        "muted-foreground": "var(--text-secondary)",
        accent: "var(--bg-hover)",
        "accent-foreground": "var(--text-primary)",
        destructive: "var(--danger)",
        "destructive-foreground": "#fff",
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--accent)",
        success: "var(--success)",
        warning: "var(--warning)"
      },
      borderColor: { DEFAULT: "var(--border)" },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)"
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)"
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};
