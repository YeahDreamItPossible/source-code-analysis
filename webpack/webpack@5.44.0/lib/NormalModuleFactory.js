"use strict";

const asyncLib = require("neo-async");
const {
	AsyncSeriesBailHook,
	SyncWaterfallHook,
	SyncBailHook,
	SyncHook,
	HookMap
} = require("tapable");
const ChunkGraph = require("./ChunkGraph");
const Module = require("./Module");
const ModuleFactory = require("./ModuleFactory");
const ModuleGraph = require("./ModuleGraph");
const NormalModule = require("./NormalModule");
const BasicEffectRulePlugin = require("./rules/BasicEffectRulePlugin");
const BasicMatcherRulePlugin = require("./rules/BasicMatcherRulePlugin");
const DescriptionDataMatcherRulePlugin = require("./rules/DescriptionDataMatcherRulePlugin");
const RuleSetCompiler = require("./rules/RuleSetCompiler");
const UseEffectRulePlugin = require("./rules/UseEffectRulePlugin");
const LazySet = require("./util/LazySet");
const { getScheme } = require("./util/URLAbsoluteSpecifier");
const { cachedCleverMerge, cachedSetProperty } = require("./util/cleverMerge");
const { join } = require("./util/fs");
const { parseResource } = require("./util/identifier");

const EMPTY_RESOLVE_OPTIONS = {};
const EMPTY_PARSER_OPTIONS = {};
const EMPTY_GENERATOR_OPTIONS = {};

const MATCH_RESOURCE_REGEX = /^([^!]+)!=!/;

// 返回loader的完整路径(包括参数)
const loaderToIdent = data => {
	if (!data.options) {
		return data.loader;
	}
	if (typeof data.options === "string") {
		return data.loader + "?" + data.options;
	}
	if (typeof data.options !== "object") {
		throw new Error("loader options must be string or object");
	}
	if (data.ident) {
		return data.loader + "??" + data.ident;
	}
	return data.loader + "?" + JSON.stringify(data.options);
};

// 返回模块的完整路径(包括loader路径和模块路径)
// loader路径是绝对路径 且包括路径参数
// 模块路径是绝对路径 且包括路径参数
const stringifyLoadersAndResource = (loaders, resource) => {
	let str = "";
	for (const loader of loaders) {
		str += loaderToIdent(loader) + "!";
	}
	return str + resource;
};

// 根据loader路径转换成({ loader: String, options: String})
const identToLoaderRequest = resultString => {
	const idx = resultString.indexOf("?");
	if (idx >= 0) {
		const loader = resultString.substr(0, idx);
		const options = resultString.substr(idx + 1);
		return {
			loader,
			options
		};
	} else {
		return {
			loader: resultString,
			options: undefined
		};
	}
};

const needCalls = (times, callback) => {
	return err => {
		if (--times === 0) {
			return callback(err);
		}
		if (err && times > 0) {
			times = NaN;
			return callback(err);
		}
	};
};

const mergeGlobalOptions = (globalOptions, type, localOptions) => {
	const parts = type.split("/");
	let result;
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		const options = globalOptions[current];
		if (typeof options === "object") {
			if (result === undefined) {
				result = options;
			} else {
				result = cachedCleverMerge(result, options);
			}
		}
	}
	if (result === undefined) {
		return localOptions;
	} else {
		return cachedCleverMerge(result, localOptions);
	}
};

// TODO webpack 6 remove
const deprecationChangedHookMessage = (name, hook) => {
	const names = hook.taps
		.map(tapped => {
			return tapped.name;
		})
		.join(", ");

	return (
		`NormalModuleFactory.${name} (${names}) is no longer a waterfall hook, but a bailing hook instead. ` +
		"Do not return the passed object, but modify it instead. " +
		"Returning false will ignore the request and results in no module created."
	);
};

/** @type {WeakMap<ModuleDependency, ModuleFactoryResult & { module: { restoreFromUnsafeCache: Function }}>} */
const unsafeCacheDependencies = new WeakMap();

