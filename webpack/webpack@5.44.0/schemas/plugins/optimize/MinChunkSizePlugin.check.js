/*
 * This file was automatically generated.
 * DO NOT MODIFY BY HAND.
 * Run `yarn special-lint-fix` to update
 */
"use strict";function r(e,{instancePath:t="",parentData:i,parentDataProperty:n,rootData:o=e}={}){if(!e||"object"!=typeof e||Array.isArray(e))return r.errors=[{params:{type:"object"}}],!1;{let t;if(void 0===e.minChunkSize&&(t="minChunkSize"))return r.errors=[{params:{missingProperty:t}}],!1;{const t=0;for(const t in e)if("chunkOverhead"!==t&&"entryChunkMultiplicator"!==t&&"minChunkSize"!==t)return r.errors=[{params:{additionalProperty:t}}],!1;if(0===t){if(void 0!==e.chunkOverhead){let t=e.chunkOverhead;const i=0;if("number"!=typeof t||!isFinite(t))return r.errors=[{params:{type:"number"}}],!1;var a=0===i}else a=!0;if(a){if(void 0!==e.entryChunkMultiplicator){let t=e.entryChunkMultiplicator;const i=0;if("number"!=typeof t||!isFinite(t))return r.errors=[{params:{type:"number"}}],!1;a=0===i}else a=!0;if(a)if(void 0!==e.minChunkSize){let t=e.minChunkSize;const i=0;if("number"!=typeof t||!isFinite(t))return r.errors=[{params:{type:"number"}}],!1;a=0===i}else a=!0}}}}return r.errors=null,!0}module.exports=r,module.exports.default=r;