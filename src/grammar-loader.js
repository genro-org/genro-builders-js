// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PARAM_KINDS = new Set(['positional_only', 'positional_or_keyword', 'keyword_only', 'var_positional', 'var_keyword']);
const PARAM_ROLES = new Set(['framework', 'value', 'attribute']);
const PRIMITIVES = new Map([
    ['builtins.str', v => typeof v === 'string'], ['builtins.int', v => Number.isInteger(v)],
    ['builtins.float', v => typeof v === 'number' && Number.isFinite(v)], ['builtins.bool', v => typeof v === 'boolean'],
    ['builtins.list', v => Array.isArray(v)], ['builtins.dict', v => v !== null && typeof v === 'object' && !Array.isArray(v)],
    ['builtins.tuple', v => Array.isArray(v)], ['builtins.set', v => Array.isArray(v) || v instanceof Set],
    ['builtins.NoneType', v => v === null], ['builtins.object', _v => true],
]);

function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fail(path, message) { throw new TypeError(`${path}: ${message}`); }
function exactKeys(value, allowed, required, path) {
    if (!plainObject(value)) fail(path, 'must be an object');
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(path, `unknown field '${key}'`);
    for (const key of required) if (!Object.hasOwn(value, key)) fail(path, `missing field '${key}'`);
}
function jsonValue(value, path) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (Array.isArray(value)) return value.forEach((v, i) => jsonValue(v, `${path}[${i}]`));
    if (plainObject(value)) return Object.entries(value).forEach(([k, v]) => jsonValue(v, `${path}.${k}`));
    fail(path, 'must be lossless JSON data');
}

