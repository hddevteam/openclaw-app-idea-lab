import js from "@eslint/js";
import ts from "typescript-eslint";

export default [
    js.configs.recommended,
    ...ts.configs.recommended,
    {
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "error"
        },
        languageOptions: {
            globals: {
                process: "readonly",
                __dirname: "readonly",
                module: "readonly",
                require: "readonly",
                console: "readonly",
                window: "readonly",
                document: "readonly"
            }
        }
    }
];
