
const {
    encodeJSON,
    decodeJSON,
    decodeContent,
    runScript
} = require('./index');


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
        },
        "arr": [
            1,2,3
        ]
    }
});
console.log('encodeJSON',str);

const json = decodeJSON(`{
    fun: ()=>{
        }, 
    prop: '1'
}`);

console.log('json', json);

const content = decodeContent(" doecode content ${params1}, ${params2}", {

    params: {
        "params1": "p1",
        "params2": 3
    }
});

console.log('content', content);

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

async function testPromiseScript() {
    const promise = runScript(`
        // 脚本可以是一个async结果 
        const r = await fun();
        return r;
        `, 
        {
            promise: true, // 指定是一个异步脚本
            params: {
                "fun": async function(){
                    return new Promise((resolve, reject) => {
                        // 延时5秒后返回
                        setTimeout(()=>{
                            resolve('timeout: 5s');
                        }, 5000);
                    });
                }
            }
        });
    console.log('promise:', promise);
    console.log('async script result：', await promise);
}

testPromiseScript();

