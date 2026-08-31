import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // `lab/` is the spatial-engine workbench: prototypes against
    // third-party graph engines, deliberately outside the app's build and
    // its dependency tree. Linting it against next/core-web-vitals would be
    // linting a standalone canvas experiment as if it were a React page.
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "lab/**"],
  },
];

export default eslintConfig;
