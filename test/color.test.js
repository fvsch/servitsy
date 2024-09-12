import { strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { ColorUtils } from '../lib/color.js';

suite('ColorUtils.style', () => {
	test('does nothing for empty format', () => {
		const { style } = new ColorUtils({ enabled: true });
		strictEqual(style('TEST'), 'TEST');
		strictEqual(style('TEST', ''), 'TEST');
	});

	test('adds color codes to strings', () => {
		const { style } = new ColorUtils({ enabled: true });
		strictEqual(style('TEST', 'reset'), '\x1B[0mTEST\x1B[0m');
		strictEqual(style('TEST', 'red'), '\x1B[31mTEST\x1B[39m');
		strictEqual(style('TEST', 'dim underline'), '\x1B[2m\x1B[4mTEST\x1B[24m\x1B[22m');
	});

	test('does nothing when colors are disabled', () => {
		const { style } = new ColorUtils({ enabled: false });
		strictEqual(style('TEST', 'reset'), 'TEST');
		strictEqual(style('TEST', 'red'), 'TEST');
		strictEqual(style('TEST', 'dim underline'), 'TEST');
	});
});

suite('ColorUtils.sequence', () => {
	test('applies styles to sequence', () => {
		const { sequence } = new ColorUtils({ enabled: true });
		strictEqual(sequence(['TE', 'ST']), 'TEST');
		strictEqual(sequence(['(', 'TEST', ')']), '(TEST)');
		strictEqual(sequence(['TE', 'ST'], 'blue'), '\x1B[34mTE\x1B[39mST');
		strictEqual(sequence(['TE', 'ST'], ',blue'), 'TE\x1B[34mST\x1B[39m');
		strictEqual(sequence(['TE', 'ST'], 'blue,red,green'), '\x1B[34mTE\x1B[39m\x1B[31mST\x1B[39m');
	});
});

suite('ColorUtils.strip', () => {
	test('formatting can be removed', () => {
		const { style, sequence, strip } = new ColorUtils({ enabled: true });
		strictEqual(strip(style('TEST', 'magentaBright')), 'TEST');
		strictEqual(strip(sequence(['T', 'E', 'S', 'T'], 'inverse,blink,bold,red')), 'TEST');
	});
});

suite('ColorUtils.brackets', () => {
	test('adds brackets around input', () => {
		const { brackets } = new ColorUtils({ enabled: true });
		strictEqual(brackets('TEST', ''), '[TEST]');
		strictEqual(brackets('TEST'), '\x1B[2m[\x1B[22mTEST\x1B[2m]\x1B[22m');
		strictEqual(brackets('TEST', 'blue,,red'), '\x1B[34m[\x1B[39mTEST\x1B[31m]\x1B[39m');
	});

	test('supports custom brackers', () => {
		const { brackets } = new ColorUtils({ enabled: true, brackets: ['<<<', '>>>'] });
		strictEqual(brackets('TEST', ''), '<<<TEST>>>');
		strictEqual(brackets('TEST', 'blue,,red'), '\x1B[34m<<<\x1B[39mTEST\x1B[31m>>>\x1B[39m');
	});
});
