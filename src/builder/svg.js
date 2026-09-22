// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** DOM-free SVG builder backed by the exported Python grammar. */
import SVG_GRAMMAR from '../collections/svg.json' with { type: 'json' };
import { BuilderBase } from '../builder-base.js';
import { SvgRenderer } from '../renderer/svg.js';

export class SvgBuilder extends BuilderBase {
    static _name = 'svg';
    static _defaultRenderMode = 'svg';
    static { this.defineGrammar(SVG_GRAMMAR); }

    get renderer_svg() { return new SvgRenderer(this); }
}

BuilderBase.registerBuilder(SvgBuilder);
