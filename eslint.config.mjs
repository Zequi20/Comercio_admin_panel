import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // Compiled output of `npm test`.
  { ignores: [".test-dist/**"] },
  ...nextVitals,
  ...nextTypescript,
];

export default eslintConfig;
