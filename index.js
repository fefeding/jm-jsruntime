
// 把查询参数中的变量 ${} 处理
function decodeJSON(js, option) {
    const code = `return ${js.replace(/`/g, "\\`")}`;
    // 先解析里面的参数，再转换成json
    //const jsonString = this.runScript(code, option);
    //const jsonCode = `return ${js}`;
    return runScript(code, option);
}

// 把文本参数中的变量 ${} 处理
function decodeContent(content, option) {
    const code = `return \`${content.replace(/`/g, "\\`")}\``;
    return runScript(code, option);
}

// 运行一个函数脚本，动态提供参数
function runScript(code, option) {
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

    const res = fun.call(this, ...paramValues);
    return res;
}

module.exports = {
    decodeJSON,
    decodeContent,
    runScript
}

  