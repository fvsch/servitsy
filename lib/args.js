export class CLIArgs {
	/**
	 * @type {Array<[string, string]>}
	 */
	#map = [];

	/**
	 * @type {string[]}
	 */
	#list = [];

	/**
	 * @param {string | string[]} keys
	 * @returns {(entry: [string, string]) => boolean}
	 */
	#mapFilter(keys) {
		return (entry) => (typeof keys === 'string' ? keys === entry[0] : keys.includes(entry[0]));
	}

	/**
	 * @param {string[]} args
	 */
	constructor(args) {
		const optionPattern = /^-{1,2}[\w]/;
		let pos = 0;
		while (pos < args.length) {
			const arg = args[pos];
			pos += 1;
			if (optionPattern.test(arg)) {
				const nextArg = args[pos];
				if (arg.includes('=')) {
					const index = arg.indexOf('=');
					this.add(arg.slice(0, index), arg.slice(index + 1));
				} else if (nextArg && !nextArg.startsWith('-')) {
					this.add(arg, nextArg);
					pos += 1;
				} else {
					this.add(arg, '');
				}
			} else {
				this.add(null, arg);
			}
		}
	}

	/**
	 * @param {string | null} key
	 * @param {string} value
	 */
	add(key, value) {
		if (key == null) {
			this.#list.push(value);
		} else {
			this.#map.push([key, value]);
		}
	}

	/**
	 * Check if args contain a value for one or several option names,
	 * or at a specific positional index.
	 * @param {number | string | string[]} keys
	 * @returns {boolean}
	 */
	has(keys) {
		if (typeof keys === 'number') {
			return typeof this.#list.at(keys) === 'string';
		} else {
			return this.#map.some(this.#mapFilter(keys));
		}
	}

	/**
	 * Get the last value for one or several option names,
	 * or a specific positional index.
	 * @param {number | string | string[]} query
	 * @returns {string | undefined}
	 */
	get(query) {
		if (typeof query === 'number') {
			return this.#list.at(query);
		} else {
			return this.all(query).at(-1);
		}
	}

	/**
	 * Get mapped values for one or several option names.
	 * Values are merged in order of appearance.
	 * @param {string | string[]} query
	 * @returns {string[]}
	 */
	all(query) {
		return this.#map.filter(this.#mapFilter(query)).map((entry) => entry[1]);
	}

	/**
	 * Get the names of all mapped options.
	 * @returns {string[]}
	 */
	keys() {
		/** @type {string[]} */
		const keys = [];
		for (const [key] of this.#map) {
			if (!keys.includes(key)) keys.push(key);
		}
		return keys;
	}

	get data() {
		return structuredClone({
			map: this.#map,
			list: this.#list,
		});
	}
}
