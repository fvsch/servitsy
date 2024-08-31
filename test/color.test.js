import { strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { brackets, seqStyle, stripStyle, style } from '../lib/color.js';

suite('style', () => {
	test('does nothing for empty format', () => {
		strictEqual(style('TEST'), 'TEST');
		strictEqual(style('TEST', ''), 'TEST');
	});

	// TODO: Results depend on terminal, so this test will probably fail
	// in different settings or CI.
	test('adds color codes to strings', () => {
		strictEqual(style('TEST', 'reset', true), '\x1B[0mTEST\x1B[0m');
		strictEqual(style('TEST', 'red', true), '\x1B[31mTEST\x1B[39m');
		strictEqual(style('TEST', 'dim underline', true), '\x1B[2m\x1B[4mTEST\x1B[24m\x1B[22m');
	});
});

suite('seqStyle', () => {
	test('applies styles to sequence', () => {
		strictEqual(seqStyle(['TE', 'ST']), 'TEST');
		strictEqual(seqStyle(['(', 'TEST', ')']), '(TEST)');
		strictEqual(seqStyle(['TE', 'ST'], 'blue'), '\x1B[34mTE\x1B[39mST');
		strictEqual(seqStyle(['TE', 'ST'], ',blue'), 'TE\x1B[34mST\x1B[39m');
		strictEqual(seqStyle(['TE', 'ST'], 'blue,red,green'), '\x1B[34mTE\x1B[39m\x1B[31mST\x1B[39m');
	});
});

suite('stripStyle', () => {
	test('formatting can be removed', () => {
		strictEqual(stripStyle(style('TEST', 'magentaBright')), 'TEST');
		strictEqual(stripStyle(seqStyle(['T', 'E', 'S', 'T'], 'inverse,blink,bold,red')), 'TEST');
	});
});

suite('brackets', () => {
	test('adds brackets around input', () => {
		strictEqual(brackets('TEST', ''), '[TEST]');
		strictEqual(brackets('TEST'), '\x1B[2m[\x1B[22mTEST\x1B[2m]\x1B[22m');
		strictEqual(brackets('TEST', 'blue,,red'), '\x1B[34m[\x1B[39mTEST\x1B[31m]\x1B[39m');
	});
});
