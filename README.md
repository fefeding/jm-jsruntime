# jm-jsruntime
运行js脚本或 json decode

# 解析带函数属性的json
```js
const {
    encodeJSON,
    decodeJSON,
    decodeContent,
    runScript
} = require('jm-jsruntime');

const json = decodeJSON(`{
    fun: ()=>{
        }, 
    prop: '1', 
    obj: {
        a: 1
    }
}`);

console.log('json', json);
```

# 序列化带函数的json
```js
const {
    encodeJSON
} = require('jm-jsruntime');

const str = encodeJSON({
    "pro1": "1",
    "obj": {
        "p2": 1,
        "fun": ()=>{
            console.log(2);
        },
        "obj": {
            "p3": 0,
            "fun": function (a) {
                return a;
            }
        }
    }
});
console.log(str);
```

# 解析带参数的文本
```js
const content = decodeContent(" doecode content ${params1}, ${params2}", {

    params: {
        "params1": "p1",
        "params2": 3
    }
});

console.log('content', content);
```

# 执行js脚本
```js
const ret = runScript(`
    console.log('add');
    console.log(params1+params2);
    return params1 + params2;
    `, 
    {
        params: {
            "params1": 1,
            "params2": 2
        }
    });

console.log('script result：', ret);
```

## 可以指定是promise，执行异步脚本

```js
const ret = runScript(`
    return await fun();
    `, 
    {
        promise: true, // 指定是一个异步脚本
        params: {
            "fun": async function(){}
        }
    });

console.log('async script result：', ret);
```