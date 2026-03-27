import * as assert from 'assert';
import * as vscode from 'vscode';

import { Config } from '../../class/Config';
import { DoAlign, parseCallLine, parseFallbackCallLine, SignatureHelpService } from '../../implement/AlignArgs';

suite('Align Args', () => {
	test('uses signature help context to ignore nested commas', async () => {
		const document = await vscode.workspace.openTextDocument({
			content: 'outer(inner(1, 2), "a,b", value);',
			language: 'javascript',
		});
		const line = document.lineAt(0).text;

		const outerSignature = createSignatureHelp('outer(arg0, arg1, arg2)', 0);
		const outerSecondArgSignature = createSignatureHelp('outer(arg0, arg1, arg2)', 1);
		const outerThirdArgSignature = createSignatureHelp('outer(arg0, arg1, arg2)', 2);
		const innerSignature = createSignatureHelp('inner(left, right)', 1);

		const positions = new Map<number, vscode.SignatureHelp | undefined>([
			[line.indexOf('inner'), outerSignature],
			[line.indexOf('2'), innerSignature],
			[line.indexOf('"'), outerSecondArgSignature],
			[line.indexOf('b",'), outerSecondArgSignature],
			[line.indexOf('value'), outerThirdArgSignature],
		]);

		const signatureService: SignatureHelpService = {
			provide: async (_uri, position) => positions.get(position.character),
		};

		const parsed = await parseCallLine(document.uri, 0, line, signatureService);

		assert.ok(parsed);
		assert.strictEqual(parsed?.callee, 'outer');
		assert.deepStrictEqual(parsed?.args, ['inner(1, 2)', ' "a,b"', ' value']);
	});

	test('falls back to local parsing when signature help is unavailable', () => {
		const parsed = parseFallbackCallLine('outer(inner(1, 2), "a,b", { value: [1, 2] });');

		assert.ok(parsed);
		assert.strictEqual(parsed?.callee, 'outer');
		assert.deepStrictEqual(parsed?.args, ['inner(1, 2)', ' "a,b"', ' { value: [1, 2] }']);
	});

	test('aligns selected JavaScript call lines through the command flow', async () => {
		await assertSignatureHelpAlignmentForLanguage('javascript', 'JavaScript');
	});

	test('aligns selected TypeScript call lines through the command flow', async () => {
		await assertSignatureHelpAlignmentForLanguage('typescript', 'TypeScript');
	});

	test('aligns selected TSX call lines through the command flow', async () => {
		await assertSignatureHelpAlignmentForLanguage('typescriptreact', 'TypeScript React');
	});

	test('aligns selected Python call lines through the fallback parser', async () => {
		await assertFallbackAlignmentForLanguage(
			'python',
			'Python',
			FALLBACK_PYTHON_SAMPLE_LINES,
			FALLBACK_PYTHON_SAMPLE_EXPECTED,
		);
	});

	test('aligns selected C call lines through the fallback parser', async () => {
		await assertFallbackAlignmentForLanguage(
			'c',
			'C',
			FALLBACK_C_FAMILY_SAMPLE_LINES,
			FALLBACK_C_FAMILY_SAMPLE_EXPECTED,
		);
	});

	test('aligns selected C++ call lines through the fallback parser', async () => {
		await assertFallbackAlignmentForLanguage(
			'cpp',
			'C++',
			FALLBACK_C_FAMILY_SAMPLE_LINES,
			FALLBACK_C_FAMILY_SAMPLE_EXPECTED,
		);
	});

	test('aligns selected C# call lines through the fallback parser', async () => {
		await assertFallbackAlignmentForLanguage(
			'csharp',
			'C#',
			FALLBACK_C_FAMILY_SAMPLE_LINES,
			FALLBACK_C_FAMILY_SAMPLE_EXPECTED,
		);
	});

	test('aligns selected plain text call lines through the fallback parser', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'plaintext',
			content: [
				'/*arg1,arg2,arg3,long_name,arg4*/',
				'func(FALSE,1,0xABu,TRUE,SO);',
				'func1(TRUE,10,0xFFu,FALSE,SOMEVAL);',
				'func12(FALSE,100,0xABu,TRUE,SOMEVAL);',
				'func1(TRUE,1000,0xCDu,FALSE,SOMEVALU);',
				'func(FALSE,10000,0xEFu,TRUE,SOMEVALUE);',
			].join('\n'),
		});
		const editor = await vscode.window.showTextDocument(document);
		const selection = rangeForLines(document, 0, 5);
		editor.selection = selection;

		const output = await DoAlign(
			document,
			selection,
			new Config('right', 'left', {}, true, true, 'space'),
		);

		assert.strictEqual(
			output,
			[
				'/*    arg1  , arg2  , arg3 , long_name , arg4      */',
				'func  (FALSE ,     1 , 0xABu , TRUE  , SO       );',
				'func1 (TRUE  ,    10 , 0xFFu , FALSE , SOMEVAL  );',
				'func12(FALSE ,   100 , 0xABu , TRUE  , SOMEVAL  );',
				'func1 (TRUE  ,  1000 , 0xCDu , FALSE , SOMEVALU );',
				'func  (FALSE , 10000 , 0xEFu , TRUE  , SOMEVALUE);',
			].join('\n'),
		);

		await vscode.commands.executeCommand('alignargs.alignargs');

		assert.strictEqual(document.getText(rangeForLines(document, 0, 5)), output);
	});
});

function createSignatureHelp(label: string, activeParameter: number): vscode.SignatureHelp {
	return {
		activeParameter,
		activeSignature: 0,
		signatures: [
			{
				label,
				parameters: [],
			},
		],
	};
}

