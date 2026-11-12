'use strict';

/**
 * jm-jsruntime
 *
 * Evaluate JavaScript that is stored as data, encode/decode object literals
 * containing functions, and interpolate ${...} template text.
 *
 * NOTE: `new Function` is equivalent to `eval` and executes in the current
 * global scope. This module is NOT a sandbox. Only run trusted code.
 */

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const CACHE_LIMIT = 128;
const compileCache = new Map();

function normalizeOptions(option) {
    if (option == null) return { params: {}, promise: false, timeout: 0 };
    if (typeof option !== 'object' || Array.isArray(option)) {
        throw new TypeError('jm-jsruntime: option must be an object');
    }
    const promise = Boolean(option.promise || option.async);
    const timeout = option.timeout == null ? 0 : option.timeout;
    if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout < 0) {
        throw new RangeError('jm-jsruntime: option.timeout must be a non-negative finite number');
    }
    if (timeout > 0 && !promise) {
        throw new TypeError('jm-jsruntime: option.timeout requires option.async (or option.promise) to be true');
    }
    if (option.params != null && (typeof option.params !== 'object' || Array.isArray(option.params))) {
        throw new TypeError('jm-jsruntime: option.params must be a plain object');
    }
    return { params: option.params || {}, promise, timeout };
}

function compile(code, paramNames, promise) {
    const key = (promise ? 'a\u0000' : 's\u0000') + paramNames.join(',') + '\u0000' + code;
    const cached = compileCache.get(key);
    if (cached) {
        // Refresh insertion order so eviction is real LRU, not FIFO.
        compileCache.delete(key);
        compileCache.set(key, cached);
        return cached;
    }

    const Ctor = promise ? AsyncFunction : Function;
    let fn;
    try {
        // The trailing newline keeps a trailing // comment from swallowing the body.
        fn = new Ctor(...paramNames, code + '\n');
    } catch (err) {
        const error = new SyntaxError('jm-jsruntime: failed to compile script: ' + err.message);
        error.cause = err;
        throw error;
    }
    if (compileCache.size >= CACHE_LIMIT) {
        compileCache.delete(compileCache.keys().next().value);
    }
    compileCache.set(key, fn);
    return fn;
}

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('jm-jsruntime: script timed out after ' + ms + 'ms'));
        }, ms);
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
}

/**
 * Compile and execute a script body with injected parameters.
 *
 * @param {string} code function body (use `return ...` to produce a value)
 * @param {object} [option] { params, promise|async, timeout }
 * @param {*} [context] `this` inside the script
 * @returns {*} the script's return value, or a Promise when async is enabled
 */
function runScript(code, option, context) {
    if (typeof code !== 'string') {
        throw new TypeError('jm-jsruntime: code must be a string');
    }
    const opts = normalizeOptions(option);
    // Object.keys (not for...in): inherited properties must never become
    // parameter names, and keys are concatenated into generated source.
    const paramNames = Object.keys(opts.params);
    for (const name of paramNames) {
        if (!IDENTIFIER.test(name)) {
            throw new TypeError('jm-jsruntime: invalid parameter name ' + JSON.stringify(name) +
                ' (expected a JavaScript identifier)');
        }
    }
    const paramValues = paramNames.map((name) => opts.params[name]);
    const fn = compile(code, paramNames, opts.promise);
    const result = fn.call(context, ...paramValues);
    return opts.timeout > 0 ? withTimeout(result, opts.timeout) : result;
}

/**
 * Evaluate a JavaScript object-literal expression (functions allowed).
 * The text is used verbatim — unlike decodeContent, ${...} is NOT interpolated.
 *
 * @param {string} js object-literal source
 * @param {object} [option] { params } — optional variables for the expression
 * @returns {*} evaluated value
 */
function decodeJSON(js, option) {
    if (typeof js !== 'string') {
        throw new TypeError('jm-jsruntime: decodeJSON expects a string');
    }
    if (option != null && (typeof option !== 'object' || Array.isArray(option))) {
        throw new TypeError('jm-jsruntime: decodeJSON option must be an object');
    }
    // Parentheses make a leading `{` an expression, not a block. The newlines
    // protect a trailing line comment.
    return runScript('return (\n' + js + '\n);', option && { params: option.params, timeout: 0 });
}

