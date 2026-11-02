import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // `serif` is kept as an alias of the display face so existing
        // `font-serif` headings pick up the new type without a sweep.
        display: ["var(--font-display)", "var(--font-arabic)", "Archivo", "system-ui", "sans-serif"],
        serif: ["var(--font-display)", "var(--font-arabic)", "Archivo", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "var(--font-arabic)", "Geist", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "Geist Mono", "ui-monospace", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        cream: "hsl(var(--cream))",
        warm: {
          DEFAULT: "hsl(var(--warm))",
          dark: "hsl(var(--warm-dark))",
        },
        copper: "hsl(var(--copper))",
        gold: "hsl(var(--gold))",
        ink: "hsl(var(--nl-cacao))",
        slate: "hsl(var(--nl-russet))",
        paper: "hsl(var(--nl-linen))",
        kraft: {
          DEFAULT: "hsl(var(--nl-amber))",
          text: "hsl(var(--nl-amber-text))",
        },
        carbon: "hsl(var(--nl-espresso))",
        board: "hsl(var(--nl-linen))",
        stock: {
          paper: "hsl(var(--stock-paper))",
          leather: "hsl(var(--stock-leather))",
          hardware: "hsl(var(--stock-hardware))",
          finishing: "hsl(var(--stock-finishing))",
          packaging: "hsl(var(--stock-packaging))",
          trims: "hsl(var(--stock-trims))",
          craft: "hsl(var(--stock-craft))",
        },
        nl: {
          linen: "hsl(var(--nl-linen))",
          pearl: "hsl(var(--nl-pearl))",
          cacao: "hsl(var(--nl-cacao))",
          russet: "hsl(var(--nl-russet))",
          amber: "hsl(var(--nl-amber))",
          espresso: "hsl(var(--nl-espresso))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        lift: "var(--shadow-lift)",
      },
    },
  },
  plugins: [],
};

export default config;
