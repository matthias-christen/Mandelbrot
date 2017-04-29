function DerivativeCalculator(expr)
{
	this.expr = expr;
}

DerivativeCalculator.prototype = new Generator();

DerivativeCalculator.prototype.number = function(num)
{
	return { type: 'number', re: 0, im: 0 };
};

DerivativeCalculator.prototype.variable = function(v)
{
	if (v.re === 'u' && v.im === 'v')
		return { type: 'number', re: 1, im: 0 };
	if (v.re === 'x' && v.im === 'y')
		return { type: 'variable', re: 'dx', im: 'dy' };
};

DerivativeCalculator.prototype.unaryExpression = function(expr)
{
	return {
		type: 'unaryExpression',
		op: expr.op,
		arg: this.generate(expr.arg)
	};
};

DerivativeCalculator.prototype.binaryExpression = function(expr)
{
	switch (expr.op)
	{
	case '+':
	case '-':
		// (f+g)' = f' + g'
		return {
			type: 'binaryExpression',
			op: expr.op,
			left: this.generate(expr.left),
			right: this.generate(expr.right)
		};

	case '*':
		// (f*g)' = f'g + fg'
		return {
			type: 'binaryExpression',
			op: '+',
			left: {
				type: 'binaryExpression',
				op: '*',
				left: this.generate(expr.left),
				right: expr.right
			},
			right: {
				type: 'binaryExpression',
				op: '*',
				left: expr.left,
				right: this.generate(expr.right)
			}
		};

	case '/':
		// (f/g)' = (f'g - fg') / g^2
		return {
			type: 'binaryExpression',
			op: '/',
			left: {
				type: 'binaryExpression',
				op: '-',
				left: {
					type: 'binaryExpression',
					op: '*',
					left: this.generate(expr.left),
					right: expr.right
				},
				right: {
					type: 'binaryExpression',
					op: '*',
					left: expr.left,
					right: this.generate(expr.right)
				}
			},
			right: {
				type: 'binaryExpression',
				op: '^',
				left: expr.right,
				right: { type: 'number', re: 2, im: 0 }
			}
		};

	case '^':
		if (expr.right.type === 'number')
		{
			// (f^c)' = c * f^(c-1) * f'
			return {
				type: 'binaryExpression',
				op: '*',
				left: {
					type: 'binaryExpression',
					op: '*',
					left: expr.right,
					right: {
						type: 'binaryExpression',
						op: '^',
						left: expr.left,
						right: { type: 'number', re: expr.right.re - 1, im: expr.right.im }
					}
				},
				right: this.generate(expr.left)
			};
		}

		// (f^g)' = f^g * (f' * g / f + g' * ln(f))
		return {
			type: 'binaryExpression',
			op: '*',
			left: expr,
			right: {
				type: 'binaryExpression',
				op: '+',
				left: {
					type: 'binaryExpression',
					op: '*',
					left: this.generate(expr.left),
					right: {
						type: 'binaryExpression',
						op: '/',
						left: expr.right,
						right: expr.left
					}
				},
				right: {
					type: 'binaryExpression',
					op: '*',
					left: this.generate(expr.right),
					right: {
						type: 'functionExpression',
						name: 'ln',
						arg: expr.left
					}
				}
			}
		};
	}
};

