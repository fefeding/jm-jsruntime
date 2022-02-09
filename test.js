
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
        }
    }
});
console.log(str);

const json = decodeJSON(str);

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

