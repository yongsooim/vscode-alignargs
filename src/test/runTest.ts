import * as path from 'path';

import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		const downloadedExecutablePath = await downloadAndUnzipVSCode({
			version: '1.110.0',
			extractSync: true,
		});
		const vscodeExecutablePath = process.platform === 'darwin'
			? path.join(path.dirname(path.dirname(downloadedExecutablePath)), 'Resources', 'app', 'bin', 'code')
			: downloadedExecutablePath;

		await runTests({
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath,
		});
	} catch {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

main();