DerivativeCalculator.prototype.functionExpression = function(f)
{
	var left = undefined;

	switch (f.name)
	{
	case 'sqr':
		// (z^2)' = 2z
		left = {
			type: 'binaryExpression',
			op: '*',
			left: { type: 'number', re: 2, im: 0 },
			right: f.arg
		};
		break;

	case 'sqrt':
		// sqrt(z)' = 1 / (2 * sqrt(z))
		left = {
			type: 'binaryExpression',
			op: '/',
			left: { type: 'number', re: 0.5, im: 0 },
			right: f
		};
		break;

	case 'exp':
		// exp(z)' = exp(z)
		left = f;
		break;

	case 'ln':
		// ln(z)' = 1/z
		left = {
			type: 'binaryExpression',
			op: '/',
			left: { type: 'number', re: 1, im: 0 },
			right: f.arg
		};
		break;

	case 'log':
		// log(z)' = 1 / (z * ln 10)
		left = {
			type: 'binaryExpression',
			op: '/',
			left: { type: 'number', re: 1 / Math.log(10), im: 0 },
			right: f.arg
		};
		break;

	case 'sin':
		// sin(z)' = cos(z)
		left = {
			type: 'functionExpression',
			name: 'cos',
			arg: f.arg
		};
		break;

	case 'cos':
		// cos(z)' = sin(z)
		left = {
			type: 'unaryExpression',
			op: '-',
			arg: {
				type: 'functionExpression',
				name: 'sin',
				arg: f.arg
			}
		};
		break;

	case 'tan':
		// tan(z)' = 1 + tan(z)^2
		left = {
			type: 'binaryExpression',
			op: '+',
			left: { type: 'number', re: 1, im: 0 },
			right: {
				type: 'binaryExpression',
				op: '^',
				left: f,
				right: { type: 'number', re: 2, im: 0 }
			}
		};
		break;

	 case 'sinh':
	 	// sinh(z)' = cosh(z)
	 	left = {
	 		type: 'functionExpression',
	 		name: 'cosh',
	 		arg: f.arg
	 	};
	 	break;

	 case 'cosh':
	 	// cosh(z)' = sinh(z)
	 	left = {
	 		type: 'functionExpression',
	 		name: 'sinh',
	 		arg: f.arg
	 	};
	 	break;

	 case 'tanh':
	 	// tanh(z)' = sech(z)^2 = 1 / cosh(z)^2
	 	left = {
	 		type: 'binaryExpression',
	 		left: { type: 'number', re: 1, im: 0 },
	 		right: {
	 			type: 'binaryExpression',
	 			op: '^',
	 			left: {
			 		type: 'functionExpression',
			 		name: 'cosh',
			 		arg: f.arg
			 	},
			 	right: { type: 'number', re: 2, im: 0 }
		 	}
	 	};
	 	break;

	 case 'asin':
	 	// asin(z)' = 1 / sqrt(1 - z^2)
	 	left = {
	 		type: 'binaryExpression',
	 		op: '/',
	 		left: { type: 'number', re: 1, im: 0 },
	 		right: {
		 		type: 'functionExpression',
		 		name: 'sqrt',
		 		arg: {
		 			type: 'binaryExpression',
		 			op: '-',
		 			left: { type: 'number', re: 1, im: 0 },
		 			right: {
		 				type: 'binaryExpression',
		 				op: '^',
		 				left: f.arg,
		 				right: { type: 'number', re: 2, im: 0 }
		 			}
		 		}
		 	}
	 	};
	 	break;

	 case 'acos':
	 	// acos(z)' = -1 / sqrt(1 - z^2)
	 	left = {
	 		type: 'binaryExpression',
	 		op: '/',
	 		left: { type: 'number', re: -1, im: 0 },
	 		right: {
		 		type: 'functionExpression',
		 		name: 'sqrt',
		 		arg: {
		 			type: 'binaryExpression',
		 			op: '-',
		 			left: { type: 'number', re: 1, im: 0 },
		 			right: {
		 				type: 'binaryExpression',
		 				op: '^',
		 				left: f.arg,
		 				right: { type: 'number', re: 2, im: 0 }
		 			}
		 		}
		 	}
	 	};
	 	break;

	 case 'atan':
	 	// atan(z)' = 1 / (1 + z^2)
	 	left = {
	 		type: 'binaryExpression',
	 		op: '/',
	 		left: { type: 'number', re: 1, im: 0 },
	 		right: {
	 			type: 'binaryExpression',
	 			op: '+',
	 			left: { type: 'number', re: 1, im: 0 },
	 			right: {
	 				type: 'binaryExpression',
	 				op: '^',
	 				left: f.arg,
	 				right: { type: 'number', re: 2, im: 0 }
	 			}
		 	}
	 	};
	 	break;

	 case 'asinh':
	 	// asinh(z)' = 1 / sqrt(z^2 + 1)
	 	left = {
	 		type: 'binaryExpression',
	 		op: '/',
	 		left: { type: 'number', re: 1, im: 0 },
	 		right: {
		 		type: 'functionExpression',
		 		name: 'sqrt',
		 		arg: {
		 			type: 'binaryExpression',
		 			op: '+',
		 			left: {
		 				type: 'binaryExpression',
		 				op: '^',
		 				left: f.arg,
		 				right: { type: 'number', re: 2, im: 0 }
		 			},
		 			right: { type: 'number', re: 1, im: 0 }
		 		}
		 	}
	 	};
	 	break;

	 case 'acosh':
	 	// acosh(z)' = 1 / sqrt(z^2 - 1)
	 	left = {
	 		type: 'binaryExpression',
	 		op: '/',
	 		left: { type: 'number', re: 1, im: 0 },
	 		right: {
		 		type: 'functionExpression',
		 		name: 'sqrt',
		 		arg: {
		 			type: 'binaryExpression',
		 			op: '-',
		 			left: {
		 				type: 'binaryExpression',
		 				op: '^',
		 				left: f.arg,
		 				right: { type: 'number', re: 2, im: 0 }
		 			},
		 			right: { type: 'number', re: 1, im: 0 }
		 		}
		 	}
	 	};
	 	break;

	 case 'atanh':
	 	// atanh(z)' = 1 / (1 - x^2)
	 	left = {
	 		type: 'binaryExpression',
	 		op: '/',
	 		left: { type: 'number', re: 1, im: 0 },
	 		right: {
	 			type: 'binaryExpression',
	 			op: '-',
	 			left: { type: 'number', re: 1, im: 0 },
	 			right: {
	 				type: 'binaryExpression',
	 				op: '^',
	 				left: f.arg,
	 				right: { type: 'number', re: 2, im: 0 }
	 			}
		 	}
	 	};
	 	break;

	 default:
	 	throw new Error('Unknown function ' + f.name);
	}

	return {
		type: 'binaryExpression',
		op: '*',
		left: left,
		right: this.generate(f.arg)
	};
};
