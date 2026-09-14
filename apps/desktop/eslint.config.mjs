import baseConfig from "../../eslint.config.mjs";

export default [
  ...baseConfig,
  {
    ignores: [
      "analysis/dist/**",
    ],
  },
];
