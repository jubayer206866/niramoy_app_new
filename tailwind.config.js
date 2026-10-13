/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        xs: "420px",
      },
      colors: {
        // primary — deep violet / indigo ("Niramoy" brand)
        brand: {
          50: "#f3f2ff",
          100: "#e9e6ff",
          200: "#d6d0ff",
          300: "#b8acff",
          400: "#937dff",
          500: "#7b5bf5",
          600: "#6a3df0",
          700: "#5a2bd4",
          800: "#4b25ab",
          900: "#402489",
          950: "#251254",
        },
        // warm accent — golden amber ("coral" kept as the class name for
        // backwards compatibility; `accent` is the readable alias)
        coral: {
          50: "#fff8eb",
          100: "#ffefc6",
          200: "#ffdd88",
          300: "#ffc64a",
          400: "#ffb01f",
          500: "#f99307",
          600: "#dd6f02",
          700: "#b74e06",
          800: "#943d0c",
          900: "#7a330d",
        },
        accent: {
          50: "#fff8eb",
          100: "#ffefc6",
          200: "#ffdd88",
          300: "#ffc64a",
          400: "#ffb01f",
          500: "#f99307",
          600: "#dd6f02",
          700: "#b74e06",
          800: "#943d0c",
          900: "#7a330d",
        },
        mint: "#f7f7fb",
        ink: {
          700: "#43405c",
          800: "#2a2740",
          900: "#17152a",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
        display: ["Sora", "Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.75rem",
        "4xl": "2.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,21,42,.05), 0 1px 3px rgba(23,21,42,.04)",
        soft: "0 2px 6px rgba(23,21,42,.05), 0 14px 30px -18px rgba(23,21,42,.22)",
        lift: "0 24px 48px -24px rgba(106,61,240,.50)",
        glow: "0 0 0 1px rgba(106,61,240,.10), 0 14px 34px -14px rgba(106,61,240,.40)",
        inset: "inset 0 1px 0 0 rgba(255,255,255,.6)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg,#6a3df0 0%,#7b5bf5 55%,#a78bfa 100%)",
        "coral-gradient": "linear-gradient(135deg,#ffb01f 0%,#f99307 100%)",
        "accent-gradient": "linear-gradient(135deg,#ffb01f 0%,#f99307 100%)",
        "mint-fade": "linear-gradient(180deg,#f7f7fb 0%,#ffffff 60%)",
        mesh:
          "radial-gradient(1200px 420px at 8% -12%, rgba(167,139,250,.38), transparent), radial-gradient(900px 420px at 92% -4%, rgba(255,176,31,.24), transparent)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px) scale(.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // opacity-only fade: unlike fadeUp it sets no transform, so fixed
        // descendants (sticky action bars, bottom sheets) stay viewport-anchored
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-500px 0" },
          "100%": { backgroundPosition: "500px 0" },
        },
        pop: {
          "0%": { transform: "scale(.85)", opacity: "0" },
          "70%": { transform: "scale(1.06)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        rise: "rise .28s cubic-bezier(.22,1,.36,1)",
        fadeUp: "fadeUp .45s cubic-bezier(.22,1,.36,1) both",
        fadeIn: "fadeIn .35s ease-out both",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
        pop: "pop .3s cubic-bezier(.22,1,.36,1)",
        marquee: "marquee 26s linear infinite",
      },
    },
  },
  plugins: [],
};
