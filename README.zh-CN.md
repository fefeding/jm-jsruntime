# jm-jsruntime

[English](./README.md) | 简体中文

一个零依赖的轻量运行时，用于执行**以数据形式存储**的 JavaScript，而不是写在源码里的脚本：

- 注入参数并执行 JS 片段（`runScript`）；
- 解析带真实函数的对象字面量（`decodeJSON`）；
- 把带函数属性的对象反向序列化（`encodeJSON`）；
- 对配置文案做 `${...}` 插值（`decodeContent`）。

典型场景：带行为钩子的配置对象、存放在数据库中的模板文案、低代码 / 规则引擎、快速脚本实验。

[在线演示](https://jiamao.github.io/jm-jsruntime/example/index.html)

> **安全提示**：本库用 `new Function` 编译字符串，等价于 `eval`，**不是沙箱**。只执行可信代码，详见[安全](#安全)。

## 特性

- 零依赖、无构建步骤，一个运行时文件 + 手写的 TypeScript 类型声明。
- 支持 Node.js（CommonJS）与浏览器（需一个小的 `module` 垫片）。
- 参数注入、同步与 `async` / `await` 脚本、异步超时。
- 可往返函数、`Date`、`RegExp`、`Map`、`Set`、`BigInt`、`NaN`、`Infinity`、`undefined` 与数组自定义属性。
- 模板字面量转义正确：反斜杠与反引号保持字面量，`\${...}` 输出字面 `${...}`。
- 编译结果带小型 LRU 缓存；测试改为断言式。

## 安装

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

已随包提供 `index.d.ts`，并在 `types` 与 `exports` 中声明，无需 `@types`。

```ts
import { runScript, decodeJSON, encodeJSON, decodeContent } from 'jm-jsruntime';

const sum = runScript<number>('return a + b', { params: { a: 1, b: 2 } });

// 异步重载返回 Promise<T>
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

主要类型：`ScriptOptions`（`params`、`async`、兼容别名 `promise`、`timeout`）、`SyncScriptOptions`、`DecodeOptions`、`EncodeOptions`、`EncodeReplacer`。`runScript` 有重载，`{ async: true }` / `{ promise: true }` 时返回 `Promise<T>`。

## 快速上手

### 解析带函数的对象字面量

```js
const obj = decodeJSON(`{
  fun: () => { console.log('hello'); },
  prop: '1'
}`);

console.log(obj);     // { fun: [Function: fun], prop: '1' }
obj.fun();            // hello
```

### 序列化带函数的对象

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

函数按 `toString()` 源码原样输出并保留换行，因此双引号字符串和 `//` 行注释都能往返。结果是 **JavaScript 源码，不是严格 JSON**，不能用 `JSON.parse` 读取。

```js
encodeJSON({ fn: function () { return "hi"; } }, { space: 0 });
// '{"fn":function () { return "hi"; }}'
```

### 模板文案插值

```js
decodeContent('decode content ${a}, ${b}', { params: { a: 'p1', b: 3 } });
// 'decode content p1, 3'

decodeContent('total: ${a + b}', { params: { a: 1, b: 2 } }); // 'total: 3'
decodeContent('C:\\Users\\name');                             // 'C:\Users\name'
decodeContent(String.raw`literal: \${notAVar}`);             // 'literal: ${notAVar}'
```

### 执行脚本

```js
const ret = runScript(`
  console.log('add');
  return params1 + params2;
`, { params: { params1: 1, params2: 2 } });
// 打印 add，ret === 3
```

### 执行异步脚本

```js
const value = await runScript('return await fn();', {
  async: true,                 // 也可用兼容别名 promise: true
  timeout: 1000,               // 超时拒绝，不再无限等待
  params: { fn: async () => 'done' }
});
// 'done'
```

## API 参考

| API | 说明 | 返回值 |
| --- | --- | --- |
| `runScript(code, options?, context?)` | 编译并执行一段函数体 | 脚本 `return` 的值；`async`/`promise` 为真时返回 `Promise` |
| `decodeJSON(js, options?)` | 求值对象字面量表达式（允许函数） | 求值结果 |
| `encodeJSON(value, options?)` | 序列化带函数属性的值 | JavaScript 字面量字符串（默认 2 空格缩进） |
| `decodeContent(content, options?)` | 求值含 `${...}` 的模板字面量 | 插值后的字符串 |
| `clearCache()` | 清空编译缓存 | `void` |

### `runScript(code, options?, context?)`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `code` | `string` | 函数体；需自行写 `return ...`，没有 `return` 则返回 `undefined` |
| `options.params` | `Record<string, unknown>` | 每个**自有**键成为形参名、对应值成为实参；键会按 JS 标识符校验，非法抛 `TypeError` |
| `options.async` | `boolean` | 使用 `AsyncFunction` 构造器，脚本顶层可用 `await` |
| `options.promise` | `boolean` | `async` 的兼容别名 |
| `options.timeout` | `number` | N 毫秒后拒绝返回的 Promise；只能配合 `async`/`promise`，**不会取消**正在执行的脚本 |
| `context` | `any` | 脚本内 `this`，通过 `fn.call(context, ...)` 传入；默认 `undefined`（非严格脚本里为 `globalThis`） |

语法错误会以带编译信息的 `SyntaxError` 重新抛出（`error.cause`）；运行时异常原样冒泡。编译结果按 `(code, 形参名, 同步/异步)` 缓存，采用真正的 LRU（命中会刷新顺序），上限 128 条。

```js
runScript('return this.prefix + name;', { params: { name: 'Ada' } }, { prefix: 'Hi ' });
// 'Hi Ada'
```

### `decodeJSON(js, options?)`

等价于 `runScript('return (\n' + js + '\n);', { params: options.params })`。文本**原样使用**、不做转义，因此字面量里的模板字符串可正常工作；外层括号让以 `{` 开头的内容成为表达式，换行让末尾 `//` 注释不吞掉代码。这里**不支持** `${...}` 插值，插值请用 `decodeContent`。

### `decodeContent(content, options?)`

把 `content` 构造成模板字面量：字面文本被转义（反斜杠、反引号保持字面量），`${...}` 表达式交给引擎求值，`\${` 输出字面 `${`。支持 `${...}` 内的嵌套花括号、字符串与嵌套模板；未闭合的 `${` 抛 `SyntaxError`。`options` 只接受 `params`，插值始终同步执行。

### `encodeJSON(value, options?)`

| `options` | 含义 |
| --- | --- |
| `{ space }` | 缩进，语义同 `JSON.stringify` 的 `space`（空格数或字面字符串）；默认 `2`，`0` 为紧凑输出 |
| `{ replacer }` | 可选的 `(key, value) => unknown` 转换函数，在编码每个值前调用 |
| `number` / `string` | `space` 的简写 |
| `function` | `replacer` 的简写 |

支持：函数（输出源码、不加引号）、字符串、数字（含 `NaN`、`Infinity`）、布尔、`BigInt`（`10n`）、`undefined`、`Date`（`new Date("…")`）、`RegExp`、`Map`/`Set`、数组（自定义属性用 `Object.assign([...], {...})` 保留）与普通对象。循环引用抛出信息明确的 `TypeError`。属性值从 descriptor 读取，**不会触发 getter**；纯访问器属性与 Symbol 键会被跳过。

### `clearCache()`

清空编译缓存，适合测试或会生成大量不同脚本的长驻宿主。

## 浏览器用法

```html
<script>var module = { exports: {} };</script>
<script src="node_modules/jm-jsruntime/index.js"></script>
<script>
  var obj = module.exports.decodeJSON("{ fun: () => alert('hi'), prop: '1' }");
  obj.fun();
</script>
```

`example/index.html` 正是这种做法。严格 CSP 若未开放 `unsafe-eval`，`new Function` 会被禁用，本库无法运行。

## 安全

`new Function` 在**当前全局作用域**编译，脚本可以访问 `global`、`process`、`window`、`document`、`fetch` 以及从全局可达的一切。本库不提供：

- 沙箱、隔离、权限白名单或 AST 校验；
- **同步**脚本的超时与取消（`while (true)` 会阻塞宿主）；
- 对 `runScript` / `decodeJSON` / `decodeContent` 源码的清洗（`decodeContent` 的 `${...}` 可接受任意表达式）。

编译前会校验形参名是否为合法标识符，堵住了通过 `options.params` 键注入的路径，但这**不会让脚本本身变安全**。

因此：

- **只执行完全可信的代码与配置**。不要把用户输入的字符串或不可信的远端配置传给任何一个辅助函数。
- 不要用本库隔离第三方插件或租户提供的规则。执行不可信代码请使用真正的隔离边界（独立进程中的 Node `vm`、`isolated-vm`、带消息通信与超时的 Worker / iframe、SES，或静态校验过的 AST 解释器）。
- `option.timeout` 只限制异步脚本的等待时间，无法中止同步死循环。

## 限制与已知问题

- **闭包无法保留**：序列化后的函数丢失词法作用域；类、绑定函数与原生函数无法可靠还原。
- **被跳过的值**：纯访问器属性（getter/setter）、Symbol 键与原型链不编码；稀疏数组会变成显式的 `undefined` 项。
- **不是严格 JSON**：`encodeJSON` 的输出是 JS 源码，请用 `decodeJSON` 而非 `JSON.parse` 读取。
- **无调试映射**：堆栈指向生成的包装代码，没有 source map。
- **运行时格式**：仅 CommonJS（提供了 `index.d.ts`，但没有 ESM / UMD 产物），TS 调用方使用命名导入。
- **复杂 `${...}` 表达式**：插值扫描器支持嵌套花括号、字符串与嵌套模板；极端表达式（如含花括号的正则字面量）建议通过 `params` 传入。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `index.js` | 全部实现与 CommonJS 导出 |
| `index.d.ts` | 手写的 TypeScript 类型声明 |
| `test.js` | 断言测试（`npm test`） |
| `example/index.html` | 浏览器示例（GitHub Pages） |
| `package.json` | 元数据，含 `types`/`exports`/`files`，无依赖 |

## 开发

```shell
npm test   # node test.js —— 29 项断言，无外部测试框架
```

## 许可证

[MIT](./LICENSE) © jiamao
