"use strict";

// 根据 特定的匹配规则 来忽视webpack警告
class IgnoreWarningsPlugin {
	constructor(ignoreWarnings) {
		// Webpack.Config.ignoreWarnings
		this._ignoreWarnings = ignoreWarnings;
	}

	apply(compiler) {
		// 筛选warnings 并返回warnings
		compiler.hooks.compilation.tap("IgnoreWarningsPlugin", compilation => {
			compilation.hooks.processWarnings.tap(
				"IgnoreWarningsPlugin",
				warnings => {
					return warnings.filter(warning => {
						return !this._ignoreWarnings.some(ignore =>
							ignore(warning, compilation)
						);
					});
				}
			);
		});
	}
}

module.exports = IgnoreWarningsPlugin;
