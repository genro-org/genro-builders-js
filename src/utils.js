// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

/** Python 3 keywords used by the Python builder's identifier escapes. */
const PYTHON_KEYWORDS = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
    'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
    'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

/** Decode the suffix form only when it escapes a Python keyword. */
export function pythonKeywordSuffix(name) {
    return name.endsWith('_') && PYTHON_KEYWORDS.has(name.slice(0, -1))
        ? name.slice(0, -1)
        : name;
}

/** Decode Python's current suffix and legacy prefix attribute forms. */
export function pythonKeywordAttribute(name) {
    const suffix = pythonKeywordSuffix(name);
    if (suffix !== name) return suffix;
    return name.startsWith('_') && PYTHON_KEYWORDS.has(name.slice(1))
        ? name.slice(1)
        : name;
}

/** Resolve the emitted tag consistently across static and object renderers. */
export function resolveRenderTag(sourceTag, {renderTag = null, ns = null, dialectName = null} = {}) {
    let tag = renderTag || sourceTag;
    if (!tag) return tag;
    tag = pythonKeywordSuffix(tag);
    if (ns && !renderTag) {
        const prefix = `${dialectName}_`;
        if (tag.startsWith(prefix)) tag = tag.slice(prefix.length);
        tag = `${ns}:${tag}`;
    }
    return tag;
}
