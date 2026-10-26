import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: "#087F8C", 50: "#E8F5F6", 100: "#CDEBEE", 200: "#9CD6DC", 500: "#087F8C", 600: "#066B76", 700: "#05555E", 800: "#044148" },
        medblue: { DEFAULT: "#3478C0", 50: "#EBF2FA", 100: "#D4E3F4", 500: "#3478C0", 600: "#2A64A2", 700: "#214F80" },
        navy: { DEFAULT: "#0F2A43", 400: "#5B6F85", 500: "#3B526B", 700: "#1A3550", 900: "#0F2A43" },
        canvas: "#F7FAFC",
        emergency: { DEFAULT: "#D92D20", 50: "#FEF1F0", 100: "#FDDCD9", 600: "#B42318", 700: "#912018" },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', '"IBM Plex Sans"', "system-ui", "-apple-system", "Segoe UI", "Tahoma", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(15,42,67,.06), 0 1px 3px rgba(15,42,67,.08)" },
    },
  },
  plugins: [],
};
export default config;
