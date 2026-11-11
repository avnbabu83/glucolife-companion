/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			sans: ['Inter', 'system-ui', 'sans-serif'],
  			display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif']
  		},
  		colors: {
  			// Daily Bento palette: the old emerald/teal classes used across the
  			// screens now resolve to the primary blue (#2F52C9) and teal accent (#0E8F82).
  			emerald: {
  				50: '#EEF2FD', 100: '#DCE4FA', 200: '#B9C8F4', 300: '#8EA5EB', 400: '#5F7DDD',
  				500: '#2F52C9', 600: '#2846AE', 700: '#213A8F', 800: '#1B2F73', 900: '#15255A', 950: '#0F1B33'
  			},
  			teal: {
  				50: '#E7F7F5', 100: '#C6EDE8', 200: '#94DDD4', 300: '#5CC8BB', 400: '#2EAF9F',
  				500: '#0E8F82', 600: '#0B7A6F', 700: '#09645B', 800: '#074F48', 900: '#053B36', 950: '#032623'
  			},
  			// Named Daily Bento scales used by the individual screens: brand = primary blue, mint = teal accent.
  			brand: {
  				50: '#EEF2FD', 100: '#DCE4FA', 200: '#B9C8F4', 300: '#8EA5EB', 400: '#5F7DDD',
  				500: '#2F52C9', 600: '#2846AE', 700: '#213A8F', 800: '#1B2F73', 900: '#15255A', 950: '#0F1B33'
  			},
  			mint: {
  				50: '#E7F7F5', 100: '#C6EDE8', 200: '#94DDD4', 300: '#5CC8BB', 400: '#2EAF9F',
  				500: '#0E8F82', 600: '#0B7A6F', 700: '#09645B', 800: '#074F48', 900: '#053B36', 950: '#032623'
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}