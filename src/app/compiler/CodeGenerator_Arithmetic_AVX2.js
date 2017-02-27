CodeGenerator.prototype.add = function(left, right)
{
	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	// if the left operand is a number, swap it with right
	// (note that not both left and right can be numbers, the expression optimizer
	// has taken care that constants are folded)
	if (left.type === 'number')
	{
		var tmp = left;
		left = right;
		right = tmp;
	}

	var isRightNumber = right.type === 'number';

	if (isRightNumber)
		right = this.number(right, right.re !== 0, right.im !== 0);

	// add real part
	if (isRightNumber && right.re === 0)
		result.re = left.re;
	else
		this.instructions.push({ code: 'vaddpd', ops: [ result.re, left.re, right.re ] });

	// add imaginary part
	if (isRightNumber && right.im === 0)
		result.im = left.im;
	else
		this.instructions.push({ code: 'vaddpd', ops: [ result.im, left.im, right.im ] });

	return result;
};

CodeGenerator.prototype.subtract = function(left, right)
{
	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	var isLeftNumber = left.type === 'number';
	var isRightNumber = right.type === 'number';

	if (isLeftNumber)
		left = this.number(left, left.re !== 0, left.im !== 0);
	if (isRightNumber)
		right = this.number(right, right.re !== 0, right.im !== 0);

	// subtract real part
	if (isLeftNumber && left.re === 0)
	{
		var tmp = this.createRegister();
		this.instructions.push({ code: 'vxorpd', ops: [ tmp, tmp, tmp ] });
		this.instructions.push({ code: 'vsubpd', ops: [ result.re, tmp, right.re ] });
	}	
	else if (isRightNumber && right.re === 0)
		result.re = left.re;
	else if (isLeftNumber)
	{
		// load the constant and subtract
		var tmp = this.createRegister();
		this.instructions.push({ code: 'vmovapd', ops: [ tmp, left.re ] });
		this.instructions.push({ code: 'vsubpd', ops: [ result.re, tmp, right.re ] });
	}
	else
		this.instructions.push({ code: 'vsubpd', ops: [ result.re, left.re, right.re ] });

	// subtract imaginary part
	if (isLeftNumber && left.im === 0)
	{
		var tmp = this.createRegister();
		this.instructions.push({ code: 'vxorpd', ops: [ tmp, tmp, tmp ] });
		this.instructions.push({ code: 'vsubpd', ops: [ result.im, tmp, right.im ] });
	}
	else if (isRightNumber && right.im === 0)
		result.im = left.im;
	else if (isLeftNumber)
	{
		var tmp = this.createRegister();
		this.instructions.push({ code: 'vmovapd', ops: [ tmp, left.im ] });
		this.instructions.push({ code: 'vsubpd', ops: [ result.im, tmp, right.im ] });		
	}
	else
		this.instructions.push({ code: 'vsubpd', ops: [ result.im, left.im, right.im ] });
	
	return result;
};

