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
    // This preload is deliberately CommonJS: Node loads it with `-r` before
    // the application so HTTP tests never send real report invitation mail.
    files: ["scripts/lib/report-mail-mock.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "lab/rubric-reference/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
