
const {
    decodeJSON,
    decodeContent,
    runScript
} = require('./index');

const json = decodeJSON(`{
    fun: ()=>{
        }, 
    prop: '1', 
    obj: {
        a: 1
    }
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

