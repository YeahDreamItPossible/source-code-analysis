"use strict";

const versions = require("process").versions;
const Resolver = require("./Resolver");
const { getType, PathType } = require("./util/path");

const SyncAsyncFileSystemDecorator = require("./SyncAsyncFileSystemDecorator");

const AliasFieldPlugin = require("./AliasFieldPlugin");
const AliasPlugin = require("./AliasPlugin");
const AppendPlugin = require("./AppendPlugin");
const ConditionalPlugin = require("./ConditionalPlugin");
const DescriptionFilePlugin = require("./DescriptionFilePlugin");
const DirectoryExistsPlugin = require("./DirectoryExistsPlugin");
const ExportsFieldPlugin = require("./ExportsFieldPlugin");
const FileExistsPlugin = require("./FileExistsPlugin");
const ImportsFieldPlugin = require("./ImportsFieldPlugin");
const JoinRequestPartPlugin = require("./JoinRequestPartPlugin");
const JoinRequestPlugin = require("./JoinRequestPlugin");
const MainFieldPlugin = require("./MainFieldPlugin");
const ModulesInHierachicDirectoriesPlugin = require("./ModulesInHierachicDirectoriesPlugin");
const ModulesInRootPlugin = require("./ModulesInRootPlugin");
const NextPlugin = require("./NextPlugin");
const ParsePlugin = require("./ParsePlugin");
const PnpPlugin = require("./PnpPlugin");
const RestrictionsPlugin = require("./RestrictionsPlugin");
const ResultPlugin = require("./ResultPlugin");
const RootsPlugin = require("./RootsPlugin");
const SelfReferencePlugin = require("./SelfReferencePlugin");
const SymlinkPlugin = require("./SymlinkPlugin");
const TryNextPlugin = require("./TryNextPlugin");
const UnsafeCachePlugin = require("./UnsafeCachePlugin");
const UseFilePlugin = require("./UseFilePlugin");

/** @typedef {import("./AliasPlugin").AliasOption} AliasOptionEntry */
/** @typedef {import("./PnpPlugin").PnpApiImpl} PnpApi */
/** @typedef {import("./Resolver").FileSystem} FileSystem */
/** @typedef {import("./Resolver").ResolveRequest} ResolveRequest */
/** @typedef {import("./Resolver").SyncFileSystem} SyncFileSystem */

/** @typedef {string|string[]|false} AliasOptionNewRequest */
/** @typedef {{[k: string]: AliasOptionNewRequest}} AliasOptions */
/** @typedef {{apply: function(Resolver): void} | function(this: Resolver, Resolver): void} Plugin */

// 用户选项
/**
 * @typedef {Object} UserResolveOptions
 * @property {(AliasOptions | AliasOptionEntry[])=} alias A list of module alias configurations or an object which maps key to value
 * @property {(AliasOptions | AliasOptionEntry[])=} fallback A list of module alias configurations or an object which maps key to value, applied only after modules option
 * @property {(string | string[])[]=} aliasFields A list of alias fields in description files
 * @property {(function(ResolveRequest): boolean)=} cachePredicate A function which decides whether a request should be cached or not. An object is passed with at least `path` and `request` properties.
 * @property {boolean=} cacheWithContext Whether or not the unsafeCache should include request context as part of the cache key.
 * @property {string[]=} descriptionFiles A list of description files to read from
 * @property {string[]=} conditionNames A list of exports field condition names.
 * @property {boolean=} enforceExtension Enforce that a extension from extensions must be used
 * @property {(string | string[])[]=} exportsFields A list of exports fields in description files
 * @property {(string | string[])[]=} importsFields A list of imports fields in description files
 * @property {string[]=} extensions A list of extensions which should be tried for files
 * @property {FileSystem} fileSystem The file system which should be used
 * @property {(object | boolean)=} unsafeCache Use this cache object to unsafely cache the successful requests
 * @property {boolean=} symlinks Resolve symlinks to their symlinked location
 * @property {Resolver=} resolver A prepared Resolver to which the plugins are attached
 * @property {string[] | string=} modules A list of directories to resolve modules from, can be absolute path or folder name
 * @property {(string | string[] | {name: string | string[], forceRelative: boolean})[]=} mainFields A list of main fields in description files
 * @property {string[]=} mainFiles  A list of main files in directories
 * @property {Plugin[]=} plugins A list of additional resolve plugins which should be applied
 * @property {PnpApi | null=} pnpApi A PnP API that should be used - null is "never", undefined is "auto"
 * @property {string[]=} roots A list of root paths
 * @property {boolean=} fullySpecified The request is already fully specified and no extensions or directories are resolved for it
 * @property {boolean=} resolveToContext Resolve to a context instead of a file
 * @property {(string|RegExp)[]=} restrictions A list of resolve restrictions
 * @property {boolean=} useSyncFileSystemCalls Use only the sync constiants of the file system calls
 * @property {boolean=} preferRelative Prefer to resolve module requests as relative requests before falling back to modules
 * @property {boolean=} preferAbsolute Prefer to resolve server-relative urls as absolute paths before falling back to resolve in roots
 */