/** Find the closing `}` of a `${...}` expression, respecting nesting and strings. */
function findExpressionEnd(text, start) {
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (quote) {
            if (escaped) { escaped = false; continue; }
            if (c === '\\') { escaped = true; continue; }
            if (quote === '`' && c === '$' && text[i + 1] === '{') {
                const nestedEnd = findExpressionEnd(text, i + 2);
                if (nestedEnd === -1) return -1;
                i = nestedEnd;
                continue;
            }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '{' || c === '(' || c === '[') { depth++; continue; }
        if (c === '}' || c === ')' || c === ']') {
            if (c === '}' && depth === 0) return i;
            depth--;
        }
    }
    return -1;
}

/**
 * Build a safe template literal body. Literal text is escaped (backslashes and
 * backticks stay literal); ${...} expressions are passed through for evaluation.
 * Use \${...} to emit a literal `${...}`.
 */
function escapeTemplate(content) {
    let out = '';
    for (let i = 0; i < content.length;) {
        const c = content[i];
        if (c === '\\' && content[i + 1] === '$' && content[i + 2] === '{') {
            out += '\\${';   // keep the escape so the engine prints a literal ${
            i += 3;
            continue;
        }
        if (c === '$' && content[i + 1] === '{') {
            const end = findExpressionEnd(content, i + 2);
            if (end === -1) throw new SyntaxError('jm-jsruntime: unclosed ${...} interpolation');
            out += content.slice(i, end + 1);
            i = end + 1;
            continue;
        }
        if (c === '`') { out += '\\`'; i++; continue; }
        if (c === '\\') { out += '\\\\'; i++; continue; }
        out += c;
        i++;
    }
    return out;
}

/**
 * Interpolate ${...} expressions in a piece of template text.
 *
 * @param {string} content text containing ${expression} placeholders
 * @param {object} [option] { params } — variables available to the expressions
 * @returns {string} interpolated text
 */
function decodeContent(content, option) {
    if (typeof content !== 'string') {
        throw new TypeError('jm-jsruntime: decodeContent expects a string');
    }
    if (option != null && (typeof option !== 'object' || Array.isArray(option))) {
        throw new TypeError('jm-jsruntime: decodeContent option must be an object');
    }
    return runScript('return `' + escapeTemplate(content) + '`;',
        option && { params: option.params, timeout: 0 });
}

function normalizeEncodeOptions(options, legacyReplacer, legacySpace, argc) {
    let space = 2;
    let replacer;
    if (argc >= 3) {
        // Legacy positional form: encodeJSON(obj, deep, replacer, space)
        space = legacySpace == null ? 2 : legacySpace;
        if (typeof legacyReplacer === 'function') replacer = legacyReplacer;
    } else if (options && typeof options === 'object') {
        if (options.space != null) space = options.space;
        if (typeof options.replacer === 'function') replacer = options.replacer;
    } else if (typeof options === 'function') {
        replacer = options;
    } else if (options != null) {
        space = options;
    }
    if (typeof space === 'number' && (!Number.isFinite(space) || space < 0)) space = 0;
    if (typeof space === 'number') space = Math.min(Math.floor(space), 10);
    if (typeof space === 'string') space = space.slice(0, 10);
    return { space, replacer, holder: {} };
}

function indentOf(space, level) {
    if (!space) return '';
    const unit = typeof space === 'number' ? ' '.repeat(space) : String(space);
    return unit.repeat(level);
}

function joinItems(items, level, space) {
    if (!items.length) return '';
    const pad = indentOf(space, level + 1);
    if (!pad) return items.join(',');
    return '\n' + items.map((item) => pad + item).join(',\n') + '\n' + indentOf(space, level);
}

function quoteKey(key) {
    return JSON.stringify(key);
}

/** Read a property without ever invoking an accessor getter. */
function safeGet(obj, key) {
    let current = obj;
    while (current) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (descriptor) return 'value' in descriptor ? descriptor.value : undefined;
        current = Object.getPrototypeOf(current);
    }
    return undefined;
}

