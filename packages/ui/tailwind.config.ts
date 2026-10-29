import type { Config } from "tailwindcss";

const config: Config = {
	darkMode: ["class"],
	content: ["./src/**/*.{ts,tsx}"],
	theme: {
		container: {
			center: true,
			padding: "2rem",
			screens: { "2xl": "1400px" },
		},
		extend: {
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
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))",
				},
				sidebar: {
					DEFAULT: "hsl(var(--sidebar))",
					foreground: "hsl(var(--sidebar-foreground))",
					accent: "hsl(var(--sidebar-accent))",
					muted: "hsl(var(--sidebar-muted))",
				},
				success: {
					DEFAULT: "hsl(var(--success))",
					foreground: "hsl(var(--success-foreground))",
				},
				warning: {
					DEFAULT: "hsl(var(--warning))",
					foreground: "hsl(var(--warning-foreground))",
				},
				// MaterialHub UAE brand palette
				espresso: "hsl(var(--nl-espresso))",
				cacao: "hsl(var(--nl-cacao))",
				russet: "hsl(var(--nl-russet))",
				amber: "hsl(var(--nl-amber))",
				taupe: "hsl(var(--nl-taupe))",
				caramel: "hsl(var(--nl-caramel))",
				pearl: "hsl(var(--nl-pearl))",
				linen: "hsl(var(--nl-linen))",
			},
			borderRadius: {
				lg: "14px",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
				xs: "2px",
			},
			letterSpacing: {
				'wide': '0.22em',
			},
			transitionTimingFunction: {
				'out': 'cubic-bezier(0.2, 0.7, 0.2, 1)',
				'in-out': 'cubic-bezier(0.6, 0.0, 0.2, 1)',
			},
			transitionDuration: {
				'400': '620ms',  /* slow - page transitions */
				'200': '320ms',  /* medium - hover */
			},
		},
	},
	plugins: [],
};

export default config;
