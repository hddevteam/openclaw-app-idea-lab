import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";

export default [
    js.configs.recommended,
    ...ts.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser
            }
        },
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { 
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
                "caughtErrorsIgnorePattern": "^_"
            }],
            "no-undef": "error"
        }
    }
];