/**
 * Serialize a value into a JavaScript literal. Functions are emitted as source
 * (without quotes), so the result is JS source rather than strict JSON.
 */
function stringify(value, key, level, seen, ctx) {
    if (ctx.replacer) value = ctx.replacer.call(ctx.holder, key, value);
    if (value === null) return 'null';

    const type = typeof value;
    if (type === 'function') return value.toString();
    if (type === 'string') return JSON.stringify(value);
    if (type === 'number') {
        if (Number.isFinite(value)) return String(value);
        if (Number.isNaN(value)) return 'NaN';
        return value > 0 ? 'Infinity' : '-Infinity';
    }
    if (type === 'boolean') return String(value);
    if (type === 'bigint') return String(value) + 'n';
    if (type === 'undefined' || type === 'symbol') return 'undefined';

    if (seen.has(value)) {
        throw new TypeError('jm-jsruntime: circular structure cannot be encoded');
    }
    seen.add(value);
    try {
        // Special types must be handled before toJSON (Date.prototype.toJSON
        // would otherwise turn a Date into a plain string).
        if (value instanceof Date) {
            return 'new Date(' + JSON.stringify(
                Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()
            ) + ')';
        }
        if (value instanceof RegExp) return String(value);
        if (value instanceof Map) {
            return 'new Map(' + stringify(Array.from(value.entries()), key, level, seen, ctx) + ')';
        }
        if (value instanceof Set) {
            return 'new Set(' + stringify(Array.from(value.values()), key, level, seen, ctx) + ')';
        }
        // Read along the prototype chain via descriptors so an accessor
        // named toJSON can never fire a user getter.
        const toJSON = safeGet(value, 'toJSON');
        if (typeof toJSON === 'function') {
            return stringify(toJSON.call(value, key), key, level, seen, ctx);
        }

        if (Array.isArray(value)) {
            const items = [];
            for (let i = 0; i < value.length; i++) {
                items.push(stringify(value[i], String(i), level + 1, seen, ctx));
            }
            let out = '[' + joinItems(items, level, ctx.space) + ']';
            // Preserve extra own properties instead of silently dropping them.
            const extra = Object.getOwnPropertyNames(value)
                .filter((name) => name !== 'length' && !/^(0|[1-9]\d*)$/.test(name));
            if (extra.length) {
                const props = extra.map((name) => {
                    const descriptor = Object.getOwnPropertyDescriptor(value, name);
                    return quoteKey(name) + (ctx.space ? ': ' : ':') + stringify(
                        descriptor && 'value' in descriptor ? descriptor.value : undefined,
                        name, level + 1, seen, ctx
                    );
                });
                out = 'Object.assign(' + out + ', {' + joinItems(props, level, ctx.space) + '})';
            }
            return out;
        }

        const props = [];
        for (const name of Object.getOwnPropertyNames(value)) {
            const descriptor = Object.getOwnPropertyDescriptor(value, name);
            // Read the stored value directly: never trigger a user getter.
            // Accessor-only properties are skipped (see README).
            if (!descriptor || !('value' in descriptor)) continue;
            props.push(quoteKey(name) + (ctx.space ? ': ' : ':') +
                stringify(descriptor.value, name, level + 1, seen, ctx));
        }
        return '{' + joinItems(props, level, ctx.space) + '}';
    } finally {
        seen.delete(value);
    }
}

/**
 * Serialize a value (including function properties) into a JS literal string.
 *
 * @param {*} obj value to encode
 * @param {object|number|string|function} [options] { space, replacer },
 *        a shorthand indent value, or a replacer function
 * @returns {string} JavaScript source that decodeJSON can read back
 */
function encodeJSON(obj, options, legacyReplacer, legacySpace) {
    const ctx = normalizeEncodeOptions(options, legacyReplacer, legacySpace, arguments.length);
    return stringify(obj, '', 0, new WeakSet(), ctx);
}

/** Clear the compiled-script cache (useful in tests / long-running hosts). */
function clearCache() {
    compileCache.clear();
}

module.exports = {
    encodeJSON,
    decodeJSON,
    decodeContent,
    runScript,
    clearCache
};
