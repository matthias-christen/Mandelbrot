function Generator(expr)
{
	this.expr = expr;
}

Generator.prototype.generate = function(expr)
{
	if (!expr)
		expr = this.expr;

	var fn = this[expr.type];
	if (fn)
		return fn.call(this, expr);
	
	return expr;
};

