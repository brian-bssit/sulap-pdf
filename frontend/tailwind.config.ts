import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";
import plugin from "tailwindcss/plugin";

// Tema (terang saja; mode gelap dimatikan) lewat CSS variable: setiap warna Tailwind yang dipakai di UI
// dipetakan ke `--c-<keluarga>-<step>`.
const FAMILIES = ["slate", "red", "amber", "purple", "emerald", "blue", "violet", "indigo", "teal", "rose", "orange"] as const;
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
// Netral terang: slate-400/500 bawaan Tailwind gagal kontras AA sebagai teks 12–14 px (2,5:1 / 4,5:1 di atas latar bertinta).
const SLATE_LIGHT_TEXT: Record<number, string> = { 400: "#66758c", 500: "#56657c" };
const SURFACE = { light: "#fcfcfb" }; // bg-white: off-white

const channels = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

const themed = Object.fromEntries(
  FAMILIES.map((f) => [f, Object.fromEntries(STEPS.map((s) => [s, `rgb(var(--c-${f}-${s}) / <alpha-value>)`]))])
);

const themedText = Object.fromEntries(
  FAMILIES.filter((f) => f !== "slate").map((f) => [f, Object.fromEntries(STEPS.map((s) => [s, `rgb(var(--t-${f}-${s}) / <alpha-value>)`]))])
);

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Self-host (paket npm @fontsource-variable, OFL-1.1) — tanpa CDN, patuh CSP.
        sans: ["'Plus Jakarta Sans Variable'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      textColor: { ...themedText },
      colors: {
        ...themed,
        white: SURFACE.light, // bukan #FFFFFF murni
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#1e3a5f",
        },
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scaleIn 0.2s ease-out",
        shimmer: "shimmer 2s infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      const light: Record<string, string> = { "--surface": channels(SURFACE.light) };
      for (const f of FAMILIES) {
        for (const s of STEPS) {
          const scale = colors[f] as Record<number, string>;
          light[`--c-${f}-${s}`] = channels(f === "slate" ? SLATE_LIGHT_TEXT[s] ?? scale[s] : scale[s]);
          if (f !== "slate") {
            light[`--t-${f}-${s}`] = channels(scale[s]);
          }
        }
      }
      addBase({
        ":root": { ...light, colorScheme: "light" },
      });
    }),
  ],
};
export default config;
