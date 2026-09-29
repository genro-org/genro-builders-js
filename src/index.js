// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

export {
    SourceBag, SourceBagNode, wrapSource, sourceTarget, VALUE, META_ATTRS,
    sourceBagToTytx, sourceBagFromTytx, sourceAttributeItems,
} from './source-bag.js';
export { BuilderBase, SOURCE_ROOT, DATA_ROOT, DATA_ELEMENT_FIELDS } from './builder-base.js';
export { RendererBase } from './renderer/base.js';
export { XmlRenderer } from './renderer/xml.js';
export { HtmlRenderer } from './renderer/html.js';
export { SvgRenderer, svgAttributes } from './renderer/svg.js';
export { HtmlBuilder } from './builder/html.js';
export { SvgBuilder } from './builder/svg.js';

export { resolveRenderTag } from './utils.js';

export { Collection } from './collection.js';