/** @type {WeakMap<Module, object>} */
const unsafeCacheData = new WeakMap();

// 返回 RuleSetCompiler 的实例
const ruleSetCompiler = new RuleSetCompiler([
	new BasicMatcherRulePlugin("test", "resource"),
	new BasicMatcherRulePlugin("scheme"),
	new BasicMatcherRulePlugin("mimetype"),
	new BasicMatcherRulePlugin("dependency"),
	new BasicMatcherRulePlugin("include", "resource"),
	new BasicMatcherRulePlugin("exclude", "resource", true),
	new BasicMatcherRulePlugin("resource"),
	new BasicMatcherRulePlugin("resourceQuery"),
	new BasicMatcherRulePlugin("resourceFragment"),
	new BasicMatcherRulePlugin("realResource"),
	new BasicMatcherRulePlugin("issuer"),
	new BasicMatcherRulePlugin("compiler"),
	new BasicMatcherRulePlugin("issuerLayer"),
	new DescriptionDataMatcherRulePlugin(),
	new BasicEffectRulePlugin("type"),
	new BasicEffectRulePlugin("sideEffects"),
	new BasicEffectRulePlugin("parser"),
	new BasicEffectRulePlugin("resolve"),
	new BasicEffectRulePlugin("generator"),
	new BasicEffectRulePlugin("layer"),
	new UseEffectRulePlugin()
]);

/**
 * 主要作用是获取创建 NormalModule 的所有参数 如下:
 * 1. 获取所有的loader
 * 2. 获取resolver parser generator
 * 3. 生成NormalModule
 * 在获取所有loaders的过程中
 * 1. 根据模块加载路径来获取所有的loaders 并根据模块路径中的前缀(! !! -!)进行筛选
 * 2. 根据匹配规则来筛选匹配后的loaders
 */
/**
 * loader分类
 * 1. 前置loader(preLoader)
 * 2. 普通loader(loader)
 * 3. 后置loader(postLoaders)
 */
