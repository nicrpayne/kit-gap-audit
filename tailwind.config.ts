import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // Tailwind's preflight paints every unstyled border #e5e7eb — a light
      // grey chosen for light backgrounds. It was invisible while the
      // Workbench was cream and every instrument stated its own colours;
      // with the Workbench retired, that default is the one place the old
      // palette still leaks through, as a bright hairline wherever a
      // `divide-y` or a bare `border` appears on a dark panel. The default
      // follows the application. Anything that names its own border colour
      // is unaffected.
      borderColor: {
        DEFAULT: "var(--i-border)",
      },
    },
  },
  plugins: [],
};

export default config;
