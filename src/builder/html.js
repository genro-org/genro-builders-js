// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** DOM-free HTML5 builder backed by the exported Python grammar. */
import HTML5_GRAMMAR from '../collections/html5.json' with { type: 'json' };
import { BuilderBase } from '../builder-base.js';
import { HtmlRenderer } from '../renderer/html.js';

export class HtmlBuilder extends BuilderBase {
    static _name = 'html';
    static _defaultRenderMode = 'html';
    static retainedAttrPrefixes = ['validate_', 'dtype'];
    static { this.defineGrammar(HTML5_GRAMMAR); }

    get renderer_html() { return new HtmlRenderer(this); }
}

BuilderBase.registerBuilder(HtmlBuilder);
