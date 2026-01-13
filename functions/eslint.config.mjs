// Import the core rules plugin
import js from "@eslint/js"; 
import globals from "globals";
// You don't need defineConfig, the array itself is the config

export default [
  // Apply core recommended rules and browser globals to JS/MJS/CJS files
  { 
    files: ["**/*.{js,mjs,cjs}"], 
    languageOptions: { 
      globals: {
        ...globals.browser // Spread browser globals
      } 
    },
    // Use the imported plugin and access its recommended rules
    rules: js.configs.recommended.rules 
  },
  // Specific settings for CommonJS files (if needed)
  { 
    files: ["**/*.js"], 
    languageOptions: { 
      sourceType: "commonjs" 
    } 
  },
];