// 标准化选项
/**
 * @typedef {Object} ResolveOptions
 * @property {AliasOptionEntry[]} alias
 * @property {AliasOptionEntry[]} fallback
 * @property {Set<string | string[]>} aliasFields
 * @property {(function(ResolveRequest): boolean)} cachePredicate
 * @property {boolean} cacheWithContext
 * @property {Set<string>} conditionNames A list of exports field condition names.
 * @property {string[]} descriptionFiles
 * @property {boolean} enforceExtension
 * @property {Set<string | string[]>} exportsFields
 * @property {Set<string | string[]>} importsFields
 * @property {Set<string>} extensions
 * @property {FileSystem} fileSystem
 * @property {object | false} unsafeCache
 * @property {boolean} symlinks
 * @property {Resolver=} resolver
 * @property {Array<string | string[]>} modules
 * @property {{name: string[], forceRelative: boolean}[]} mainFields
 * @property {Set<string>} mainFiles
 * @property {Plugin[]} plugins
 * @property {PnpApi | null} pnpApi
 * @property {Set<string>} roots
 * @property {boolean} fullySpecified
 * @property {boolean} resolveToContext
 * @property {Set<string|RegExp>} restrictions
 * @property {boolean} preferRelative
 * @property {boolean} preferAbsolute
 */

/**
 * @param {PnpApi | null=} option option
 * @returns {PnpApi | null} processed option
 */
function processPnpApiOption(option) {
	if (
		option === undefined &&
		/** @type {NodeJS.ProcessVersions & {pnp: string}} */ versions.pnp
	) {
		// @ts-ignore
		return require("pnpapi"); // eslint-disable-line node/no-missing-require
	}

	return option || null;
}

/**
 * @param {AliasOptions | AliasOptionEntry[] | undefined} alias alias
 * @returns {AliasOptionEntry[]} normalized aliases
 */
function normalizeAlias(alias) {
	return typeof alias === "object" && !Array.isArray(alias) && alias !== null
		? Object.keys(alias).map(key => {
				/** @type {AliasOptionEntry} */
				const obj = { name: key, onlyModule: false, alias: alias[key] };

				if (/\$$/.test(key)) {
					obj.onlyModule = true;
					obj.name = key.substr(0, key.length - 1);
				}

				return obj;
		  })
		: /** @type {Array<AliasOptionEntry>} */ (alias) || [];
}

/**
 * @param {UserResolveOptions} options input options
 * @returns {ResolveOptions} output options
 */
