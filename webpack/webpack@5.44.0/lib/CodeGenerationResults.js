/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const { provide } = require("./util/MapHelpers");
const { first } = require("./util/SetHelpers");
const createHash = require("./util/createHash");
const { runtimeToString, RuntimeSpecMap } = require("./util/runtime");

/** @typedef {import("webpack-sources").Source} Source */
/** @typedef {import("./Module")} Module */
/** @typedef {import("./Module").CodeGenerationResult} CodeGenerationResult */
/** @typedef {import("./util/runtime").RuntimeSpec} RuntimeSpec */

class CodeGenerationResults {
	constructor() {
		// Map<Module, RuntimeSpecMap<CodeGenerationResult>>
		this.map = new Map();
	}

	/**
	 * @param {Module} module the module
	 * @param {RuntimeSpec} runtime runtime(s)
	 * @returns {CodeGenerationResult} the CodeGenerationResult
	 */
	get(module, runtime) {
		const entry = this.map.get(module);
		if (entry === undefined) {
			throw new Error(
				`No code generation entry for ${module.identifier()} (existing entries: ${Array.from(
					this.map.keys(),
					m => m.identifier()
				).join(", ")})`
			);
		}
		if (runtime === undefined) {
			if (entry.size > 1) {
				const results = new Set(entry.values());
				if (results.size !== 1) {
					throw new Error(
						`No unique code generation entry for unspecified runtime for ${module.identifier()} (existing runtimes: ${Array.from(
							entry.keys(),
							r => runtimeToString(r)
						).join(", ")}).
Caller might not support runtime-dependent code generation (opt-out via optimization.usedExports: "global").`
					);
				}
				return first(results);
			}
			return entry.values().next().value;
		}
		const result = entry.get(runtime);
		if (result === undefined) {
			throw new Error(
				`No code generation entry for runtime ${runtimeToString(
					runtime
				)} for ${module.identifier()} (existing runtimes: ${Array.from(
					entry.keys(),
					r => runtimeToString(r)
				).join(", ")})`
			);
		}
		return result;
	}

	/**
	 * @param {Module} module the module
	 * @param {RuntimeSpec} runtime runtime(s)
	 * @returns {boolean} true, when we have data for this
	 */
	has(module, runtime) {
		const entry = this.map.get(module);
		if (entry === undefined) {
			return false;
		}
		if (runtime !== undefined) {
			return entry.has(runtime);
		} else if (entry.size > 1) {
			const results = new Set(entry.values());
			return results.size === 1;
		} else {
			return entry.size === 1;
		}
	}

	/**
	 * @param {Module} module the module
	 * @param {RuntimeSpec} runtime runtime(s)
	 * @param {string} sourceType the source type
	 * @returns {Source} a source
	 */
	getSource(module, runtime, sourceType) {
		return this.get(module, runtime).sources.get(sourceType);
	}

	/**
	 * @param {Module} module the module
	 * @param {RuntimeSpec} runtime runtime(s)
	 * @returns {ReadonlySet<string>} runtime requirements
	 */
	getRuntimeRequirements(module, runtime) {
		return this.get(module, runtime).runtimeRequirements;
	}

	/**
	 * @param {Module} module the module
	 * @param {RuntimeSpec} runtime runtime(s)
	 * @param {string} key data key
	 * @returns {any} data generated by code generation
	 */
	getData(module, runtime, key) {
		const data = this.get(module, runtime).data;
		return data === undefined ? undefined : data.get(key);
	}

	/**
	 * @param {Module} module the module
	 * @param {RuntimeSpec} runtime runtime(s)
	 * @returns {any} hash of the code generation
	 */
	getHash(module, runtime) {
		const info = this.get(module, runtime);
		if (info.hash !== undefined) return info.hash;
		const hash = createHash("md4");
		for (const [type, source] of info.sources) {
			hash.update(type);
			source.updateHash(hash);
		}
		if (info.runtimeRequirements) {
			for (const rr of info.runtimeRequirements) hash.update(rr);
		}
		return (info.hash = /** @type {string} */ (hash.digest("hex")));
	}

	/**
	 * @param {Module} module the module
	 * @param {RuntimeSpec} runtime runtime(s)
	 * @param {CodeGenerationResult} result result from module
	 * @returns {void}
	 */
	add(module, runtime, result) {
		const map = provide(this.map, module, () => new RuntimeSpecMap());
		map.set(runtime, result);
	}
}

module.exports = CodeGenerationResults;
