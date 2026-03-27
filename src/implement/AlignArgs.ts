import * as vscode from 'vscode';
import { Config } from '../class/Config';

export interface SignatureHelpService {
	provide(uri: vscode.Uri, position: vscode.Position): Promise<vscode.SignatureHelp | undefined>;
}

export class VsCodeSignatureHelpService implements SignatureHelpService {
	async provide(uri: vscode.Uri, position: vscode.Position): Promise<vscode.SignatureHelp | undefined> {
		return vscode.commands.executeCommand<vscode.SignatureHelp>(
			'vscode.executeSignatureHelpProvider',
			uri,
			position,
		);
	}
}

interface PlainLine {
	kind: 'plain';
	text: string;
}

interface CallLine {
	kind: 'call';
	indent: string;
	callee: string;
	args: string[];
	suffix: string;
}

interface ReferenceCommentLine {
	kind: 'reference';
	opener: '//' | '#' | '/*';
	columns: string[];
	closer: '' | '*/';
}

type ParsedLine = PlainLine | CallLine | ReferenceCommentLine;

export async function DoAlign(
	document: vscode.TextDocument,
	selection: vscode.Selection,
	config: Config,
	service: SignatureHelpService = new VsCodeSignatureHelpService(),
): Promise<string | undefined> {
	const startLine = selection.start.line;
	const endLine = selection.end.line;
	const lines = Array.from(
		{ length: endLine - startLine + 1 },
		(_, index) => document.lineAt(startLine + index).text,
	);
	const parsedLines: ParsedLine[] = [];
	let seekingReferenceComment = true;
	let hasCallLine = false;

	for (const [index, line] of lines.entries()) {
		if (seekingReferenceComment) {
			const referenceComment = parseReferenceCommentLine(line);
			if (referenceComment) {
				parsedLines.push(referenceComment);
				seekingReferenceComment = false;
				continue;
			}
		}

		const callLine =
			(await parseCallLine(document.uri, startLine + index, line, service)) ??
			parseFallbackCallLine(line);
		if (callLine) {
			parsedLines.push(callLine);
			hasCallLine = true;
			seekingReferenceComment = false;
			continue;
		}

		parsedLines.push({ kind: 'plain', text: line });
	}

	if (!hasCallLine) {
		return undefined;
	}

	const lineEnding = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
	return buildAlignedOutput(parsedLines, config, lineEnding);
}

export async function parseCallLine(
	uri: vscode.Uri,
	lineNumber: number,
	lineText: string,
	service: SignatureHelpService,
): Promise<CallLine | undefined> {
	const indent = lineText.match(/^\s*/)?.[0] ?? '';
	const candidateParenIndexes = findCharacterIndexes(lineText, '(');

	for (const openParenIndex of candidateParenIndexes) {
		const callee = lineText.slice(indent.length, openParenIndex).trimEnd();
		if (!callee) {
			continue;
		}

		const closeParenIndex = findMatchingParen(lineText, openParenIndex);
		if (closeParenIndex === undefined) {
			continue;
		}

		const rootSignature = await getRootSignatureHelp(
			uri,
			lineNumber,
			lineText,
			openParenIndex,
			closeParenIndex,
			service,
		);
		if (!rootSignature) {
			continue;
		}

		const rootSignatureName = extractSignatureName(rootSignature);
		const calleeName = extractTrailingIdentifier(callee);

		if (rootSignatureName && calleeName && rootSignatureName !== calleeName) {
			continue;
		}

		const args = await splitArgumentsWithSignatureHelp(
			uri,
			lineNumber,
			lineText,
			openParenIndex,
			closeParenIndex,
			callee,
			rootSignature,
			service,
		);

		return {
			kind: 'call',
			indent,
			callee,
			args,
			suffix: lineText.slice(closeParenIndex),
		};
	}

	return undefined;
}

export function parseFallbackCallLine(lineText: string): CallLine | undefined {
	const indent = lineText.match(/^\s*/)?.[0] ?? '';
	const candidateParenIndexes = findCharacterIndexes(lineText, '(');

	for (const openParenIndex of candidateParenIndexes) {
		const callee = lineText.slice(indent.length, openParenIndex).trimEnd();
		if (!isValidFallbackCallee(callee)) {
			continue;
		}

		const closeParenIndex = findMatchingParen(lineText, openParenIndex);
		if (closeParenIndex === undefined) {
			continue;
		}

		return {
			kind: 'call',
			indent,
			callee,
			args: splitArgumentsFallback(lineText, openParenIndex, closeParenIndex),
			suffix: lineText.slice(closeParenIndex),
		};
	}

	return undefined;
}