CodeGenerator.prototype.multiply = function(left, right)
{
	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	if (left.type === 'number')
	{
		var tmp = left;
		left = right;
		right = tmp;
	}

	var isRightNumber = right.type === 'number';
	var isSpecialCaseHandled = false;

	// result.re <- left.re * right.re - left.im * right.im
	// result.im <- left.re * right.im + left.im * right.re

	if (isRightNumber)
	{
		// note: not both re and im can be 0 (was already filtered out by ExpressionOptimizer)
		if (right.re === 0)
		{
			isSpecialCaseHandled = true;

			if (right.im === 1)
			{
				// * i
				var tmp = this.createRegister();
				this.instructions.push({ code: 'vxorpd', ops: [ tmp, tmp, tmp ] });
				this.instructions.push({ code: 'vsubpd', ops: [ result.re, tmp, left.im ] });

				result.im = left.re;
			}
			else if (right.im === -1)
			{
				// * (-i)
				result.re = left.im;

				var tmp = this.createRegister();
				this.instructions.push({ code: 'vxorpd', ops: [ tmp, tmp, tmp ] });
				this.instructions.push({ code: 'vsubpd', ops: [ result.re, tmp, left.im ] });

				return result;
			}
			else if (right.im === 2)
			{
				// * 2i
				var tmp1 = this.createRegister();
				var tmp2 = this.createRegister();

				this.instructions.push({ code: 'vxorpd', ops: [ tmp1, tmp1, tmp1 ] });
				this.instructions.push({ code: 'vsubpd', ops: [ tmp2, tmp1, left.im ]});
				this.instructions.push({ code: 'vsubpd', ops: [ result.re, tmp2, left.im ]});

				this.instructions.push({ code: 'vaddpd', ops: [ result.im, left.re, left.re ] });
			}
			else if (right.im === -2)
			{
				// * (-2i)
				var tmp1 = this.createRegister();
				var tmp2 = this.createRegister();

				this.instructions.push({ code: 'vaddpd', ops: [ result.re, left.im, left.im ] });

				this.instructions.push({ code: 'vxorpd', ops: [ tmp1, tmp1, tmp1 ] });
				this.instructions.push({ code: 'vsubpd', ops: [ tmp2, tmp1, left.re ]});
				this.instructions.push({ code: 'vsubpd', ops: [ result.im, tmp2, left.re ]});
			}
			else
			{
				var c = this.getConstant(right.im);

				this.instructions.push({ code: 'vxorpd', ops: [ result.re, result.re, result.re ] });
				this.instructions.push({ code: 'vfnmadd231pd', ops: [ result.re, c, left.im ] })

				this.instructions.push({ code: 'vmulpd', ops: [ result.im, c, left.re ] });
			}
		}
		else if (right.im === 0)
		{
			// note: "* 1" and "* (-1)" are already handled in the ExpressionOptimizer
			isSpecialCaseHandled = true;

			if (right.re === 2)
			{
				this.instructions.push({ code: 'vaddpd', ops: [ result.re, left.re, left.re ] });
				this.instructions.push({ code: 'vaddpd', ops: [ result.im, left.im, left.im ] });
			}
			else if (right.re === -2)
			{
				var tmp1 = this.createRegister();
				var tmp2 = this.createRegister();
				var tmp3 = this.createRegister();
				var tmp4 = this.createRegister();

				this.instructions.push({ code: 'vxorpd', ops: [ tmp1, tmp1, tmp1 ] });
				this.instructions.push({ code: 'vsubpd', ops: [ tmp2, tmp1, left.re ]});
				this.instructions.push({ code: 'vsubpd', ops: [ result.re, tmp2, left.re ]});

				this.instructions.push({ code: 'vxorpd', ops: [ tmp3, tmp3, tmp3 ] });
				this.instructions.push({ code: 'vsubpd', ops: [ tmp4, tmp3, left.im ]});
				this.instructions.push({ code: 'vsubpd', ops: [ result.im, tmp4, left.im ]});
			}
			else
			{
				var c = this.createRegister();
				this.instructions.push({ code: 'vmovapd', ops: [ c, this.getConstant(right.re) ] });
				this.instructions.push({ code: 'vmulpd', ops: [ result.re, left.re, c ] });
				this.instructions.push({ code: 'vmulpd', ops: [ result.im, left.im, c ] });
			}
		}
	}

	if (!isSpecialCaseHandled)
	{
		// generic case

		if (isRightNumber)
			right = this.number(right, true, true);

		// result.re <- left.im * right.im
		this.instructions.push({ code: 'vmulpd', ops: [ result.re, left.im, right.im ] });
		// result.re <- result.re - left.re*right.re
		this.instructions.push({ code: 'vfmsub231pd', ops: [ result.re, left.re, right.re ] });

		this.instructions.push({ code: 'vmulpd', ops: [ result.im, left.re, right.im ] });
		this.instructions.push({ code: 'vfmadd231pd', ops: [ result.im, left.im, right.re ] });
	}

	return result;
};

