// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** Split an authored attribute pointer. Names exclude colon; only the first one separates. */
export function pointerTransform(value) {
    if (typeof value !== 'string' || !['^', '='].includes(value[0]) || value.startsWith('==')) return null;
    const index = value.indexOf(':');
    if (index < 0) return null;
    const expression = value[index + 1] === '=';
    return {pointer: value.slice(0, index), expression, body: value.slice(index + (expression ? 2 : 1))};
}

const SLOT = /^\{(\??[A-Za-z_][A-Za-z0-9_]*|\?)?\}/;

/** Templates are text. Braces delimit slots; no code or inferred expression mode. */
export function pointerTemplate(body, read) {
    let result = '', blocked = false;
    for (let i = 0; i < body.length;) {
        if (body[i] !== '{' && body[i] !== '}') { result += body[i++]; continue; }
        const match = body.slice(i).match(SLOT);
        if (!match) throw new SyntaxError('Invalid pointer template placeholder');
        const slot = match[1] ?? '';
        const optional = slot.startsWith('?');
        const value = read(optional ? slot.slice(1) : slot);
        if (value == null || (value === '' && !optional)) blocked = true;
        else result += String(value);
        i += match[0].length;
    }
    return blocked ? null : result;
}

/**
 * Replace slots only in expression code, never in quoted strings, comments or regex literals.
 * This scans lexical boundaries; InlineCompiler remains the sole JavaScript evaluator.
 * Empty objects and one-name shorthand objects coincide with slots: use explicit object members.
 */
export function pointerExpression(body) {
    const slots = [], identifiers = new Set();
    let text = '', operand = true;
    for (let i = 0; i < body.length;) {
        const start = i, c = body[i];
        if (c === '"' || c === "'" || c === '`') {
            i++;
            while (i < body.length) {
                if (body[i] === '\\') { i += 2; continue; }
                if (body[i++] === c) break;
            }
            text += body.slice(start, i); operand = false; continue;
        }
        if (body.startsWith('//', i)) {
            i = body.indexOf('\n', i); if (i < 0) i = body.length;
            text += body.slice(start, i); continue;
        }
        if (body.startsWith('/*', i)) {
            const end = body.indexOf('*/', i + 2);
            i = end < 0 ? body.length : end + 2;
            text += body.slice(start, i); continue;
        }
        if (c === '/' && operand) {
            let bracket = false; i++;
            while (i < body.length) {
                const current = body[i++];
                if (current === '\\') { i++; continue; }
                if (current === '[') bracket = true;
                else if (current === ']') bracket = false;
                else if (current === '/' && !bracket) break;
            }
            while (/[a-z]/i.test(body[i] ?? '') && i < body.length) i++;
            text += body.slice(start, i); operand = false; continue;
        }
        const slot = c === '{' ? body.slice(i).match(SLOT) : null;
        if (slot) {
            const name = slot[1] ?? '';
            if (name.startsWith('?')) throw new SyntaxError('Optional slots are supported in pointer templates only');
            text += `_pointerValues[${slots.length}]`;
            slots.push(name); i += slot[0].length; operand = false; continue;
        }
        const word = body.slice(i).match(/^[A-Za-z_$][\w$]*/);
        if (word) {
            identifiers.add(word[0]); text += word[0]; i += word[0].length;
            operand = ['return', 'typeof', 'void', 'delete', 'new', 'in', 'instanceof', 'yield', 'await'].includes(word[0]);
            continue;
        }
        text += c; i++;
        if (!/\s/.test(c)) operand = /[([{,:;=!?&|+*%~<>\/-]/.test(c);
    }
    return {text, slots, identifiers};
}

/** Resolve explicit transforms from a single snapshot of typed attribute inputs.
 * evaluate is supplied by the consuming runtime; Builders never compiles code. */
export function resolvePointerItems(items, current, evaluate = () => null) {
    const values = new Map(), active = [];
    const resolve = name => {
        if (values.has(name)) return values.get(name);
        if (!items.has(name)) throw new Error(`Referenced Source attribute '${name}' does not exist`);
        if (active.includes(name)) throw new Error(`Cyclic attribute dependency: ${[...active, name].join(' -> ')}`);
        active.push(name);
        try {
            const raw = items.get(name);
            const transform = typeof name === 'string' ? pointerTransform(raw) : null;
            let result = current.get(name);
            if (transform) {
                const read = key => key ? resolve(key) : current.get(name);
                if (transform.expression) {
                    const expression = pointerExpression(transform.body);
                    result = evaluate(name, raw, expression, expression.slots.map(read));
                } else {
                    result = pointerTemplate(transform.body, read);
                    if (current.get(name) == null) result = null;
                }
            }
            values.set(name, result);
            return result;
        } finally { active.pop(); }
    };
    return new Map([...items.keys()].map(name => [name, resolve(name)]));
}

/** Transitive Source attribute dependencies. Recompute on rebind; owns no subscriptions. */
export function pointerDependencies(node, raw) {
    const items = new Map([...Object.entries(node.getAttr()), ...node.fixedAttrItems()]);
    const seen = new Set(), active = [];
    const visit = value => {
        const transform = pointerTransform(value);
        if (!transform) return;
        const names = [];
        if (transform.expression) names.push(...pointerExpression(transform.body).slots);
        else pointerTemplate(transform.body, key => { names.push(key); return ''; });
        for (const name of names.filter(Boolean)) {
            if (!items.has(name)) throw new Error(`Referenced Source attribute '${name}' does not exist`);
            if (active.includes(name)) throw new Error(`Cyclic attribute dependency: ${[...active, name].join(' -> ')}`);
            if (seen.has(name)) continue;
            active.push(name); visit(items.get(name)); active.pop(); seen.add(name);
        }
    };
    visit(raw);
    return seen;
}