function annotation(desc, path, nested = false) {
    if (desc === null) return null;
    exactKeys(desc, ['kind', 'module', 'name', 'origin', 'arguments', 'items', 'values', 'base', 'metadata', 'pattern', 'flags', 'ge', 'le', 'gt', 'lt', 'value'], ['kind'], path);
    switch (desc.kind) {
    case 'any': return { ...desc, test: _v => true };
    case 'type': {
        if (typeof desc.module !== 'string' || typeof desc.name !== 'string') fail(path, 'type requires string module/name');
        const key = `${desc.module}.${desc.name}`;
        if (key === 'collections.abc.Callable') return { ...desc, test: v => typeof v === 'function', portable: false };
        const test = PRIMITIVES.get(key); if (!test) fail(path, `unsupported type '${key}'`); return { ...desc, test };
    }
    case 'union': {
        if (!Array.isArray(desc.items) || !desc.items.length) fail(path, 'union items must be non-empty');
        const items = desc.items.map((v, i) => annotation(v, `${path}.items[${i}]`, true));
        return { ...desc, items, test: v => items.some(x => x.test && x.test(v)) };
    }
    case 'literal':
        if (!Array.isArray(desc.values)) fail(path, 'literal values must be an array');
        desc.values.forEach((v, i) => jsonValue(v, `${path}.values[${i}]`));
        return { ...desc, test: v => desc.values.some(x => Object.is(x, v)) };
    case 'annotated': {
        if (!Array.isArray(desc.metadata)) fail(path, 'annotated metadata must be an array');
        const base = annotation(desc.base, `${path}.base`, true);
        const metadata = desc.metadata.map((v, i) => annotation(v, `${path}.metadata[${i}]`, true));
        return { ...desc, base, metadata, test: v => base.test(v) && metadata.every(x => !x.test || x.test(v)) };
    }
    case 'range': {
        for (const key of ['ge', 'le', 'gt', 'lt']) if (!Object.hasOwn(desc, key)) fail(path, `range missing '${key}'`);
        for (const key of ['ge', 'le', 'gt', 'lt']) if (desc[key] !== null && (typeof desc[key] !== 'number' || !Number.isFinite(desc[key]))) fail(path, `${key} must be finite number or null`);
        return { ...desc, test: v => typeof v === 'number' && (desc.ge === null || v >= desc.ge) && (desc.le === null || v <= desc.le) && (desc.gt === null || v > desc.gt) && (desc.lt === null || v < desc.lt) };
    }
    case 'regex': {
        if (typeof desc.pattern !== 'string' || !Number.isInteger(desc.flags) || desc.flags < 0) fail(path, 'regex requires pattern and non-negative integer flags');
        const unsupported = desc.flags & ~(2 | 8 | 16 | 32); // IGNORECASE, MULTILINE, DOTALL, UNICODE
        if (unsupported) fail(path, `unsupported Python regex flags ${unsupported}`);
        if (desc.flags & 2) fail(path, 'IGNORECASE is not portable across Python and JavaScript Unicode rules');
        if (/\\[AZwWdDsS]|\(\?P[<=!]|\(\?\(|\(\?>/.test(desc.pattern)) fail(path, 'regex uses a non-portable construct or character class');
        let flags = 'uy'; if (desc.flags & 8) flags += 'm'; if (desc.flags & 16) flags += 's';
        let re; try { re = new RegExp(`(?:${desc.pattern})(?![\\s\\S])`, flags); } catch (error) { fail(path, `invalid portable regex: ${error.message}`); }
        return { ...desc, test: v => {
            if (typeof v !== 'string') return false;
            re.lastIndex = 0;
            return re.test(v);
        } };
    }
    case 'value': jsonValue(desc.value, `${path}.value`); return { ...desc };
    case 'generic': {
        const origin = annotation(desc.origin, `${path}.origin`, true);
        if (desc.origin?.kind !== 'type' || desc.origin.module !== 'builtins'
            || !['list', 'dict', 'tuple', 'set'].includes(desc.origin.name)) {
            fail(path, 'only list, dict, tuple and set generic origins are supported');
        }
        if (!Array.isArray(desc.arguments)) fail(path, 'generic arguments must be an array');
        const args = desc.arguments.map((v, i) => annotation(v, `${path}.arguments[${i}]`, true));
        return { ...desc, origin, arguments: args, test: v => origin.test(v) && genericItems(desc.origin, args, v) };
    }
    case 'arguments':
        fail(path, 'Callable argument-list descriptors are not supported by Python validation');
    case 'ellipsis': if (!nested) fail(path, 'ellipsis is only valid as a nested descriptor'); return { ...desc };
    default: fail(path, `unknown annotation kind '${desc.kind}'`);
    }
}
function genericItems(origin, args, value) {
    const key = `${origin.module}.${origin.name}`;
    if (key === 'builtins.tuple' && args.length && args[1]?.kind !== 'ellipsis') {
        return value.length === args.length && value.every((item, index) => args[index].test(item));
    }
    if (key === 'builtins.list' || key === 'builtins.set' || key === 'builtins.tuple') return [...value].every(v => !args[0]?.test || args[0].test(v));
    if (key === 'builtins.dict') return Object.entries(value).every(([k, v]) => (!args[0]?.test || args[0].test(k)) && (!args[1]?.test || args[1].test(v)));
    return false;
}

export function parseCardinality(spec, path) {
    if (spec === null) return null;
    if (typeof spec !== 'string') fail(path, 'must be string or null');
    if (spec === '') return new Map();
    const result = new Map();
    for (const raw of spec.split(',')) {
        const item = raw.trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*\[\]$/.test(item)) fail(path, `invalid cardinality item '${raw}'`);
        const match = item.match(/^([A-Za-z_][A-Za-z0-9_]*|\*)(?:\[(?:(\d+)|(?:(\d*):(\d*)))\])?$/);
        if (!match) fail(path, `invalid cardinality item '${raw}'`);
        const [, name, exact, lower, upper] = match;
        if (result.has(name)) fail(path, `duplicate tag '${name}'`);
        let min = 0, max = Infinity;
        if (item.includes('[')) {
            if (item.includes(':')) { min = lower ? Number(lower) : 0; max = upper ? Number(upper) : Infinity; }
            else { min = max = Number(exact); }
        }
        if (max < min) fail(path, `maximum ${max} is below minimum ${min}`);
        result.set(name, { min, max });
    }
    if (result.has('*') && result.size > 1) fail(path, "wildcard '*' cannot be combined with named tags");
    return result;
}
function parseParents(spec, path) {
    if (spec === null) return null;
    if (typeof spec !== 'string') fail(path, 'must be string or null');
    const result = new Set();
    for (const raw of spec.split(',')) {
        const name = raw.trim();
        if (!name) continue;
        if (!IDENTIFIER.test(name) || result.has(name)) fail(path, `invalid or duplicate parent '${raw}'`);
        result.add(name);
    }
    return result;
}

function parameters(value, path) {
    if (value === null) return null;
    exactKeys(value, ['parameters', 'accepts_var_keyword', 'accepts_var_positional'], [], path);
    const params = value.parameters ?? [];
    if (!Array.isArray(params)) fail(path, "parameters must be an array");
    value = {parameters: params, accepts_var_keyword: params.some(p => p.kind === 'var_keyword'),
        accepts_var_positional: params.some(p => p.kind === 'var_positional'), ...value};
    if (!Array.isArray(value.parameters) || typeof value.accepts_var_keyword !== 'boolean' || typeof value.accepts_var_positional !== 'boolean') fail(path, 'invalid signature descriptor');
    const seen = new Set();
    let foundVarKeyword = false;
    let foundVarPositional = false;
    const parsed = value.parameters.map((p, i) => {
        const pp = `${path}.parameters[${i}]`; exactKeys(p, ['name', 'kind', 'role', 'annotation', 'has_default', 'default'], ['name', 'kind', 'role', 'annotation', 'has_default'], pp);
        if (typeof p.name !== 'string' || !IDENTIFIER.test(p.name) || seen.has(p.name)) fail(pp, 'invalid or duplicate parameter name'); seen.add(p.name);
        if (!PARAM_KINDS.has(p.kind) || !PARAM_ROLES.has(p.role) || typeof p.has_default !== 'boolean') fail(pp, 'invalid kind, role, or has_default');
        if (p.has_default !== Object.hasOwn(p, 'default')) fail(pp, 'default presence must equal has_default'); if (p.has_default) jsonValue(p.default, `${pp}.default`);
        foundVarKeyword ||= p.kind === 'var_keyword';
        foundVarPositional ||= p.kind === 'var_positional';
        return { ...p, annotation: annotation(p.annotation, `${pp}.annotation`) };
    });
    if (foundVarKeyword !== value.accepts_var_keyword
        || foundVarPositional !== value.accepts_var_positional) {
        fail(path, 'variadic summary flags do not match parameters');
    }
    return { ...value, parameters: parsed };
}

function declaration(value, path, isElement) {
    const keys = ['doc', 'sub_tags', 'parent_tags', 'inherits_from', 'ns', 'attributes', ...(isElement ? ['node_label', 'collection_key'] : []), '_meta'];
    exactKeys(value, keys, [], path);
    value = { ...Object.fromEntries(keys.map(k => [k, null])), ...value };
    for (const key of ['doc', 'inherits_from', 'ns', ...(isElement ? ['node_label', 'collection_key'] : [])]) if (value[key] !== null && typeof value[key] !== 'string') fail(path, `${key} must be string or null`);
    if (value._meta !== null) { if (!plainObject(value._meta)) fail(path, '_meta must be object or null'); jsonValue(value._meta, `${path}._meta`); }
    parseCardinality(value.sub_tags, `${path}.sub_tags`);
    parseParents(value.parent_tags, `${path}.parent_tags`);
    return { ...value, attributes: parameters(value.attributes, `${path}.attributes`) };
}
function parents(value) { return value ? value.split(',').map(x => x.trim()).filter(Boolean) : []; }
function inherit(base, own) {
    const out = { ...own };
    for (const [key, value] of Object.entries(base)) {
        if (key === 'inherits_from' || key.startsWith('_')) continue;
        if (!out[key]) out[key] = value;
    }
    out._meta = { ...(base._meta || {}), ...(own._meta || {}) };
    return out;
}
function compileDeclaration(value) {
    const out = { ...value };
    out._subSpec = Object.hasOwn(out, 'sub_tags')
        ? parseCardinality(out.sub_tags, 'resolved.sub_tags')
        : null;
    out._parentSpec = Object.hasOwn(out, 'parent_tags')
        ? parseParents(out.parent_tags, 'resolved.parent_tags')
        : null;
    return out;
}
function resolveAbstract(name, abstracts, state, path) {
    if (state.get(name) === 1) fail(path, `inheritance cycle at '${name}'`); if (state.get(name) === 2) return abstracts[name];
    const raw = abstracts[name]; if (!raw) fail(path, `unknown abstract '${name}'`); state.set(name, 1);
    let out = { ...raw };
    for (const parent of parents(raw.inherits_from)) out = inherit(resolveAbstract(parent, abstracts, state, path), out);
    out = compileDeclaration(out);
    state.set(name, 2); abstracts[name] = out; return out;
}

/** Resolve composed JSON declarations for class and instance grammars. */
export function resolveGrammarDeclarations({ abstracts: rawAbstracts = {}, elements: rawElements = {} }) {
    const abstracts = { ...rawAbstracts };
    const state = new Map();
    for (const name of Object.keys(abstracts)) resolveAbstract(name, abstracts, state, `abstracts.${name}.inherits_from`);
    const elements = {};
    for (const [name, own] of Object.entries(rawElements)) {
        let out = { ...own };
        for (const parent of parents(own.inherits_from)) {
            const base = abstracts[parent];
            if (!base) fail(`elements.${name}.inherits_from`, `unknown abstract '${parent}'`);
            out = inherit(base, out);
        }
        elements[name] = compileDeclaration(out);
    }
    return { abstracts, elements };
}

export function parseGrammarDocument(doc) {
    exactKeys(doc, ['document_format', 'grammar', 'abstracts', 'elements'], ['document_format', 'grammar', 'abstracts', 'elements'], 'grammar document');
    exactKeys(doc.document_format, ['name', 'version'], ['name', 'version'], 'document_format');
    if (doc.document_format.name !== 'builder_grammar' || doc.document_format.version !== '1.1') fail('document_format', 'expected builder_grammar version 1.1');
    exactKeys(doc.grammar, ['name', 'version', 'title', 'description'], ['name', 'version', 'title', 'description'], 'grammar');
    if (typeof doc.grammar.name !== 'string' || !doc.grammar.name) fail('grammar.name', 'must be non-empty string');
    for (const key of ['version', 'title', 'description']) if (doc.grammar[key] !== null && typeof doc.grammar[key] !== 'string') fail(`grammar.${key}`, 'must be string or null');
    if (!plainObject(doc.abstracts) || !plainObject(doc.elements)) fail('grammar document', 'abstracts/elements must be objects');
    const rawAbstracts = {};
    for (const [name, value] of Object.entries(doc.abstracts)) {
        if (!name || name.startsWith('_')) {
            fail('abstracts', `invalid public name '${name}'`);
        }
        rawAbstracts[name] = declaration(value, `abstracts.${name}`, false);
    }
    const rawElements = {};
    for (const [name, value] of Object.entries(doc.elements)) {
        if (!name || name.startsWith('_')) {
            fail('elements', `invalid public name '${name}'`);
        }
        rawElements[name] = declaration(value, `elements.${name}`, true);
    }
    return {
        grammar: structuredClone(doc.grammar),
        abstracts: rawAbstracts,
        elements: rawElements,
    };
}

export function validateElementValues(tag, spec, value, attrs) {
    const signature = spec.attributes; if (!signature) return;
    const supplied = { ...attrs }; if (value !== null && value !== undefined) supplied.node_value = value;
    const known = new Set(signature.parameters.filter(p => p.role === 'attribute').map(p => p.name));
    const framework = new Set(['node_label', 'node_position', 'node_id', 'target_id', 'datapath', 'iterate', 'store', '_tag', '_meta', 'ns']);
    if (!signature.accepts_var_keyword) for (const name of Object.keys(attrs)) if (!known.has(name) && !framework.has(name)) fail(tag, `unknown attribute '${name}'`);
    const componentRoot = spec._meta?.component ? signature.parameters.find(p =>
        p.role !== 'framework' && ['positional_only', 'positional_or_keyword'].includes(p.kind))?.name : null;
    for (const p of signature.parameters) {
        if (p.name === componentRoot) continue; // supplied by the renderer
        if (p.role === 'framework' || p.kind.startsWith('var_')) continue;
        const present = Object.hasOwn(supplied, p.name);
        if (!present && !p.has_default) fail(tag, `missing required ${p.role} '${p.name}'`);
        if (present && p.annotation !== null && (!p.annotation.test || !p.annotation.test(supplied[p.name]))) fail(tag, `invalid value for ${p.role} '${p.name}'`);
    }
}
