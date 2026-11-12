'use strict';

const assert = require('node:assert/strict');
const {
    encodeJSON,
    decodeJSON,
    decodeContent,
    runScript,
    clearCache
} = require('./index');

let passed = 0;
let failed = 0;
function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { passed++; console.log('  ok  ' + name); })
        .catch((err) => {
            failed++;
            console.error('  FAIL  ' + name);
            console.error(err);
            process.exitCode = 1;
        });
}

(async function run() {
    // ---- runScript ------------------------------------------------------
    await test('runScript returns the script value', () => {
        assert.equal(runScript('return 1 + 1'), 2);
        assert.equal(runScript('return a + b', { params: { a: 1, b: 2 } }), 3);
    });

    await test('runScript binds `context` as this', () => {
        assert.equal(runScript('return this.prefix + name', {
            params: { name: 'Ada' }
        }, { prefix: 'Hi ' }), 'Hi Ada');
    });

    await test('runScript supports async scripts and aliases', async () => {
        const result = await runScript('return await fn()', {
            async: true,
            params: { fn: async () => 'done' }
        });
        assert.equal(result, 'done');
        assert.equal(await runScript('return 42', { promise: true }), 42);
    });

    await test('runScript timeout rejects a slow async script', async () => {
        await assert.rejects(
            runScript('return await fn()', {
                async: true,
                timeout: 10,
                params: { fn: () => new Promise((r) => setTimeout(() => r('late'), 100)) }
            }),
            /timed out/
        );
    });

    await test('runScript rejects invalid parameter names', () => {
        assert.throws(() => runScript('return 1', { params: { 'a-b': 1 } }), /invalid parameter name/);
        assert.throws(() => runScript('return 1', { params: { 'x) { } //': 1 } }), /invalid parameter name/);
    });

    await test('runScript rejects bad options instead of silently ignoring them', () => {
        assert.throws(() => runScript('return 1', 42), /option must be an object/);
        assert.throws(() => runScript('return 1', { params: [] }), /params must be a plain object/);
        assert.throws(() => runScript('return 1', { timeout: 10 }), /requires option.async/);
        assert.throws(() => runScript('return 1', { timeout: -1, async: true }), /non-negative/);
    });

    await test('inherited params are not injected as parameter names', () => {
        const params = Object.create({ inherited: 'nope' });
        params.own = 7;
        assert.equal(runScript('return typeof inherited + ":" + own', { params }), 'undefined:7');
    });

    await test('trailing line comments do not swallow the generated body', () => {
        assert.equal(runScript('return 5; // trailing'), 5);
    });

    await test('compile cache is reused and can be cleared', () => {
        assert.equal(runScript('return 9'), 9);
        assert.equal(runScript('return 9'), 9);
        clearCache();
        assert.equal(runScript('return 9'), 9);
    });

    // ---- decodeJSON -----------------------------------------------------
    await test('decodeJSON builds real functions', () => {
        const obj = decodeJSON(`{ fun: () => 3, prop: '1' }`);
        assert.equal(typeof obj.fun, 'function');
        assert.equal(obj.fun(), 3);
        assert.equal(obj.prop, '1');
    });

    await test('decodeJSON keeps backticks and template strings verbatim', () => {
        assert.equal(decodeJSON('{ text: `hi ${1 + 1}` }').text, 'hi 2');
    });

    await test('decodeJSON accepts params and trailing comments', () => {
        assert.equal(decodeJSON('{ n } // end', { params: { n: 4 } }).n, 4);
    });

    // ---- encodeJSON -----------------------------------------------------
    await test('encodeJSON round-trips functions containing double quotes', () => {
        const source = {
            fn: function () { return "hi"; },
            arrow: (v) => `value:${v}`,
            nested: { add: function (a, b) { return a + b; } }
        };
        const text = encodeJSON(source);
        assert.match(text, /return "hi"/);
        const back = decodeJSON(text);
        assert.equal(back.fn(), 'hi');
        assert.equal(back.arrow(2), 'value:2');
        assert.equal(back.nested.add(2, 3), 5);
    });

    await test('encodeJSON keeps line comments inside functions readable', () => {
        const text = encodeJSON({
            fn: function () {
                // a comment that used to swallow the rest of the line
                return 7;
            }
        });
        assert.equal(decodeJSON(text).fn(), 7);
    });

    await test('encodeJSON round-trips special values', () => {
        const source = {
            when: new Date('2024-01-02T03:04:05.000Z'),
            re: /ab+c/gi,
            map: new Map([['a', 1]]),
            set: new Set([1, 2]),
            big: 10n,
            nan: NaN,
            inf: Infinity,
            nothing: undefined
        };
        const back = decodeJSON(encodeJSON(source));
        assert.equal(back.when.toISOString(), source.when.toISOString());
        assert.equal(String(back.re), '/ab+c/gi');
        assert.equal(back.map.get('a'), 1);
        assert.ok(back.set.has(2));
        assert.equal(back.big, 10n);
        assert.ok(Number.isNaN(back.nan));
        assert.equal(back.inf, Infinity);
        assert.equal(back.nothing, undefined);
    });

    await test('encodeJSON preserves extra own properties on arrays', () => {
        const arr = [1, 2];
        arr.label = 'rows';
        const back = decodeJSON(encodeJSON({ arr }));
        assert.deepEqual(Array.from(back.arr), [1, 2]);
        assert.equal(back.arr.label, 'rows');
    });

    await test('encodeJSON detects circular references with a clear error', () => {
        const obj = {};
        obj.self = obj;
        assert.throws(() => encodeJSON(obj), /circular structure/);
    });

    await test('encodeJSON never triggers getters', () => {
        let calls = 0;
        const obj = {};
        Object.defineProperty(obj, 'lazy', {
            enumerable: true,
            get() { calls++; return 1; }
        });
        encodeJSON(obj);
        assert.equal(calls, 0);
    });

    await test('encodeJSON honours space (0 = compact) and replacer', () => {
        assert.equal(encodeJSON({ a: 1, f: () => 1 }, { space: 0 }), '{"a":1,"f":() => 1}');
        assert.doesNotMatch(encodeJSON({ a: 1 }, { space: 0 }), /\n/);
        assert.match(encodeJSON({ a: 1 }, { replacer: (k, v) => (k === 'a' ? 9 : v) }), /"a": 9/);
    });

    await test('encodeJSON supports the shorthand indent argument', () => {
        assert.equal(encodeJSON({ a: 1 }, 0), '{"a":1}');
    });

    // ---- decodeContent --------------------------------------------------
    await test('decodeContent interpolates expressions', () => {
        assert.equal(decodeContent('hi ${name}, ${a + b}', {
            params: { name: 'p1', a: 1, b: 2 }
        }), 'hi p1, 3');
    });

    await test('decodeContent keeps backslashes literal (Windows paths)', () => {
        assert.equal(decodeContent('C:\\Users\\name'), 'C:\\Users\\name');
    });

    await test('decodeContent keeps backticks literal', () => {
        assert.equal(decodeContent('use `code` here'), 'use `code` here');
    });

    await test('decodeContent emits a literal ${...} when escaped', () => {
        assert.equal(decodeContent('\\${notAVar}'), '${notAVar}');
    });

    await test('decodeContent handles nested braces and nested templates', () => {
        assert.equal(decodeContent('${ ({a: 2}).a } / ${ `x${1}` }', {}), '2 / x1');
    });

    await test('decodeContent reports unclosed interpolation', () => {
        assert.throws(() => decodeContent('oops ${a'), /unclosed/);
    });

    await test('decode helpers reject non-object options', () => {
        assert.throws(() => decodeJSON('({a:1})', 42), /option must be an object/);
        assert.throws(() => decodeContent('hi', []), /option must be an object/);
    });

    await test('toJSON is read without triggering an accessor getter', () => {
        let calls = 0;
        const obj = {};
        Object.defineProperty(obj, 'toJSON', {
            enumerable: true,
            get() { calls++; return () => ({ safe: true }); }
        });
        encodeJSON({ obj });
        assert.equal(calls, 0);
    });

    await test('replacer transforms values and receives key/value', () => {
        const seenKeys = [];
        const text = encodeJSON({ a: 1, b: 2 }, {
            space: 0,
            replacer(key, value) { seenKeys.push(key); return key === 'a' ? 9 : value; }
        });
        assert.equal(text, '{"a":9,"b":2}');
        assert.deepEqual(seenKeys, ['', 'a', 'b']);
    });

    console.log('\n' + passed + ' checks passed, ' + failed + ' failed');
})();
