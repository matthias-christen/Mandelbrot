function FormulaGenerator(ast)
{
	this.expr = ast;
}

FormulaGenerator.prototype = new Generator();

FormulaGenerator.prototype.number = function(num)
{
	return '(' + num.re + '+' + num.im + 'i)';
};

FormulaGenerator.prototype.variable = function(v)
{
	if (v.name)
		return v.name;

	if (v.re === 'x' && v.im === 'y')
		return 'z';
	if (v.re === 'u' && v.im === 'v')
		return 'c';
	if (v.re === 'dx' && v.im === 'dy')
		return 'dz';
};

FormulaGenerator.prototype.assignment = function(expr)
{
	return this.generate(expr.target) + ' = ' + this.generate(expr.expr) + '\n';
};

FormulaGenerator.prototype.unaryExpression = function(expr)
{
	return '(' + expr.op + '(' + this.generate(expr.arg) + '))';
};

FormulaGenerator.prototype.binaryExpression = function(expr)
{
	if (expr.op === '^int')
		return '(' + this.generate(expr.left) + '^' + expr.right.re + ')';
	return '(' + this.generate(expr.left) + expr.op + this.generate(expr.right) + ')';
};

FormulaGenerator.prototype.functionExpression = function(f)
{
	return f.name + '(' + this.generate(f.arg) + ')';
};
