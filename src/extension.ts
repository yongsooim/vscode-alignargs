import * as vscode from 'vscode';
import { Config } from './class/Config';
import { DoAlign } from './implement/AlignArgs';

export function activate(context: vscode.ExtensionContext): void {
	const disposable = vscode.commands.registerCommand('alignargs.alignargs', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const selection = expandSelectionToFullLines(editor);
		const selectedText = editor.document.getText(selection);
		const outputText = await DoAlign(editor.document, selection, getConfig());

		if (!outputText || outputText === selectedText) {
			return;
		}

		await editor.edit((editBuilder) => {
			editBuilder.replace(selection, outputText);
		});
	});

	context.subscriptions.push(disposable);
}

export function deactivate(): void {}

function expandSelectionToFullLines(editor: vscode.TextEditor): vscode.Selection {
	const startLine = editor.selection.start.line;
	const endLine = editor.selection.end.line;

	return new vscode.Selection(
		new vscode.Position(startLine, 0),
		editor.document.lineAt(endLine).range.end,
	);
}

function getConfig(): Config {
	const workspaceConfig = vscode.workspace.getConfiguration('alignargs');
	const alignDecimal = workspaceConfig.get<string>('alignDecimal') ?? 'right';
	const alignNonDecimal = workspaceConfig.get<string>('alignNonDecimal') ?? 'left';
	const replaceArg = workspaceConfig.get<{ [key: string]: string }>('replaceArg') ?? {};
	const trimTrail = workspaceConfig.get<boolean>('trimTrail') ?? true;
	const formatHex = workspaceConfig.get<boolean>('formatHex') ?? true;
	const padType = workspaceConfig.get<string>('padType') ?? 'space';

	return new Config(alignDecimal, alignNonDecimal, replaceArg, trimTrail, formatHex, padType);
}
