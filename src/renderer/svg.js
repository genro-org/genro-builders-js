// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** Static SVG text renderer. No browser or DOM dependency. */
import { XmlRenderer } from './xml.js';

const KEBAB_ATTRS = new Set([
    'alignment_baseline', 'baseline_shift', 'clip_path', 'clip_rule',
    'color_interpolation', 'color_interpolation_filters', 'dominant_baseline',
    'fill_opacity', 'fill_rule', 'flood_color', 'flood_opacity',
    'font_family', 'font_size', 'font_size_adjust', 'font_stretch',
    'font_style', 'font_variant', 'font_weight', 'glyph_orientation_horizontal',
    'glyph_orientation_vertical', 'image_rendering', 'letter_spacing',
    'lighting_color', 'marker_end', 'marker_mid', 'marker_start',
    'overline_position', 'overline_thickness', 'paint_order',
    'pointer_events', 'shape_rendering', 'stop_color', 'stop_opacity',
    'strikethrough_position', 'strikethrough_thickness', 'stroke_dasharray',
    'stroke_dashoffset', 'stroke_linecap', 'stroke_linejoin',
    'stroke_miterlimit', 'stroke_opacity', 'stroke_width',
    'text_anchor', 'text_decoration', 'text_rendering',
    'underline_position', 'underline_thickness', 'unicode_bidi',
    'word_spacing', 'writing_mode',
]);


/** Adapt native grammar attribute names to SVG wire names. */
export function svgAttributes(attrs) {
    return Object.fromEntries(Object.entries(attrs || {}).map(([name, value]) => [
        KEBAB_ATTRS.has(name) ? name.replaceAll('_', '-') : name,
        value,
    ]));
}

/** SVG specializes attribute spelling; XML owns composition and serialization. */
export class SvgRenderer extends XmlRenderer {
    static mode = 'svg';

    adaptAttrs(attrs) { return svgAttributes(attrs); }
}