export function parseReferenceCommentLine(lineText: string): ReferenceCommentLine | undefined {
	const match = lineText.match(/^\s*(\/\/|#|\/\*)\s*(.+?)(\*\/)?\s*$/);
	if (!match) {
		return undefined;
	}

	const opener = match[1] as ReferenceCommentLine['opener'];
	const body = match[2].trim();
	const closer = (match[3] ?? '') as ReferenceCommentLine['closer'];

	if (!body.includes(',')) {
		return undefined;
	}

	return {
		kind: 'reference',
		opener,
		columns: body.split(',').map((column) => column.trim()),
		closer,
	};
}

export function buildAlignedOutput(parsedLines: ParsedLine[], config: Config, lineEnding: string): string {
	const callLines = parsedLines.filter((line): line is CallLine => line.kind === 'call');
	const referenceLine = parsedLines.find((line): line is ReferenceCommentLine => line.kind === 'reference');
	const minIndent = getMinimumIndent(callLines);
	const maxCalleeLength = Math.max(1, ...callLines.map((line) => line.callee.length));
	const maxArgLengthByIndex = referenceLine
		? referenceLine.columns.map((column) => column.length)
		: [];

	for (const callLine of callLines) {
		callLine.args = callLine.args.map((arg) => normalizeArgument(arg, config));
		mergeArgLengths(maxArgLengthByIndex, callLine.args.map((arg) => arg.length));
	}

	const outputLines = parsedLines.map((line) => {
		if (line.kind === 'plain') {
			return line.text;
		}

		if (line.kind === 'reference') {
			return formatReferenceComment(line, minIndent, maxCalleeLength, maxArgLengthByIndex, config);
		}

		return formatCallLine(line, minIndent, maxCalleeLength, maxArgLengthByIndex, config);
	});

	return outputLines.join(lineEnding);
}

function formatCallLine(
	line: CallLine,
	minIndent: string,
	maxCalleeLength: number,
	maxArgLengthByIndex: number[],
	config: Config,
): string {
	const joinString = config.padType === 'tab' ? ', ' : ' , ';
	const formattedArgs = line.args.map((arg, index) =>
		formatArgument(arg, index, maxArgLengthByIndex, maxCalleeLength, joinString, config),
	);

	return `${minIndent}${line.callee.padEnd(maxCalleeLength)}(${formattedArgs.join(joinString)}${line.suffix}`;
}

function formatReferenceComment(
	line: ReferenceCommentLine,
	minIndent: string,
	maxCalleeLength: number,
	maxArgLengthByIndex: number[],
	config: Config,
): string {
	const joinString = config.padType === 'tab' ? ', ' : ' , ';
	const formattedColumns = line.columns.map((column, index) =>
		formatArgument(column, index, maxArgLengthByIndex, maxCalleeLength, joinString, {
			...config,
			formatHex: false,
			replace: {},
		}),
	);
	const prefix = `${line.opener} `.padEnd(maxCalleeLength + 1);
	const suffix = line.closer ? ` ${line.closer}` : '';

	return `${minIndent}${prefix}${formattedColumns.join(joinString)}${suffix}`;
}

function formatArgument(
	arg: string,
	argIndex: number,
	maxArgLengthByIndex: number[],
	maxCalleeLength: number,
	joinString: string,
	config: Config,
): string {
	if (config.padType === 'tab') {
		return formatArgumentWithTabs(arg, argIndex, maxArgLengthByIndex, maxCalleeLength, joinString, config);
	}

	const targetWidth = maxArgLengthByIndex[argIndex] ?? arg.length;
	const isDecimal = /^\d+$/.test(arg.trim());
	const alignment = isDecimal ? config.alignDecimal : config.alignNonDecimal;

	switch (alignment) {
		case 'left':
			return arg.padEnd(targetWidth);
		case 'center': {
			const leftPadding = Math.floor((targetWidth - arg.length) / 2);
			return arg.padStart(arg.length + leftPadding).padEnd(targetWidth);
		}
		case 'right':
		default:
			return arg.padStart(targetWidth);
	}
}

function formatArgumentWithTabs(
	arg: string,
	argIndex: number,
	maxArgLengthByIndex: number[],
	maxCalleeLength: number,
	joinString: string,
	config: Config,
): string {
	const tabSize = 4;
	const isDecimal = /^\d+$/.test(arg.trim());
	const alignment = isDecimal ? config.alignDecimal : config.alignNonDecimal;

	if (argIndex === 0) {
		const targetWidth = Math.ceil((maxCalleeLength + 1 + (maxArgLengthByIndex[argIndex] ?? arg.length)) / tabSize) * tabSize;

		if (alignment === 'right' && isDecimal) {
			return `${arg.padStart(targetWidth - maxCalleeLength - 1)}\t`;
		}

		const tabs = Math.ceil((targetWidth - arg.length - maxCalleeLength - 1) / tabSize) + 1;
		return `${arg}${'\t'.repeat(Math.max(1, tabs))}`;
	}

	const targetWidth = Math.ceil((maxArgLengthByIndex[argIndex] ?? arg.length) / tabSize) * tabSize;

	if (alignment === 'right' && isDecimal) {
		return `${arg.padStart(targetWidth)}\t`;
	}

	const tabs = Math.ceil((targetWidth - arg.length - joinString.length) / tabSize) + 1;
	return `${arg}${'\t'.repeat(Math.max(1, tabs))}`;
}

function normalizeArgument(arg: string, config: Config): string {
	let value = config.trimTrail ? arg.trim() : arg;
	const trimmedValue = value.trim();

	if (trimmedValue in config.replace) {
		value = value.replace(trimmedValue, config.replace[trimmedValue]);
	}

	if (config.formatHex) {
		const upperValue = trimmedValue.toUpperCase();
		if (/^0X[0-9A-F]+[Uu]?$/.test(upperValue)) {
			value = value.replace(trimmedValue, upperValue.replace('X', 'x').replace('U', 'u'));
		}
	}

	return value;
}

function mergeArgLengths(target: number[], source: number[]): void {
	for (const [index, value] of source.entries()) {
		target[index] = Math.max(target[index] ?? 0, value);
	}
}

function getMinimumIndent(callLines: CallLine[]): string {
	if (callLines.length === 0) {
		return '';
	}

	return callLines.reduce((currentMin, line) =>
		line.indent.length < currentMin.length ? line.indent : currentMin,
		callLines[0].indent,
	);
}

async function getRootSignatureHelp(
	uri: vscode.Uri,
	lineNumber: number,
	lineText: string,
	openParenIndex: number,
	closeParenIndex: number,
	service: SignatureHelpService,
): Promise<vscode.SignatureHelp | undefined> {
	const probeColumn = findNextNonWhitespace(lineText, openParenIndex + 1, closeParenIndex) ?? openParenIndex + 1;
	return service.provide(uri, new vscode.Position(lineNumber, probeColumn));
}

async function splitArgumentsWithSignatureHelp(
	uri: vscode.Uri,
	lineNumber: number,
	lineText: string,
	openParenIndex: number,
	closeParenIndex: number,
	callee: string,
	rootSignature: vscode.SignatureHelp,
	service: SignatureHelpService,
): Promise<string[]> {
	const rootSignatureName = extractSignatureName(rootSignature) ?? extractTrailingIdentifier(callee);
	const separatorIndexes: number[] = [];
	let currentParameterIndex = 0;

	for (const commaIndex of findCharacterIndexes(lineText.slice(openParenIndex + 1, closeParenIndex), ',')) {
		const absoluteCommaIndex = openParenIndex + 1 + commaIndex;
		const nextArgumentColumn = findNextNonWhitespace(lineText, absoluteCommaIndex + 1, closeParenIndex);

		if (nextArgumentColumn === undefined) {
			continue;
		}

		const signatureHelp = await service.provide(uri, new vscode.Position(lineNumber, nextArgumentColumn));
		if (!signatureHelp) {
			continue;
		}

		const signatureName = extractSignatureName(signatureHelp);
		if (rootSignatureName && signatureName && rootSignatureName !== signatureName) {
			continue;
		}

		if (signatureHelp.activeParameter <= currentParameterIndex) {
			continue;
		}

		separatorIndexes.push(absoluteCommaIndex);
		currentParameterIndex = signatureHelp.activeParameter;
	}

	const args: string[] = [];
	let currentStart = openParenIndex + 1;

	for (const separatorIndex of separatorIndexes) {
		args.push(lineText.slice(currentStart, separatorIndex));
		currentStart = separatorIndex + 1;
	}

	const tail = lineText.slice(currentStart, closeParenIndex);
	if (separatorIndexes.length > 0 || tail.trim() !== '') {
		args.push(tail);
	}

	return args;
}

function splitArgumentsFallback(lineText: string, openParenIndex: number, closeParenIndex: number): string[] {
	const args: string[] = [];
	let currentStart = openParenIndex + 1;
	let parenDepth = 0;
	let bracketDepth = 0;
	let braceDepth = 0;
	let activeQuote: '"' | '\'' | '`' | undefined;
	let escaping = false;

	for (let index = openParenIndex + 1; index < closeParenIndex; index += 1) {
		const char = lineText[index];

		if (escaping) {
			escaping = false;
			continue;
		}

		if (activeQuote) {
			if (char === '\\') {
				escaping = true;
				continue;
			}

			if (char === activeQuote) {
				activeQuote = undefined;
			}

			continue;
		}

		if (char === '"' || char === '\'' || char === '`') {
			activeQuote = char;
			continue;
		}

		if (char === '(') {
			parenDepth += 1;
			continue;
		}

		if (char === ')') {
			if (parenDepth > 0) {
				parenDepth -= 1;
			}
			continue;
		}

		if (char === '[') {
			bracketDepth += 1;
			continue;
		}

		if (char === ']') {
			if (bracketDepth > 0) {
				bracketDepth -= 1;
			}
			continue;
		}

		if (char === '{') {
			braceDepth += 1;
			continue;
		}

		if (char === '}') {
			if (braceDepth > 0) {
				braceDepth -= 1;
			}
			continue;
		}

		if (char === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
			args.push(lineText.slice(currentStart, index));
			currentStart = index + 1;
		}
	}

	const tail = lineText.slice(currentStart, closeParenIndex);
	if (args.length > 0 || tail.trim() !== '') {
		args.push(tail);
	}

	return args;
}

function findMatchingParen(lineText: string, openParenIndex: number): number | undefined {
	let depth = 0;
	let activeQuote: '"' | '\'' | '`' | undefined;
	let escaping = false;

	for (let index = openParenIndex; index < lineText.length; index += 1) {
		const char = lineText[index];

		if (escaping) {
			escaping = false;
			continue;
		}

		if (activeQuote) {
			if (char === '\\') {
				escaping = true;
				continue;
			}

			if (char === activeQuote) {
				activeQuote = undefined;
			}
			continue;
		}

		if (char === '"' || char === '\'' || char === '`') {
			activeQuote = char;
			continue;
		}

		if (char === '(') {
			depth += 1;
			continue;
		}

		if (char === ')') {
			depth -= 1;
			if (depth === 0) {
				return index;
			}
		}
	}

	return undefined;
}

function findCharacterIndexes(text: string, char: string): number[] {
	const indexes: number[] = [];

	for (let index = 0; index < text.length; index += 1) {
		if (text[index] === char) {
			indexes.push(index);
		}
	}

	return indexes;
}

function findNextNonWhitespace(text: string, start: number, endExclusive: number): number | undefined {
	for (let index = start; index < endExclusive; index += 1) {
		if (!/\s/.test(text[index])) {
			return index;
		}
	}

	return undefined;
}

function extractSignatureName(signatureHelp: vscode.SignatureHelp): string | undefined {
	const signature = signatureHelp.signatures[signatureHelp.activeSignature] ?? signatureHelp.signatures[0];
	if (!signature) {
		return undefined;
	}

	const beforeParen = signature.label.split('(')[0] ?? signature.label;
	const identifiers = beforeParen.match(/[A-Za-z_][\w$]*/g);
	return identifiers?.at(-1);
}

function extractTrailingIdentifier(text: string): string | undefined {
	const identifiers = text.match(/[A-Za-z_][\w$]*/g);
	return identifiers?.at(-1);
}

function isValidFallbackCallee(text: string): boolean {
	return /^[A-Za-z_][\w$.]*$/.test(text);
}
