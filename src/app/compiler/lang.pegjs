Program = expr:Expression {
    return expr;
}

Expression = AdditiveExpression / BracketedExpression

BaseExpression = BracketedExpression / FunctionExpression / Variable / NumberLiteral

ExponentExpression = e:BaseExpression tail:(_ "^" _ BaseExpression)* {
    var ret = e;
    var len = tail.length;
    
    for (var i = 0; i < len; i++)
    {
        ret = {
            type: 'binaryExpression',
            op: '^',
            left: ret,
            right: tail[i][3]
        };
    }
    
    return ret;
}

UnaryExpression = op:("+" / "-")? _ e:ExponentExpression {
    if (!op || op === '+')
        return e;
    
    return {
        type: 'unaryExpression',
        op: op,
        arg: e
    };
}

MultiplicativeExpression = e:UnaryExpression tail:(_ ("*" / "/") _ UnaryExpression)* {
    var ret = e;
    var len = tail.length;
    
    for (var i = 0; i < len; i++)
    {
        var c = tail[i];
        ret = {
            type: 'binaryExpression',
            op: c[1],
            left: ret,
            right: c[3]
        };
    }
    
    return ret;
}

AdditiveExpression = e:MultiplicativeExpression tail:(_ ("+" / "-") _ MultiplicativeExpression)* {
    var ret = e;
    var len = tail.length;

    for (var i = 0; i < len; i++)
    {
        var c = tail[i];
        ret = {
            type: 'binaryExpression',
            op: c[1],
            left: ret,
            right: c[3]
        };
    }

    return ret;
}

BracketedExpression = "(" _ e:Expression _ ")" {
    return e;
}

FunctionExpression = fn:("re" / "im" / "conj" / "sqr" / "sqrt" / "exp" / "ln" / "log" / "sin" / "cos" / "tan" / "sinh" / "cosh" / "tanh") _ "(" _ arg:Expression _ ")" {
    return {
        type: 'functionExpression',
        name: fn,
        arg: arg
    };
}

NumberLiteral = num:([0-9]*("."[0-9]*)?([eE][0-9]+)?) i:"i"? {
    function flatten(a)
    {
        if (typeof a === 'string')
            return a;

        if (Array.isArray(a))
        {
            var ret = '';
            var len = a.length;
            for (var i = 0; i < len; i++)
                ret += flatten(a[i]);
                
            return ret;
        }
        
        return '';
    }
    
    var val = parseFloat(flatten(num));
    return {
        type: 'number',
        re: i ? 0 : val,
        im: i ? (isNaN(val) ? 1 : val) : 0
    };
}

Variable = v:("z" / "c") {
    if (v === 'z') {
        return {
            type: 'variable',
            re: 'x',
            im: 'y'
        };
    }
    
    return {
        type: 'variable',
        re: 'u',
        im: 'v'
    };
}

_ = [ \t]*