class NormalModuleFactory extends ModuleFactory {
	/**
	 * @param {Object} param params
	 * @param {string=} param.context context
	 * @param {InputFileSystem} param.fs file system
	 * @param {ResolverFactory} param.resolverFactory resolverFactory
	 * @param {ModuleOptions} param.options options
	 * @param {Object=} param.associatedObjectForCache an object to which the cache will be attached
	 * @param {boolean=} param.layers enable layers
	 */
	constructor({
		context,
		fs,
		resolverFactory,
		options,
		associatedObjectForCache,
		layers = false
	}) {
		super();
		this.hooks = Object.freeze({
			/** @type {AsyncSeriesBailHook<[ResolveData], TODO>} */
			resolve: new AsyncSeriesBailHook(["resolveData"]),
			/** @type {HookMap<AsyncSeriesBailHook<[ResourceDataWithData, ResolveData], true | void>>} */
			resolveForScheme: new HookMap(
				() => new AsyncSeriesBailHook(["resourceData", "resolveData"])
			),
			/** @type {AsyncSeriesBailHook<[ResolveData], TODO>} */
			factorize: new AsyncSeriesBailHook(["resolveData"]),
			/** @type {AsyncSeriesBailHook<[ResolveData], TODO>} */
			beforeResolve: new AsyncSeriesBailHook(["resolveData"]),
			/** @type {AsyncSeriesBailHook<[ResolveData], TODO>} */
			afterResolve: new AsyncSeriesBailHook(["resolveData"]),
			/** @type {AsyncSeriesBailHook<[ResolveData["createData"], ResolveData], TODO>} */
			createModule: new AsyncSeriesBailHook(["createData", "resolveData"]),
			/** @type {SyncWaterfallHook<[Module, ResolveData["createData"], ResolveData], TODO>} */
			module: new SyncWaterfallHook(["module", "createData", "resolveData"]),
			createParser: new HookMap(() => new SyncBailHook(["parserOptions"])),
			parser: new HookMap(() => new SyncHook(["parser", "parserOptions"])),
			createGenerator: new HookMap(
				() => new SyncBailHook(["generatorOptions"])
			),
			generator: new HookMap(
				() => new SyncHook(["generator", "generatorOptions"])
			)
		});
		this.resolverFactory = resolverFactory;

		// module rules
		this.ruleSet = ruleSetCompiler.compile([
			{
				rules: options.defaultRules
			},
			{
				rules: options.rules
			}
		]);

		this.unsafeCache = !!options.unsafeCache;
		this.cachePredicate =
			typeof options.unsafeCache === "function"
				? options.unsafeCache
				: () => true;
		this.context = context || "";
		this.fs = fs;

		// 用户自定义解析器(Webpack.Config.Module.parser)
		this._globalParserOptions = options.parser;
		// 用户自定义生成器(Wepback.Config.Module.generator)
		this._globalGeneratorOptions = options.generator;
		// Map<Type, WeakMap<ParserOptions, Parser>
		this.parserCache = new Map();
		// Map<Type, WeakMap<GeneratorOptions, Generator>
		this.generatorCache = new Map();
		/** @type {Set<Module>} */
		this._restoredUnsafeCacheEntries = new Set();

		const cacheParseResource = parseResource.bindCache(
			associatedObjectForCache
		);

		this.hooks.factorize.tapAsync(
			{
				name: "NormalModuleFactory",
				stage: 100
			},
			(resolveData, callback) => {
				this.hooks.resolve.callAsync(resolveData, (err, result) => {
					if (err) return callback(err);

					// Ignored
					if (result === false) return callback();

					// direct module
					if (result instanceof Module) return callback(null, result);

					if (typeof result === "object")
						throw new Error(
							deprecationChangedHookMessage("resolve", this.hooks.resolve) +
								" Returning a Module object will result in this module used as result."
						);

					// 直接执行回调
					this.hooks.afterResolve.callAsync(resolveData, (err, result) => {
						if (err) return callback(err);

						if (typeof result === "object")
							throw new Error(
								deprecationChangedHookMessage(
									"afterResolve",
									this.hooks.afterResolve
								)
							);

						// Ignored
						if (result === false) return callback();

						const createData = resolveData.createData;

						// 直接执行回调
						this.hooks.createModule.callAsync(
							createData,
							resolveData,
							(err, createdModule) => {
								if (!createdModule) {
									if (!resolveData.request) {
										return callback(new Error("Empty dependency (no request)"));
									}

									// 创建NormalModule
									createdModule = new NormalModule(createData);
								}

								// SideEffectsFlagPlugin
								createdModule = this.hooks.module.call(
									createdModule,
									createData,
									resolveData
								);

								return callback(null, createdModule);
							}
						);
					});
				});
			}
		);
		this.hooks.resolve.tapAsync(
			{
				name: "NormalModuleFactory",
				stage: 100
			},
			(data, callback) => {
				const {
					contextInfo,
					context,
					dependencies,
					request,
					resolveOptions,
					fileDependencies,
					missingDependencies,
					contextDependencies
				} = data;
				const dependencyType =
					(dependencies.length > 0 && dependencies[0].category) || "";
				const loaderResolver = this.getResolver("loader");

				/** @type {ResourceData | undefined} */
				let matchResourceData = undefined;
				// 模块引入路径(该路径包括loader路径和模块路径)
				let requestWithoutMatchResource = request;
				// 以 `(任意字符,除了!){1,}!=!` 开头
				// MATCH_RESOURCE_REGEX = /^([^!]+)!=!/
				const matchResourceMatch = MATCH_RESOURCE_REGEX.exec(request);
				if (matchResourceMatch) {
					let matchResource = matchResourceMatch[1];
					// 如果是相对路径 则转化为绝对路径
					if (matchResource.charCodeAt(0) === 46) {
						// 46 === ".", 47 === "/"
						const secondChar = matchResource.charCodeAt(1);
						if (
							secondChar === 47 ||
							(secondChar === 46 && matchResource.charCodeAt(2) === 47)
						) {
							// matchResources以 ./ or ../ 开头
							matchResource = join(this.fs, context, matchResource);
						}
					}
					matchResourceData = {
						resource: matchResource,
						...cacheParseResource(matchResource)
					};
					requestWithoutMatchResource = request.substr(
						matchResourceMatch[0].length
					);
				}
				
				// 模块路径是否有禁用loader规则
				const firstChar = requestWithoutMatchResource.charCodeAt(0);
				const secondChar = requestWithoutMatchResource.charCodeAt(1);
				// 使用 -! 前缀，将禁用所有已配置的 preLoader 和 loader，但是不禁用 postLoaders
				const noPreAutoLoaders = firstChar === 45 && secondChar === 33; // startsWith "-!"
				// 使用 ! 前缀，将禁用所有已配置的 normal loader(普通 loader)
				const noAutoLoaders = noPreAutoLoaders || firstChar === 33; // startsWith "!"
				// 使用 !! 前缀，将禁用所有已配置的 loader（preLoader, loader, postLoader）
				const noPrePostAutoLoaders = firstChar === 33 && secondChar === 33;
				// 模块引入路径中解析后的loaders路径
				const rawElements = requestWithoutMatchResource
					.slice(
						noPreAutoLoaders || noPrePostAutoLoaders ? 2 : noAutoLoaders ? 1 : 0
					)
					.split(/!+/);
				// 模块路径(不包括loaders路径)
				const unresolvedResource = rawElements.pop();
				// 正常化所有的loaders<Array<{ loader: String, options: String }>>
				// 此时每个loader的loader是相对路径
				const elements = rawElements.map(identToLoaderRequest);

				const resolveContext = {
					fileDependencies,
					missingDependencies,
					contextDependencies
				};

				/** @type {ResourceDataWithData} */
				let resourceData;
				/** @type {string | undefined} */
				const scheme = getScheme(unresolvedResource);

				let loaders;

				const continueCallback = needCalls(2, err => {
					if (err) return callback(err);

					// translate option idents
					try {
						for (const item of loaders) {
							if (typeof item.options === "string" && item.options[0] === "?") {
								const ident = item.options.substr(1);
								if (ident === "[[missing ident]]") {
									throw new Error(
										"No ident is provided by referenced loader. " +
											"When using a function for Rule.use in config you need to " +
											"provide an 'ident' property for referenced loader options."
									);
								}
								item.options = this.ruleSet.references.get(ident);
								if (item.options === undefined) {
									throw new Error(
										"Invalid ident is provided by referenced loader"
									);
								}
								item.ident = ident;
							}
						}
					} catch (e) {
						return callback(e);
					}

					if (!resourceData) {
						// ignored
						return callback(null, dependencies[0].createIgnoredModule(context));
					}

					const userRequest =
						(matchResourceData !== undefined
							? `${matchResourceData.resource}!=!`
							: "") +
						stringifyLoadersAndResource(loaders, resourceData.resource);

					const resourceDataForRules = matchResourceData || resourceData;
					// 通过匹配规则来获取Webpack.Config.Module.Rule中匹配的loaders
					const result = this.ruleSet.exec({
						resource: resourceDataForRules.path,
						realResource: resourceData.path,
						resourceQuery: resourceDataForRules.query,
						resourceFragment: resourceDataForRules.fragment,
						scheme,
						mimetype: matchResourceData ? "" : resourceData.data.mimetype || "",
						dependency: dependencyType,
						descriptionData: matchResourceData
							? undefined
							: resourceData.data.descriptionFileData,
						issuer: contextInfo.issuer,
						compiler: contextInfo.compiler,
						issuerLayer: contextInfo.issuerLayer || ""
					});
					// loaders分类
					const settings = {};
					// postLoader
					const useLoadersPost = [];
					// 正常loader
					const useLoaders = [];
					// preLoader
					const useLoadersPre = [];
					// 筛选preLoader loader postLoader
					for (const r of result) {
						if (r.type === "use") {
							if (!noAutoLoaders && !noPrePostAutoLoaders) {
								useLoaders.push(r.value);
							}
						} else if (r.type === "use-post") {
							if (!noPrePostAutoLoaders) {
								useLoadersPost.push(r.value);
							}
						} else if (r.type === "use-pre") {
							if (!noPreAutoLoaders && !noPrePostAutoLoaders) {
								useLoadersPre.push(r.value);
							}
						} else if (
							typeof r.value === "object" &&
							r.value !== null &&
							typeof settings[r.type] === "object" &&
							settings[r.type] !== null
						) {
							settings[r.type] = cachedCleverMerge(settings[r.type], r.value);
						} else {
							settings[r.type] = r.value;
						}
					}

					let postLoaders, normalLoaders, preLoaders;

					const continueCallback = needCalls(3, err => {
						if (err) {
							return callback(err);
						}
						// 筛选loaders
						const allLoaders = postLoaders;
						if (matchResourceData === undefined) {
							for (const loader of loaders) allLoaders.push(loader);
							for (const loader of normalLoaders) allLoaders.push(loader);
						} else {
							for (const loader of normalLoaders) allLoaders.push(loader);
							for (const loader of loaders) allLoaders.push(loader);
						}
						for (const loader of preLoaders) allLoaders.push(loader);
						let type = settings.type;
						if (!type) {
							const resource =
								(matchResourceData && matchResourceData.resource) ||
								resourceData.resource;
							let match;
							if (
								typeof resource === "string" &&
								(match = /\.webpack\[([^\]]+)\]$/.exec(resource))
							) {
								type = match[1];
							} else {
								type = "javascript/auto";
							}
						}
						const resolveOptions = settings.resolve;
						const layer = settings.layer;
						if (layer !== undefined && !layers) {
							return callback(
								new Error(
									"'Rule.layer' is only allowed when 'experiments.layers' is enabled"
								)
							);
						}
						try {
							Object.assign(data.createData, {
								layer:
									layer === undefined ? contextInfo.issuerLayer || null : layer,
								request: stringifyLoadersAndResource(
									allLoaders,
									resourceData.resource
								),
								userRequest,
								rawRequest: request,
								loaders: allLoaders,
								resource: resourceData.resource,
								matchResource: matchResourceData
									? matchResourceData.resource
									: undefined,
								resourceResolveData: resourceData.data,
								settings, // TODO:
								type,
								parser: this.getParser(type, settings.parser),
								parserOptions: settings.parser,
								generator: this.getGenerator(type, settings.generator),
								generatorOptions: settings.generator,
								resolveOptions
							});
						} catch (e) {
							return callback(e);
						}
						callback();
					});

					// 后置loaders
					this.resolveRequestArray(
						contextInfo,
						this.context,
						useLoadersPost,
						loaderResolver,
						resolveContext,
						(err, result) => {
							postLoaders = result;
							continueCallback(err);
						}
					);
					// 正常loaders
					this.resolveRequestArray(
						contextInfo,
						this.context,
						useLoaders,
						loaderResolver,
						resolveContext,
						(err, result) => {
							normalLoaders = result;
							continueCallback(err);
						}
					);
					// 前置loaders
					this.resolveRequestArray(
						contextInfo,
						this.context,
						useLoadersPre,
						loaderResolver,
						resolveContext,
						(err, result) => {
							preLoaders = result;
							continueCallback(err);
						}
					);
				});

				// 将每个loader的loader从相对路径转化成绝对路径
				this.resolveRequestArray(
					contextInfo,
					context,
					elements,
					loaderResolver,
					resolveContext,
					(err, result) => {
						if (err) return continueCallback(err);
						loaders = result;
						continueCallback();
					}
				);

				// resource with scheme
				if (scheme) {
					resourceData = {
						resource: unresolvedResource,
						data: {},
						path: undefined,
						query: undefined,
						fragment: undefined
					};
					this.hooks.resolveForScheme
						.for(scheme)
						.callAsync(resourceData, data, err => {
							if (err) return continueCallback(err);
							continueCallback();
						});
				}

				// resource without scheme and without path
				else if (/^($|\?)/.test(unresolvedResource)) {
					resourceData = {
						resource: unresolvedResource,
						data: {},
						...cacheParseResource(unresolvedResource)
					};
					continueCallback();
				}

				// resource without scheme and with path
				else {
					const normalResolver = this.getResolver(
						"normal",
						dependencyType
							? cachedSetProperty(
									resolveOptions || EMPTY_RESOLVE_OPTIONS,
									"dependencyType",
									dependencyType
							  )
							: resolveOptions
					);
					// 获取模块的绝对路径
					this.resolveResource(
						contextInfo,
						context,
						unresolvedResource,
						normalResolver,
						resolveContext,
						(err, resolvedResource, resolvedResourceResolveData) => {
							if (err) return continueCallback(err);
							if (resolvedResource !== false) {
								resourceData = {
									// 模块路径(绝对路径)
									resource: resolvedResource,
									data: resolvedResourceResolveData,
									...cacheParseResource(resolvedResource)
								};
							}
							continueCallback();
						}
					);
				}
			}
		);
	}

	cleanupForCache() {
		for (const module of this._restoredUnsafeCacheEntries) {
			ChunkGraph.clearChunkGraphForModule(module);
			ModuleGraph.clearModuleGraphForModule(module);
			module.cleanupForCache();
		}
	}

	// 创建模块
	create(data, callback) {
		const dependencies = /** @type {ModuleDependency[]} */ (data.dependencies);
		if (this.unsafeCache) {
			const cacheEntry = unsafeCacheDependencies.get(dependencies[0]);
			if (cacheEntry) {
				const { module } = cacheEntry;
				if (!this._restoredUnsafeCacheEntries.has(module)) {
					const data = unsafeCacheData.get(module);
					module.restoreFromUnsafeCache(data, this);
					this._restoredUnsafeCacheEntries.add(module);
				}
				return callback(null, cacheEntry);
			}
		}
		const context = data.context || this.context;
		const resolveOptions = data.resolveOptions || EMPTY_RESOLVE_OPTIONS;
		const dependency = dependencies[0];
		const request = dependency.request;
		const contextInfo = data.contextInfo;
		const fileDependencies = new LazySet();
		const missingDependencies = new LazySet();
		const contextDependencies = new LazySet();
		/** @type {ResolveData} */
		const resolveData = {
			contextInfo,
			resolveOptions,
			context,
			request,
			dependencies,
			fileDependencies,
			missingDependencies,
			contextDependencies,
			createData: {},
			cacheable: true
		};

		// 直接执行回调
		this.hooks.beforeResolve.callAsync(resolveData, (err, result) => {
			if (err) {
				return callback(err, {
					fileDependencies,
					missingDependencies,
					contextDependencies
				});
			}

			// Ignored
			if (result === false) {
				return callback(null, {
					fileDependencies,
					missingDependencies,
					contextDependencies
				});
			}

			if (typeof result === "object") {
				throw new Error(
					deprecationChangedHookMessage(
						"beforeResolve",
						this.hooks.beforeResolve
					)
				);
			}

			// 串行执行
			// ExternalModuleFactoryPlugin
			// NormalModuleFactory
			this.hooks.factorize.callAsync(resolveData, (err, module) => {
				// module 为 NormalModule 的实例
				if (err) {
					return callback(err, {
						fileDependencies,
						missingDependencies,
						contextDependencies
					});
				}

				const factoryResult = {
					module,
					fileDependencies,
					missingDependencies,
					contextDependencies
				};

				if (
					this.unsafeCache &&
					resolveData.cacheable &&
					module &&
					module.restoreFromUnsafeCache &&
					this.cachePredicate(module)
				) {
					for (const d of dependencies) {
						unsafeCacheDependencies.set(d, factoryResult);
					}
					if (!unsafeCacheData.has(module)) {
						unsafeCacheData.set(module, module.getUnsafeCacheData());
					}
					this._restoredUnsafeCacheEntries.add(module);
				}

				callback(null, factoryResult);
			});
		});
	}

	// 根据模块路径和上下文路径来获取模块的绝对路径
	resolveResource(
		contextInfo,
		context,
		unresolvedResource,
		resolver,
		resolveContext,
		callback
	) {
		resolver.resolve(
			contextInfo,
			context,
			unresolvedResource,
			resolveContext,
			(err, resolvedResource, resolvedResourceResolveData) => {
				if (err) {
					return this._resolveResourceErrorHints(
						err,
						contextInfo,
						context,
						unresolvedResource,
						resolver,
						resolveContext,
						(err2, hints) => {
							if (err2) {
								err.message += `
An fatal error happened during resolving additional hints for this error: ${err2.message}`;
								err.stack += `

An fatal error happened during resolving additional hints for this error:
${err2.stack}`;
								return callback(err);
							}
							if (hints && hints.length > 0) {
								err.message += `
${hints.join("\n\n")}`;
							}
							callback(err);
						}
					);
				}
				callback(err, resolvedResource, resolvedResourceResolveData);
			}
		);
	}

	_resolveResourceErrorHints(
		error,
		contextInfo,
		context,
		unresolvedResource,
		resolver,
		resolveContext,
		callback
	) {
		asyncLib.parallel(
			[
				callback => {
					if (!resolver.options.fullySpecified) return callback();
					resolver
						.withOptions({
							fullySpecified: false
						})
						.resolve(
							contextInfo,
							context,
							unresolvedResource,
							resolveContext,
							(err, resolvedResource) => {
								if (!err && resolvedResource) {
									const resource = parseResource(resolvedResource).path.replace(
										/^.*[\\/]/,
										""
									);
									return callback(
										null,
										`Did you mean '${resource}'?BREAKING CHANGE: The request '${unresolvedResource}' failed to resolve only because it was resolved as fully specified(probably because the origin is a '*.mjs' file or a '*.js' file where the package.json contains '"type": "module"')The extension in the request is mandatory for it to be fully specified.
Add the extension to the request.`
									);
								}
								callback();
							}
						);
				},
				callback => {
					if (!resolver.options.enforceExtension) return callback();
					resolver
						.withOptions({
							enforceExtension: false,
							extensions: []
						})
						.resolve(
							contextInfo,
							context,
							unresolvedResource,
							resolveContext,
							(err, resolvedResource) => {
								if (!err && resolvedResource) {
									let hint = "";
									const match = /(\.[^.]+)(\?|$)/.exec(unresolvedResource);
									if (match) {
										const fixedRequest = unresolvedResource.replace(
											/(\.[^.]+)(\?|$)/,
											"$2"
										);
										if (resolver.options.extensions.has(match[1])) {
											hint = `Did you mean '${fixedRequest}'?`;
										} else {
											hint = `Did you mean '${fixedRequest}'? Also note that '${match[1]}' is not in 'resolve.extensions' yet and need to be added for this to work?`;
										}
									} else {
										hint = `Did you mean to omit the extension or to remove 'resolve.enforceExtension'?`;
									}
									return callback(
										null,
										`The request '${unresolvedResource}' failed to resolve only because 'resolve.enforceExtension' was specified.
${hint}
Including the extension in the request is no longer possible. Did you mean to enforce including the extension in requests with 'resolve.extensions: []' instead?`
									);
								}
								callback();
							}
						);
				},
				callback => {
					if (
						/^\.\.?\//.test(unresolvedResource) ||
						resolver.options.preferRelative
					) {
						return callback();
					}
					resolver.resolve(
						contextInfo,
						context,
						`./${unresolvedResource}`,
						resolveContext,
						(err, resolvedResource) => {
							if (err || !resolvedResource) return callback();
							const moduleDirectories = resolver.options.modules
								.map(m => (Array.isArray(m) ? m.join(", ") : m))
								.join(", ");
							callback(
								null,
								`Did you mean './${unresolvedResource}'?
Requests that should resolve in the current directory need to start with './'.
Requests that start with a name are treated as module requests and resolve within module directories (${moduleDirectories}).
If changing the source code is not an option there is also a resolve options called 'preferRelative' which tries to resolve these kind of requests in the current directory too.`
							);
						}
					);
				}
			],
			(err, hints) => {
				if (err) return callback(err);
				callback(null, hints.filter(Boolean));
			}
		);
	}

	// 获取loaders中每个loader的绝对路径
	resolveRequestArray(
		contextInfo,
		context,
		array,
		resolver,
		resolveContext,
		callback
	) {
		if (array.length === 0) return callback(null, array);
		asyncLib.map(
			array,
			(item, callback) => {
				resolver.resolve(
					contextInfo,
					context,
					item.loader,
					resolveContext,
					(err, result) => {
						if (
							err &&
							/^[^/]*$/.test(item.loader) &&
							!/-loader$/.test(item.loader)
						) {
							return resolver.resolve(
								contextInfo,
								context,
								item.loader + "-loader",
								resolveContext,
								err2 => {
									if (!err2) {
										err.message =
											err.message +
											"\n" +
											"BREAKING CHANGE: It's no longer allowed to omit the '-loader' suffix when using loaders.\n" +
											`                 You need to specify '${item.loader}-loader' instead of '${item.loader}',\n` +
											"                 see https://webpack.js.org/migrate/3/#automatic-loader-module-name-extension-removed";
									}
									callback(err);
								}
							);
						}
						if (err) return callback(err);

						const parsedResult = identToLoaderRequest(result);
						const resolved = {
							loader: parsedResult.loader,
							options:
								item.options === undefined
									? parsedResult.options
									: item.options,
							ident: item.options === undefined ? undefined : item.ident
						};
						return callback(null, resolved);
					}
				);
			},
			callback
		);
	}

	// 返回parser 并缓存该type对应的parser
	getParser(type, parserOptions = EMPTY_PARSER_OPTIONS) {
		let cache = this.parserCache.get(type);

		if (cache === undefined) {
			cache = new WeakMap();
			this.parserCache.set(type, cache);
		}

		let parser = cache.get(parserOptions);

		if (parser === undefined) {
			parser = this.createParser(type, parserOptions);
			cache.set(parserOptions, parser);
		}

		return parser;
	}

	/**
	 * 根据type返回对应的内置parser
	 * asset || asset/inline || asset/resource || asset/source
	 * webassembly/async || webassembly/sync
	 * javascript/auto || javascript/dynamic || javascript/esm
	 * json
	 */
	createParser(type, parserOptions = {}) {
		parserOptions = mergeGlobalOptions(
			this._globalParserOptions,
			type,
			parserOptions
		);
		const parser = this.hooks.createParser.for(type).call(parserOptions);
		if (!parser) {
			throw new Error(`No parser registered for ${type}`);
		}
		this.hooks.parser.for(type).call(parser, parserOptions);
		return parser;
	}

	// 返回generator 并缓存该type对应的generator
	getGenerator(type, generatorOptions = EMPTY_GENERATOR_OPTIONS) {
		let cache = this.generatorCache.get(type);

		if (cache === undefined) {
			cache = new WeakMap();
			this.generatorCache.set(type, cache);
		}

		let generator = cache.get(generatorOptions);

		if (generator === undefined) {
			generator = this.createGenerator(type, generatorOptions);
			cache.set(generatorOptions, generator);
		}

		return generator;
	}

	/**
	 * 根据type返回对应的内置generator
	 * asset || asset/inline || asset/resource || asset/source
	 * webassembly/async || webassembly/sync
	 * javascript/auto || javascript/dynamic || javascript/esm
	 * json
	 */
	createGenerator(type, generatorOptions = {}) {
		generatorOptions = mergeGlobalOptions(
			this._globalGeneratorOptions,
			type,
			generatorOptions
		);
		const generator = this.hooks.createGenerator
			.for(type)
			.call(generatorOptions);
		if (!generator) {
			throw new Error(`No generator registered for ${type}`);
		}
		this.hooks.generator.for(type).call(generator, generatorOptions);
		return generator;
	}

	getResolver(type, resolveOptions) {
		return this.resolverFactory.get(type, resolveOptions);
	}
}

module.exports = NormalModuleFactory;
