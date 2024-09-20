
// 把查询参数中的变量 ${} 处理
function decodeJSON(js, option) {
    const code = `return ${js.replace(/`/g, "\\`")}`;
    // 先解析里面的参数，再转换成json
    //const jsonString = this.runScript(code, option);
    //const jsonCode = `return ${js}`;
    return runScript(code, option);
}

// 把object序列化成字josn串
function encodeJSON(obj, deep=0, replacer=1, space=2) {
    if(!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return obj;
    if(typeof obj === 'function') return obj.toString();

    const funcStartTag = '___function:\u200b:start';
    const funcStartReg = new RegExp(`"${funcStartTag}\\s`, 'g');
    const funcEndTag = '___function:\u200b:end';
    const funcEndReg = new RegExp(`${funcEndTag}\\s"`, 'g');
    const newObj = {};
    for(const key of Object.getOwnPropertyNames(obj)) {
        const v = obj[key];
        if(typeof v === 'object') {
            newObj[key] = encodeJSON(v, deep + 1, replacer, space);
        }
        else if(typeof v === 'function') {
            newObj[key] = `${funcStartTag} ${v.toString()}${funcEndTag} `.replace(/[\r\n]/g, "");
        }
        else {
            newObj[key] = v;
        }
    } 
    // 第一层直接返回字符串结果
    if(deep === 0) {
        let str = JSON.stringify(newObj, replacer, space);
        str = str.replace(funcStartReg, '').replace(funcEndReg, '');
        return str;
    }
    return newObj;
}

// 把文本参数中的变量 ${} 处理
function decodeContent(content, option) {
    const code = `return \`${content.replace(/`/g, "\\`")}\``;
    return runScript(code, option);
}

// 运行一个函数脚本，动态提供参数
function runScript(code, option, context=this) {
    option = option || {};
    const paramNames = []; // 函数参数名，
    const paramValues = []; // 函数调用参数值
    if (option.params) {
    for (let k in option.params) {
        if (typeof k !== "string") continue;
        paramNames.push(k);
        paramValues.push(option.params[k]);
    }
    }

    const FunctionConstructor = option.promise
    ? Object.getPrototypeOf(
        //async 函数
        async function () {}
        ).constructor
    : Function;

    const fun = new FunctionConstructor(...paramNames, code);

    const res = fun.call(context, ...paramValues);
    return res;
}

module.exports = {
    encodeJSON,
    decodeJSON,
    decodeContent,
    runScript
}

  