// 返回 标准化 后的用户选项(UserResolveOptions) 即: ResolveOptions
function createOptions(options) {
	const mainFieldsSet = new Set(options.mainFields || ["main"]);
	const mainFields = [];

	// 标准化 UserResolveOptions.mainFields
	// ['main', ['index'], {name: ['root'], forceRelative: true}]
	// =>
	// [
	// 	{ name: ['main'], forceRelative: true},
	// 	{ name: ['index'], forceRelative: true},
	// 	{ name: ['root'], forceRelative: true},
	// ]
	for (const item of mainFieldsSet) {
		// 字符串类型
		if (typeof item === "string") {
			mainFields.push({
				name: [item],
				forceRelative: true
			});
		} 
		// 数组类型
		else if (Array.isArray(item)) {
			mainFields.push({
				name: item,
				forceRelative: true
			});
		} 
		// 对象类型
		else {
			mainFields.push({
				name: Array.isArray(item.name) ? item.name : [item.name],
				forceRelative: item.forceRelative
			});
		}
	}

	return {
		alias: normalizeAlias(options.alias),
		fallback: normalizeAlias(options.fallback),
		aliasFields: new Set(options.aliasFields),
		cachePredicate:
			options.cachePredicate ||
			function () {
				return true;
			},
		cacheWithContext:
			typeof options.cacheWithContext !== "undefined"
				? options.cacheWithContext
				: true,
		exportsFields: new Set(options.exportsFields || ["exports"]),
		importsFields: new Set(options.importsFields || ["imports"]),
		conditionNames: new Set(options.conditionNames),
		descriptionFiles: Array.from(
			new Set(options.descriptionFiles || ["package.json"])
		),
		enforceExtension:
			options.enforceExtension === undefined
				? options.extensions && options.extensions.includes("")
					? true
					: false
				: options.enforceExtension,
		extensions: new Set(options.extensions || [".js", ".json", ".node"]),
		fileSystem: options.useSyncFileSystemCalls
			? new SyncAsyncFileSystemDecorator(
					/** @type {SyncFileSystem} */ (
						/** @type {unknown} */ (options.fileSystem)
					)
			  )
			: options.fileSystem,
		unsafeCache:
			options.unsafeCache && typeof options.unsafeCache !== "object"
				? {}
				: options.unsafeCache || false,
		symlinks: typeof options.symlinks !== "undefined" ? options.symlinks : true,
		resolver: options.resolver,
		modules: mergeFilteredToArray(
			Array.isArray(options.modules)
				? options.modules
				: options.modules
				? [options.modules]
				: ["node_modules"],
			item => {
				const type = getType(item);
				return type === PathType.Normal || type === PathType.Relative;
			}
		),
		mainFields,
		mainFiles: new Set(options.mainFiles || ["index"]),
		plugins: options.plugins || [],
		pnpApi: processPnpApiOption(options.pnpApi),
		// 
		roots: new Set(options.roots || undefined),
		// 
		fullySpecified: options.fullySpecified || false,
		resolveToContext: options.resolveToContext || false,
		preferRelative: options.preferRelative || false,
		preferAbsolute: options.preferAbsolute || false,
		restrictions: new Set(options.restrictions)
	};
}

/**
 * @param {UserResolveOptions} options resolve options
 * @returns {Resolver} created resolver
 */
