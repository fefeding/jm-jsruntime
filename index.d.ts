/**
 * Type definitions for jm-jsruntime.
 *
 * WARNING: `runScript`, `decodeJSON` and `decodeContent` compile strings with
 * `new Function` in the current global scope. They are not sandboxed — only
 * pass trusted code and trusted configuration.
 */

/** Variables injected into a compiled script. Keys must be valid identifiers. */
export type ScriptParams = Record<string, unknown>;

export interface ScriptOptions {
    /** Keys become parameter names; values become arguments. */
    params?: ScriptParams;
    /** Compile with AsyncFunction so the script body can use top-level `await`. */
    async?: boolean;
    /** Legacy alias for `async`. */
    promise?: boolean;
    /**
     * Reject the returned Promise after this many milliseconds.
     * Only supported together with `async: true` / `promise: true`; it does not
     * cancel the script, it only stops waiting for it.
     */
    timeout?: number;
}

export interface SyncScriptOptions extends ScriptOptions {
    async?: false;
    promise?: false;
    timeout?: never;
}

/** Options for decode helpers (scripts are always compiled synchronously). */
export interface DecodeOptions {
    params?: ScriptParams;
}

export type EncodeReplacer = (this: unknown, key: string, value: unknown) => unknown;

export interface EncodeOptions {
    /**
     * Indentation, same semantics as `JSON.stringify`'s `space`
     * (number of spaces, or a literal indent string). Default: `2`.
     * Use `0` for compact output.
     */
    space?: number | string;
    /** Optional value transform, called like a JSON.stringify replacer. */
    replacer?: EncodeReplacer;
}

/**
 * Compile and run a script body.
 *
 * @example
 * const sum = runScript<number>('return a + b', { params: { a: 1, b: 2 } });
 * const value = await runScript<string>('return await fetchText()', {
 *   async: true, params: { fetchText }, timeout: 1000
 * });
 */
export function runScript<T = unknown>(
    code: string,
    options: ScriptOptions & { async: true },
    context?: unknown
): Promise<T>;
export function runScript<T = unknown>(
    code: string,
    options: ScriptOptions & { promise: true },
    context?: unknown
): Promise<T>;
export function runScript<T = unknown>(
    code: string,
    options?: SyncScriptOptions | ScriptOptions,
    context?: unknown
): T;

/** Evaluate a JavaScript object-literal expression, functions included. */
export function decodeJSON<T = Record<string, any>>(
    js: string,
    options?: DecodeOptions
): T;

/** Interpolate `${...}` expressions in template text. */
export function decodeContent(
    content: string,
    options?: DecodeOptions
): string;

/**
 * Serialize a value into a JavaScript literal string. Function properties are
 * written as their source, so the result is JS source (not strict JSON) and can
 * be read back with `decodeJSON`.
 *
 * Supports functions, Date, RegExp, Map, Set, BigInt, NaN/Infinity, undefined
 * and extra own properties on arrays. Circular references throw a TypeError.
 */
export function encodeJSON(
    value: unknown,
    options?: EncodeOptions | number | string | EncodeReplacer
): string;

/** Clear the internal compiled-script cache. */
export function clearCache(): void;
