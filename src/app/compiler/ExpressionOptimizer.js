function ExpressionOptimizer(expr)
{
	this.expr = expr;
}

ExpressionOptimizer.prototype = new Generator();


ExpressionOptimizer.ZERO = { type: 'number', re: 0, im: 0 };
ExpressionOptimizer.ONE = { type: 'number', re: 1, im: 0 };


ExpressionOptimizer.prototype.unaryExpression = function(expr)
{
	if (expr.arg.type === 'number')
	{
		var f = expr.op === '-' ? -1 : 1;
		return {
			type: 'number',
			re: f * expr.arg.re,
			im: f * expr.arg.im
		}
	}
};

ExpressionOptimizer.prototype.binaryExpression = function(expr)
{
	var left = this.generate(expr.left);
	var right = this.generate(expr.right);

	if (left !== expr.left || right !== expr.right)
	{
		expr = {
			type: 'binaryExpression',
			op: expr.op,
			left: left,
			right: right
		};
	}

	switch (expr.op)
	{
	case '+':
		if (left.type === 'number' && right.type === 'number')
			return Complex.add(left, right);
		if (left.type === 'number' && left.re === 0 && left.im === 0)
			return right;
		if (right.type === 'number' && right.re === 0 && right.im === 0)
			return left;
		return expr;

	case '-':
		if (left.type === 'number' && right.type === 'number')
			return Complex.subtract(left, right);
		if (left.type === 'number' && left.re === 0 && left.im === 0)
		{
			return {
				type: 'unaryExpression',
				op: '-',
				arg: right
			};
		}
		if (right.type === 'number' && right.re === 0 && right.im === 0)
			return left;
		return expr;

	case '*':
		if (left.type === 'number' && right.type === 'number')
			return Complex.multiply(left, right);

		// if right is a number, swap left and right
		if (right.type === 'number')
		{
			var tmp = left;
			left = right;
			right = tmp;
		}

		// check if left is a number and check for "special" numbers
		if (left.type === 'number' && left.im === 0)
		{
			if (left.re === 0)
				return ExpressionOptimizer.ZERO;
			if (left.re === 1)
				return right;
			if (left.re === -1)
			{
				return {
					type: 'unaryExpression',
					op: '-',
					arg: right
				};
			}
		}

		return expr;

	case '/':
		if (left.type === 'number' && right.type === 'number')
			return Complex.divide(left, right);

		// replace division by a number by multiplication with the recipiprocal of the number
		if (right.type === 'number')
		{
			// check for special numbers
			if (right.im === 0)
			{
				if (right.re === 0)
					throw new Error('Division by 0');
				if (right.re === 1)
					return left;
				if (right.re === -1)
				{
					return {
						type: 'unaryExpression',
						op: '-',
						arg: right
					};
				}
			}

			expr.op = '*';
			right = Complex.divide(ExpressionOptimizer.ONE, right);
		}

		return expr;

	case '^':
		if (left.type === 'number' && right.type === 'number')
			return Complex.power(left, right);

		// check for special bases
		if (left.type === 'number' && left.im === 0)
		{
			if (left.re === 0)
				return ExpressionOptimizer.ZERO;
			if (left.re === 1)
				return ExpressionOptimizer.ONE;
		}

		// check for special exponents
		if (right.type === 'number' && right.im === 0)
		{
			if (right.re === 0)
				return ExpressionOptimizer.ONE;
			if (right.re === 1)
				return left;
			if (right.re === -1)
			{
				return {
					type: 'binaryExpression',
					op: '/',
					left: ExpressionOptimizer.ONE,
					right: left
				};
			}

			// integer power
			if (b.re === (b.re | 0) && -64 <= b.re && b.re <= 64)
			{
				var pow = {
					type: 'binaryExpression',
					op: '^int',
					left: a,
					right: b
				};

				return b.re > 0 ?
					pow :
					{
						type: 'binaryExpression',
						op: '/',
						left: ExpressionOptimizer.ONE,
						right: pow
					};
			}
		}

		// generic case
		return {
			type: 'functionExpression',
			name: 'exp',
			arg: {
				type: 'binaryExpression',
				op: '*',
				left: {
					type: 'functionExpression',
					name: 'log',
					arg: a
				},
				right: b
			}
		};
	}

	throw new Error('Unknown operator ' + op);
};

ExpressionOptimizer.prototype.functionExpression = function(expr)
{
	if (expr.arg.type === 'number' && Complex[expr.name])
		return Complex[expr.name](expr.arg);
};
