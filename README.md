# jm-jsruntime

[简体中文](./README.zh-CN.md) | English

A tiny, zero-dependency runtime for evaluating JavaScript that is stored as **data** instead of as source files:

- run a JavaScript snippet with injected parameters (`runScript`);
- parse an object literal that contains real functions (`decodeJSON`);
- serialize an object with function properties back into that literal (`encodeJSON`);
- interpolate `${...}` placeholders in configurable text (`decodeContent`).

Typical uses: configuration objects with behaviour hooks, template copy stored in a database, low-code / rule engines, and quick scripted experiments.

[Live demo](https://fefeding.github.io/jm-jsruntime/example/index.html)

> **Security:** this library compiles strings with `new Function`, which is equivalent to `eval`. It is **not a sandbox**. Execute trusted code only. See [Security](#security).

## Features

- Zero dependencies, no build step, one runtime file plus handwritten TypeScript declarations.
- Works in Node.js (CommonJS) and in browsers (with a small `module` shim).
- Parameter injection, synchronous and `async` / `await` scripts, optional async timeout.
- Round-tripping of functions, `Date`, `RegExp`, `Map`, `Set`, `BigInt`, `NaN`, `Infinity`, `undefined` and extra array properties.
- Correct template-literal escaping: backslashes and backticks stay literal, `\${...}` emits a literal `${...}`.
- Small LRU cache for compiled scripts; assertion-based test suite.

## Install

```shell
npm install jm-jsruntime
```

```js
const {
  encodeJSON,
  decodeJSON,
  decodeContent,
  runScript,
  clearCache
} = require('jm-jsruntime');
```

## TypeScript

`index.d.ts` is shipped and declared through both `types` and `exports`. No `@types` package is needed.

```ts
import { runScript, decodeJSON, encodeJSON, decodeContent } from 'jm-jsruntime';

const sum = runScript<number>('return a + b', { params: { a: 1, b: 2 } });

// The async overload returns Promise<T>
const text = await runScript<string>('return await fetchText()', {
  async: true,
  params: { fetchText },
  timeout: 1000
});

type Config = { retry: number; onFail: () => void };
const config = decodeJSON<Config>('{ retry: 3, onFail: () => {} }');

const source = encodeJSON(config, { space: 2 });
const greeting = decodeContent('Hi ${name}', { params: { name: 'Ada' } });
```

Key types: `ScriptOptions` (`params`, `async`, legacy `promise`, `timeout`), `SyncScriptOptions`, `DecodeOptions`, `EncodeOptions`, `EncodeReplacer`. `runScript` is overloaded so `{ async: true }` / `{ promise: true }` yields `Promise<T>`.

## Quick start

### Parse an object literal containing functions

```js
const obj = decodeJSON(`{
  fun: () => { console.log('hello'); },
  prop: '1'
}`);

console.log(obj);     // { fun: [Function: fun], prop: '1' }
obj.fun();            // hello
```

### Serialize an object containing functions

```js
const str = encodeJSON({
  pro1: '1',
  obj: {
    p2: 1,
    fun: (a) => a + 1,
    arr: [1, 2, 3]
  }
});

console.log(str);
// {
//   "pro1": "1",
//   "obj": {
//     "p2": 1,
//     "fun": (a) => a + 1,
//     "arr": [
//       1,
//       2,
//       3
//     ]
//   }
// }

console.log(decodeJSON(str).obj.fun(2)); // 3
```

Functions are emitted as their `toString()` source with line breaks intact, so double quotes and `//` comments survive a round trip. The result is **JavaScript source, not strict JSON** — it cannot be read by `JSON.parse`.

```js
encodeJSON({ fn: function () { return "hi"; } }, { space: 0 });
// '{"fn":function () { return "hi"; }}'
```

### Interpolate template text

```js
decodeContent('decode content ${a}, ${b}', { params: { a: 'p1', b: 3 } });
// 'decode content p1, 3'

decodeContent('total: ${a + b}', { params: { a: 1, b: 2 } }); // 'total: 3'
decodeContent('C:\\Users\\name');                             // 'C:\Users\name'
decodeContent(String.raw`literal: \${notAVar}`);             // 'literal: ${notAVar}'
```

### Run a script

```js
const ret = runScript(`
  console.log('add');
  return params1 + params2;
`, { params: { params1: 1, params2: 2 } });
// prints "add", ret === 3
```

### Run an async script

```js
const value = await runScript('return await fn();', {
  async: true,                 // `promise: true` also works (legacy alias)
  timeout: 1000,               // rejects instead of waiting forever
  params: { fn: async () => 'done' }
});
// 'done'
```

## API

| API | Description | Returns |
| --- | --- | --- |
| `runScript(code, options?, context?)` | Compile and run a JavaScript body | The script's `return` value; a `Promise` when `async`/`promise` is set |
| `decodeJSON(js, options?)` | Evaluate an object-literal expression (functions allowed) | The resulting value |
| `encodeJSON(value, options?)` | Serialize a value with function properties | A JavaScript-literal string (2-space indented by default) |
| `decodeContent(content, options?)` | Evaluate a template literal with `${...}` expressions | The interpolated string |
| `clearCache()` | Clear the compiled-script cache | `void` |

### `runScript(code, options?, context?)`

| Argument | Type | Details |
| --- | --- | --- |
| `code` | `string` | Function body. Wrap it in `return ...` yourself; no `return` means `undefined`. |
| `options.params` | `Record<string, unknown>` | Each **own** key becomes a parameter name and its value the argument. Keys are validated as JavaScript identifiers; invalid ones throw `TypeError`. |
| `options.async` | `boolean` | Use the `AsyncFunction` constructor so `await` works at the top level. |
| `options.promise` | `boolean` | Legacy alias for `async`. |
| `options.timeout` | `number` | Reject the returned Promise after N ms. Only valid with `async`/`promise`; it stops waiting but does **not** cancel the running script. |
| `context` | `any` | `this` inside the script, passed to `fn.call(context, ...)`. Defaults to `undefined` (so non-strict scripts see `globalThis`). |

Syntax errors are rethrown as `SyntaxError` with the compilation message attached (`error.cause`); runtime exceptions propagate unchanged. Compiled functions are cached per `(code, parameter names, sync/async)` with a true LRU limit of 128 entries (a cache hit refreshes the entry).

```js
runScript('return this.prefix + name;', { params: { name: 'Ada' } }, { prefix: 'Hi ' });
// 'Hi Ada'
```

### `decodeJSON(js, options?)`

Equivalent to `runScript('return (\n' + js + '\n);', { params: options.params })`. The text is used **verbatim** — no escaping is applied, so template strings inside the literal work. The parentheses make a leading `{` an expression; the newlines keep a trailing `//` comment harmless. `${...}` is **not** interpolated here; use `decodeContent`.

### `decodeContent(content, options?)`

Builds a template literal from `content`: literal text is escaped (backslashes and backticks stay literal), `${...}` expressions are passed through for engine evaluation, and `\${` produces a literal `${`. Nested braces, strings and nested template expressions inside `${...}` are supported. An unclosed `${` throws `SyntaxError`.

`options` accepts `params` only; interpolation is always synchronous.

### `encodeJSON(value, options?)`

| `options` | Meaning |
| --- | --- |
| `{ space }` | Indentation, like `JSON.stringify`'s `space` (number of spaces or a literal string). Default `2`; `0` produces compact output. |
| `{ replacer }` | Optional `(key, value) => unknown` transform, applied to every value before encoding. |
| `number` / `string` | Shorthand for `space`. |
| `function` | Shorthand for `replacer`. |

Supported values: functions (source, unquoted), strings, numbers (including `NaN`, `Infinity`), booleans, `BigInt` (`10n`), `undefined`, `Date` (`new Date("…")`), `RegExp`, `Map`/`Set`, arrays (extra own properties become `Object.assign([...], {...})`) and plain objects. Circular references throw a clear `TypeError`. Stored property values are read from descriptors, so **getters are never invoked**; accessor-only properties and Symbol keys are skipped.

### `clearCache()`

Clears the compiled-script cache. Useful in tests or long-running hosts that generate many distinct scripts.

## Browser usage

```html
<script>var module = { exports: {} };</script>
<script src="node_modules/jm-jsruntime/index.js"></script>
<script>
  var obj = module.exports.decodeJSON("{ fun: () => alert('hi'), prop: '1' }");
  obj.fun();
</script>
```

`example/index.html` does exactly this. A strict Content Security Policy without `unsafe-eval` blocks `new Function`, so the library will not run under such a policy.

## Security

`new Function` compiles in the **current global scope** — the script can reach `global`, `process`, `window`, `document`, `fetch`, and everything else reachable from globals. This library provides:

- no sandbox, isolation, permission whitelist or AST validation;
- no timeout for **synchronous** scripts and no cancellation (a `while (true)` blocks the host);
- no sanitisation of `runScript`/`decodeJSON`/`decodeContent` source text; `${...}` in `decodeContent` accepts arbitrary expressions.

Parameter *names* are validated as identifiers before compilation, which closes the injection vector through `options.params` keys. That does not make the script itself safe.

Therefore:

- **Only execute code and configuration you fully trust.** Never pass user-supplied strings or untrusted remote configuration to any of these helpers.
- Do not use this library to isolate third-party plugins or tenant-provided rules. For untrusted code use a real isolation boundary (Node `vm` in a separate process, `isolated-vm`, a Worker/iframe with message passing and a timeout, SES, or a statically validated AST interpreter).
- `option.timeout` only bounds waiting on an async script; it cannot stop a synchronous infinite loop.

## Limitations and known issues

- **Closures do not survive serialization.** A serialized function loses its lexical scope. Classes, bound functions and native functions cannot be reconstructed reliably.
- **Skipped values:** accessor-only properties (getters/setters), Symbol-keyed properties and the prototype chain are not encoded. Sparse arrays become explicit `undefined` entries.
- **Not strict JSON:** the output of `encodeJSON` is JS source; use `decodeJSON`, not `JSON.parse`.
- **No debug mapping:** stack traces refer to the generated wrapper; there is no source map.
- **Runtime format:** CommonJS only (an `index.d.ts` is provided, but there is no ESM/UMD bundle). TypeScript consumers import the named exports.
- **Complex `${...}` expressions:** the interpolation scanner handles nested braces, strings and nested templates; pathological expressions (e.g. regex literals containing braces) may need to be passed via `params` instead.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.js` | Entire implementation and CommonJS export |
| `index.d.ts` | Handwritten TypeScript declarations |
| `test.js` | Assertion-based test suite (`npm test`) |
| `example/index.html` | Browser demo (GitHub Pages) |
| `package.json` | Metadata; `types`/`exports`/`files`; no dependencies |

## Development

```shell
npm test   # node test.js — 29 assertion checks, no external test framework
```

## License

[MIT](./LICENSE) © jiamao