function rangeForLines(document: vscode.TextDocument, startLine: number, endLine: number): vscode.Selection {
	return new vscode.Selection(
		new vscode.Position(startLine, 0),
		document.lineAt(endLine).range.end,
	);
}

async function assertSignatureHelpAlignmentForLanguage(language: string, label: string): Promise<void> {
	const document = await vscode.workspace.openTextDocument({
		language,
		content: SIGNATURE_HELP_SAMPLE_LINES.join('\n'),
	});
	const editor = await vscode.window.showTextDocument(document);
	const selection = rangeForLines(document, 4, 9);
	editor.selection = selection;
	const signatureProbe = await vscode.commands.executeCommand<vscode.SignatureHelp>(
		'vscode.executeSignatureHelpProvider',
		document.uri,
		new vscode.Position(5, 5),
	);

	assert.ok(signatureProbe, `The ${label} language service should provide signature help for the test document.`);

	const output = await DoAlign(
		document,
		selection,
		new Config('right', 'left', {}, true, true, 'space'),
	);

	assert.strictEqual(output, SIGNATURE_HELP_SAMPLE_EXPECTED);

	await vscode.commands.executeCommand('alignargs.alignargs');

	assert.strictEqual(document.getText(rangeForLines(document, 4, 9)), SIGNATURE_HELP_SAMPLE_EXPECTED);
}

async function assertFallbackAlignmentForLanguage(
	language: string,
	label: string,
	lines: string[],
	expected: string,
): Promise<void> {
	const document = await vscode.workspace.openTextDocument({
		language,
		content: lines.join('\n'),
	});
	const editor = await vscode.window.showTextDocument(document);
	const selection = rangeForLines(document, 0, lines.length - 1);
	editor.selection = selection;

	assert.strictEqual(document.languageId, language, `The ${label} test document should use the requested language id.`);

	const output = await DoAlign(
		document,
		selection,
		new Config('right', 'left', {}, true, true, 'space'),
	);

	assert.strictEqual(output, expected);

	await vscode.commands.executeCommand('alignargs.alignargs');

	assert.strictEqual(document.getText(rangeForLines(document, 0, lines.length - 1)), expected);
}

const SIGNATURE_HELP_SAMPLE_LINES = [
	'function func(arg1, arg2, arg3, long_name, arg4) {}',
	'function func1(arg1, arg2, arg3, long_name, arg4) {}',
	'function func12(arg1, arg2, arg3, long_name, arg4) {}',
	'',
	'// arg1, arg2, arg3, long_name, arg4',
	'func(FALSE,1,0xAB,TRUE,SO);',
	'func1(TRUE,10,0xFF,FALSE,S0);',
	'func12(FALSE,100,0xAB,TRUE,SOMEVAL);',
	'func1(TRUE,1000,0xCD,FALSE,SOMEVALU);',
	'func(FALSE,10000,0xEF,TRUE,SOMEVALUE);',
];

const SIGNATURE_HELP_SAMPLE_EXPECTED = [
	'//    arg1  , arg2  , arg3 , long_name , arg4     ',
	'func  (FALSE ,     1 , 0xAB , TRUE  , SO       );',
	'func1 (TRUE  ,    10 , 0xFF , FALSE , S0       );',
	'func12(FALSE ,   100 , 0xAB , TRUE  , SOMEVAL  );',
	'func1 (TRUE  ,  1000 , 0xCD , FALSE , SOMEVALU );',
	'func  (FALSE , 10000 , 0xEF , TRUE  , SOMEVALUE);',
].join('\n');

const FALLBACK_C_FAMILY_SAMPLE_LINES = [
	'// arg1, arg2, arg3, long_name, arg4',
	'func(FALSE,1,0xABu,TRUE,SO);',
	'func1(TRUE,10,0xFFu,FALSE,SOMEVAL);',
	'func12(FALSE,100,0xABu,TRUE,SOMEVAL);',
	'func1(TRUE,1000,0xCDu,FALSE,SOMEVALU);',
	'func(FALSE,10000,0xEFu,TRUE,SOMEVALUE);',
];

const FALLBACK_C_FAMILY_SAMPLE_EXPECTED = [
	'//    arg1  , arg2  , arg3 , long_name , arg4     ',
	'func  (FALSE ,     1 , 0xABu , TRUE  , SO       );',
	'func1 (TRUE  ,    10 , 0xFFu , FALSE , SOMEVAL  );',
	'func12(FALSE ,   100 , 0xABu , TRUE  , SOMEVAL  );',
	'func1 (TRUE  ,  1000 , 0xCDu , FALSE , SOMEVALU );',
	'func  (FALSE , 10000 , 0xEFu , TRUE  , SOMEVALUE);',
].join('\n');

const FALLBACK_PYTHON_SAMPLE_LINES = [
	'func(False,1,0xAB,True,so)',
	'func1(True,10,0xFF,False,s0)',
	'func12(False,100,0xAB,True,some_val)',
	'func1(True,1000,0xCD,False,some_value)',
	'func(False,10000,0xEF,True,some_value2)',
];

const FALLBACK_PYTHON_SAMPLE_EXPECTED = [
	'func  (False ,     1 , 0xAB , True  , so         )',
	'func1 (True  ,    10 , 0xFF , False , s0         )',
	'func12(False ,   100 , 0xAB , True  , some_val   )',
	'func1 (True  ,  1000 , 0xCD , False , some_value )',
	'func  (False , 10000 , 0xEF , True  , some_value2)',
].join('\n');
