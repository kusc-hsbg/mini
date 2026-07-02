import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0e1525",
        panel: "#161e31",
        panel2: "#1f2940",
        accent: "#6c8cff",
        accent2: "#34d399",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Apple SD Gothic Neo", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
