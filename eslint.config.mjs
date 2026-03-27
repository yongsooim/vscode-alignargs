import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

export default [
	{
		ignores: ['out/**', '.vscode-test/**', 'node_modules/**'],
	},
	js.configs.recommended,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
			},
			globals: {
				...globals.node,
				...globals.mocha,
			},
		},
		plugins: {
			'@typescript-eslint': tsPlugin,
		},
		rules: {
			'curly': 'warn',
			'eqeqeq': 'warn',
			'no-throw-literal': 'warn',
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
		},
	},
];