CodeGenerator.prototype.divide = function(left, right)
{
	// (a+bi) / (c+di) = (a+bi)*(c-di) / (c^2+d^2)

	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	var numerator = this.multiply(
		left,
		right.type === 'number' ? Complex.conj(right) : this.conj(right)
	);

	// denominator = right.re^2 + right.im^2
	var denominator = this._real_cabs_square(right);
	var invDenominator = this.createRegister();
	this.instructions.push({ code: 'vdivpd', ops: [ invDenominator, this.getConstant(1), denominator ]});

	// multiply result.* with tmp
	this.instructions.push({ code: 'vmulpd', ops: [ result.re, numerator.re, invDenominator ] });
	this.instructions.push({ code: 'vmulpd', ops: [ result.im, numerator.im, invDenominator ] });
		
	return result;
};

/**
 * (a+bi)^n (n integer)
 */
CodeGenerator.prototype.integerPower = function(left, right)
{
	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	var powB;
	var newPowB;

	// a^n
	result.re = this.simplePower(left.re, right.re);

	// c1*a^(n-1)*bi + ... + c(n-1)*a*(bi)^(n-1)
	for (var i = 1; i < right.re; i++)
	{
		// get the result register
		var r = (i & 1) ? result.im : result.re;

		// "advance" powB (i.e., powB *= left.im)
		if (i >= 2)
		{
			newPowB = this.createRegister();
			this.instructions.push({ code: 'vmulpd', ops: [ newPowB, i >= 3 ? powB : left.im, left.im ] });
			powB = newPowB;
		}

		// compute ci*a^(n-i)
		var coeff = this.binomialCoefficient(i, right.re);
		var c = coeff > 2 ? this.getConstant(coeff) : undefined;
		var powA = coeff >= 2 ? this.createRegister() : undefined;

		if (i >= right.re - 1)
		{
			if (coeff === 1)
				powA = left.re;
			if (coeff === 2)
				this.instructions.push({ code: 'vaddpd', ops: [ powA, left.re, left.re ] });
			else
				this.instructions.push({ code: 'vmulpd', ops: [ powA, left.re, c ] });
		}
		else
		{
			var pow = this.simplePower(left.re, right.re - i);
			if (coeff === 1)
				powA = pow;
			else if (coeff === 2)
				this.instructions.push({ code: 'vaddpd', ops: [ powA, pow, pow ] });
			else
				this.instructions.push({ code: 'vmulpd', ops: [ powA, pow, c ] });
		}

		// multiply with (bi)^i and add to result
		if (i === 1)
			this.instructions.push({ code: 'vmulpd', ops: [ r, left.im, powA ] });
		else
		{
			this.instructions.push({
				code: (i & 2) ? 'vfnmadd231pd' : 'vfmadd231pd',
				ops: [ r, i === 1 ? left.im : powB, powA ]
			});
		}
	}

	// (bi)^n
	this.instructions.push({
		code: (i & 2) ? 'vfnmadd231pd' : 'vfmadd231pd',
		ops: [ (i & 1) ? result.im : result.re, left.im, i === 2 ? left.im : powB ]
	});
	
	return result;
};

/**
 * Computes reg0^n (n integer) and stores the result in reg.
 * The algorithm doesn't make use of any additional registers and uses
 * as few multiplications as possible.
 * E.g., reg0^10 = (((reg0^2)^2)*reg0)^2.
 */
CodeGenerator.prototype.simplePower = function(reg0, n /* >= 2 */)
{
	var ops = [];
	while (n > 2)
	{
		if (n & 1)
		{
			// times reg0
			ops.push(false);
			--n;
		}
		else
		{
			// square
			ops.push(true);
			n /= 2;
		}
	}

	var ret = this.createRegister();
	this.instructions.push({ code: 'vmulpd', ops: [ ret, reg0, reg0 ] });

	for (var i = ops.length - 1; i >= 0; i--)
	{
		var reg = ret;
		ret = this.createRegister();
		this.instructions.push({ code: 'vmulpd', ops: [ ret, reg, ops[i] ? reg /* ^2 */ : reg0 /* *reg0 */ ] });
	}

	return ret;
};

/**
 * Computes the binomial coefficient (k,n)
 */
CodeGenerator.prototype.binomialCoefficient = function(k, n)
{
	// n!/(k! * (n-k)!)

	var r = 1;
	for (var i = k + 1; i <= n; i++)
		r *= i;
	for (var i = 1; i <= n - k; i++)
		r /= i;

	return r;
};