exports.createResolver = function (options) {
	const normalizedOptions = createOptions(options);

	const {
		alias,
		fallback,
		aliasFields,
		cachePredicate,
		cacheWithContext,
		conditionNames,
		descriptionFiles,
		enforceExtension,
		exportsFields,
		importsFields,
		extensions,
		fileSystem,
		fullySpecified,
		mainFields,
		mainFiles,
		modules,
		plugins: userPlugins,
		pnpApi,
		resolveToContext,
		preferRelative,
		preferAbsolute,
		symlinks,
		unsafeCache,
		resolver: customResolver,
		restrictions,
		roots
	} = normalizedOptions;

	const plugins = userPlugins.slice();

	const resolver = customResolver
		? customResolver
		: new Resolver(fileSystem, normalizedOptions);

	//// pipeline ////

	resolver.ensureHook("resolve");
	resolver.ensureHook("internalResolve");
	resolver.ensureHook("newInteralResolve");
	resolver.ensureHook("parsedResolve");
	resolver.ensureHook("describedResolve");
	resolver.ensureHook("internal");
	resolver.ensureHook("rawModule");
	resolver.ensureHook("module");
	resolver.ensureHook("resolveAsModule");
	resolver.ensureHook("undescribedResolveInPackage");
	resolver.ensureHook("resolveInPackage");
	resolver.ensureHook("resolveInExistingDirectory");
	resolver.ensureHook("relative");
	resolver.ensureHook("describedRelative");
	resolver.ensureHook("directory");
	resolver.ensureHook("undescribedExistingDirectory");
	resolver.ensureHook("existingDirectory");
	resolver.ensureHook("undescribedRawFile");
	resolver.ensureHook("rawFile");
	resolver.ensureHook("file");
	resolver.ensureHook("finalFile");
	resolver.ensureHook("existingFile");
	resolver.ensureHook("resolved");

	// 注册插件
	// resolve
	for (const { source, resolveOptions } of [
		{ source: "resolve", resolveOptions: { fullySpecified } },
		{ source: "internal-resolve", resolveOptions: { fullySpecified: false } }
	]) {
		if (unsafeCache) {
			plugins.push(
				new UnsafeCachePlugin(
					source,
					cachePredicate,
					unsafeCache,
					cacheWithContext,
					`new-${source}`
				)
			);
			plugins.push(
				new ParsePlugin(`new-${source}`, resolveOptions, "parsed-resolve")
			);
		} else {
			plugins.push(new ParsePlugin(source, resolveOptions, "parsed-resolve"));
		}
	}

	// parsed-resolve
	plugins.push(
		new DescriptionFilePlugin(
			"parsed-resolve",
			descriptionFiles,
			false,
			"described-resolve"
		)
	);
	plugins.push(new NextPlugin("after-parsed-resolve", "described-resolve"));

	// described-resolve
	plugins.push(new NextPlugin("described-resolve", "normal-resolve"));
	if (fallback.length > 0) {
		plugins.push(
			new AliasPlugin("described-resolve", fallback, "internal-resolve")
		);
	}

	// normal-resolve
	if (alias.length > 0)
		plugins.push(new AliasPlugin("normal-resolve", alias, "internal-resolve"));
	aliasFields.forEach(item => {
		plugins.push(
			new AliasFieldPlugin("normal-resolve", item, "internal-resolve")
		);
	});
	if (preferRelative) {
		plugins.push(new JoinRequestPlugin("after-normal-resolve", "relative"));
	}
	plugins.push(
		new ConditionalPlugin(
			"after-normal-resolve",
			{ module: true },
			"resolve as module",
			false,
			"raw-module"
		)
	);
	plugins.push(
		new ConditionalPlugin(
			"after-normal-resolve",
			{ internal: true },
			"resolve as internal import",
			false,
			"internal"
		)
	);
	if (preferAbsolute) {
		plugins.push(new JoinRequestPlugin("after-normal-resolve", "relative"));
	}
	if (roots.size > 0) {
		plugins.push(new RootsPlugin("after-normal-resolve", roots, "relative"));
	}
	if (!preferRelative && !preferAbsolute) {
		plugins.push(new JoinRequestPlugin("after-normal-resolve", "relative"));
	}

	// internal
	importsFields.forEach(importsField => {
		plugins.push(
			new ImportsFieldPlugin(
				"internal",
				conditionNames,
				importsField,
				"relative",
				"internal-resolve"
			)
		);
	});

	// raw-module
	exportsFields.forEach(exportsField => {
		plugins.push(
			new SelfReferencePlugin("raw-module", exportsField, "resolve-as-module")
		);
	});
	modules.forEach(item => {
		if (Array.isArray(item)) {
			if (item.includes("node_modules") && pnpApi) {
				plugins.push(
					new ModulesInHierachicDirectoriesPlugin(
						"raw-module",
						item.filter(i => i !== "node_modules"),
						"module"
					)
				);
				plugins.push(
					new PnpPlugin("raw-module", pnpApi, "undescribed-resolve-in-package")
				);
			} else {
				plugins.push(
					new ModulesInHierachicDirectoriesPlugin("raw-module", item, "module")
				);
			}
		} else {
			plugins.push(new ModulesInRootPlugin("raw-module", item, "module"));
		}
	});

	// module
	plugins.push(new JoinRequestPartPlugin("module", "resolve-as-module"));

	// resolve-as-module
	if (!resolveToContext) {
		plugins.push(
			new ConditionalPlugin(
				"resolve-as-module",
				{ directory: false, request: "." },
				"single file module",
				true,
				"undescribed-raw-file"
			)
		);
	}
	plugins.push(
		new DirectoryExistsPlugin(
			"resolve-as-module",
			"undescribed-resolve-in-package"
		)
	);

	// undescribed-resolve-in-package
	plugins.push(
		new DescriptionFilePlugin(
			"undescribed-resolve-in-package",
			descriptionFiles,
			false,
			"resolve-in-package"
		)
	);
	plugins.push(
		new NextPlugin("after-undescribed-resolve-in-package", "resolve-in-package")
	);

	// resolve-in-package
	exportsFields.forEach(exportsField => {
		plugins.push(
			new ExportsFieldPlugin(
				"resolve-in-package",
				conditionNames,
				exportsField,
				"relative"
			)
		);
	});
	plugins.push(
		new NextPlugin("resolve-in-package", "resolve-in-existing-directory")
	);

	// resolve-in-existing-directory
	plugins.push(
		new JoinRequestPlugin("resolve-in-existing-directory", "relative")
	);

	// relative
	plugins.push(
		new DescriptionFilePlugin(
			"relative",
			descriptionFiles,
			true,
			"described-relative"
		)
	);
	plugins.push(new NextPlugin("after-relative", "described-relative"));

	// described-relative
	if (resolveToContext) {
		plugins.push(new NextPlugin("described-relative", "directory"));
	} else {
		plugins.push(
			new ConditionalPlugin(
				"described-relative",
				{ directory: false },
				null,
				true,
				"raw-file"
			)
		);
		plugins.push(
			new ConditionalPlugin(
				"described-relative",
				{ fullySpecified: false },
				"as directory",
				true,
				"directory"
			)
		);
	}

	// directory
	plugins.push(
		new DirectoryExistsPlugin("directory", "undescribed-existing-directory")
	);

	if (resolveToContext) {
		// undescribed-existing-directory
		plugins.push(new NextPlugin("undescribed-existing-directory", "resolved"));
	} else {
		// undescribed-existing-directory
		plugins.push(
			new DescriptionFilePlugin(
				"undescribed-existing-directory",
				descriptionFiles,
				false,
				"existing-directory"
			)
		);
		mainFiles.forEach(item => {
			plugins.push(
				new UseFilePlugin(
					"undescribed-existing-directory",
					item,
					"undescribed-raw-file"
				)
			);
		});

		// described-existing-directory
		mainFields.forEach(item => {
			plugins.push(
				new MainFieldPlugin(
					"existing-directory",
					item,
					"resolve-in-existing-directory"
				)
			);
		});
		mainFiles.forEach(item => {
			plugins.push(
				new UseFilePlugin("existing-directory", item, "undescribed-raw-file")
			);
		});

		// undescribed-raw-file
		plugins.push(
			new DescriptionFilePlugin(
				"undescribed-raw-file",
				descriptionFiles,
				true,
				"raw-file"
			)
		);
		plugins.push(new NextPlugin("after-undescribed-raw-file", "raw-file"));

		// raw-file
		plugins.push(
			new ConditionalPlugin(
				"raw-file",
				{ fullySpecified: true },
				null,
				false,
				"file"
			)
		);
		if (!enforceExtension) {
			plugins.push(new TryNextPlugin("raw-file", "no extension", "file"));
		}
		extensions.forEach(item => {
			plugins.push(new AppendPlugin("raw-file", item, "file"));
		});

		// file
		if (alias.length > 0)
			plugins.push(new AliasPlugin("file", alias, "internal-resolve"));
		aliasFields.forEach(item => {
			plugins.push(new AliasFieldPlugin("file", item, "internal-resolve"));
		});
		plugins.push(new NextPlugin("file", "final-file"));

		// final-file
		plugins.push(new FileExistsPlugin("final-file", "existing-file"));

		// existing-file
		if (symlinks)
			plugins.push(new SymlinkPlugin("existing-file", "existing-file"));
		plugins.push(new NextPlugin("existing-file", "resolved"));
	}

	// resolved
	if (restrictions.size > 0) {
		plugins.push(new RestrictionsPlugin(resolver.hooks.resolved, restrictions));
	}
	plugins.push(new ResultPlugin(resolver.hooks.resolved));

	//// RESOLVER ////

	// 使用插件
	for (const plugin of plugins) {
		if (typeof plugin === "function") {
			plugin.call(resolver, resolver);
		} else {
			plugin.apply(resolver);
		}
	}

	return resolver;
};

/**
 * Merging filtered elements
 * @param {string[]} array source array
 * @param {function(string): boolean} filter predicate
 * @returns {Array<string | string[]>} merge result
 */
function mergeFilteredToArray(array, filter) {
	/** @type {Array<string | string[]>} */
	const result = [];
	const set = new Set(array);

	for (const item of set) {
		if (filter(item)) {
			const lastElement =
				result.length > 0 ? result[result.length - 1] : undefined;
			if (Array.isArray(lastElement)) {
				lastElement.push(item);
			} else {
				result.push([item]);
			}
		} else {
			result.push(item);
		}
	}

	return result;
}
