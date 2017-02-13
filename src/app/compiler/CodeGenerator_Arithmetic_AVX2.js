CodeGenerator.prototype.add = function(left, right)
{
	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	if (right.type === 'number')
	{
		var tmp = left;
		left = right;
		right = tmp;
	}

	var isLeftNumber = left.type === 'number';

	if (isLeftNumber)
		left = this.number(left, left.re !== 0, left.im !== 0);

	// add real part
	if (isLeftNumber && left.re === 0)
		result.re = right.re;
	else
		this.instructions.push({ code: 'vaddpd', ops: [ result.re, left.re, right.re ] });

	// add imaginary part
	if (isLeftNumber && left.im === 0)
		result.im = right.im;
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

	if (right.type === 'number')
	{
		var tmp = left;
		left = right;
		right = tmp;
	}

	var isLeftNumber = left.type === 'number';
	var isSpecialCaseHandled = false;

	// result.re <- left.re * right.re - left.im * right.im
	// result.im <- left.re * right.im + left.im * right.re

	if (isLeftNumber)
	{
		// note: not both re and im can be 0 (was already filtered out by ExpressionOptimizer)
		if (left.re === 0)
		{
			isSpecialCaseHandled = true;

			if (left.im === 1)
			{
				// * i
				var tmp = this.createRegister();
				this.instructions.push({ code: 'vxorpd', ops: [ tmp, tmp, tmp ] });
				this.instructions.push({ code: 'vsubpd', ops: [ result.re, tmp, right.im ] });

				result.im = right.re;
			}
			else if (left.im === -1)
			{
				// * (-i)
				result.re = right.im;

				var tmp = this.createRegister();
				this.instructions.push({ code: 'vxorpd', ops: [ tmp, tmp, tmp ] });
				this.instructions.push({ code: 'vsubpd', ops: [ result.re, tmp, right.im ] });

				return result;
			}
			else if (left.im === 2)
			{
				// * 2i
				var tmp1 = this.createRegister();
				var tmp2 = this.createRegister();

				this.instructions.push({ code: 'vxorpd', ops: [ tmp1, tmp1, tmp1 ] });
				this.instructions.push({ code: 'vsubpd', ops: [ tmp2, tmp1, right.im ]});
				this.instructions.push({ code: 'vsubpd', ops: [ result.re, tmp2, right.im ]});

				this.instructions.push({ code: 'vaddpd', ops: [ result.im, right.re, right.re ] });
			}
			else if (left.im === -2)
			{
				// * (-2i)
				var tmp1 = this.createRegister();
				var tmp2 = this.createRegister();

				this.instructions.push({ code: 'vaddpd', ops: [ result.re, right.im, right.im ] });

				this.instructions.push({ code: 'vxorpd', ops: [ tmp1, tmp1, tmp1 ] });
				this.instructions.push({ code: 'vsubpd', ops: [ tmp2, tmp1, right.re ]});
				this.instructions.push({ code: 'vsubpd', ops: [ result.im, tmp2, right.re ]});
			}
			else
			{
				var c = this.getConstant(left.im);

				this.instructions.push({ code: 'vxorpd', ops: [ result.re, result.re, result.re ] });
				this.instructions.push({ code: 'vfnmadd231pd', ops: [ result.re, c, right.im ] })

				this.instructions.push({ code: 'vmulpd', ops: [ result.im, c, right.re ] });				
			}
		}
		else if (left.im === 0)
		{
			// note: "* 1" and "* (-1)" are already handled in the ExpressionOptimizer
			isSpecialCaseHandled = true;

			if (left.re === 2)
			{
				this.instructions.push({ code: 'vaddpd', ops: [ result.re, right.re, right.re ] });
				this.instructions.push({ code: 'vaddpd', ops: [ result.im, right.im, right.im ] });
			}
			else if (left.re === -2)
			{
				var tmp1 = this.createRegister();
				var tmp2 = this.createRegister();
				var tmp3 = this.createRegister();
				var tmp4 = this.createRegister();

				this.instructions.push({ code: 'vxorpd', ops: [ tmp1, tmp1, tmp1 ] });
				this.instructions.push({ code: 'vsubpd', ops: [ tmp2, tmp1, right.re ]});
				this.instructions.push({ code: 'vsubpd', ops: [ result.re, tmp2, right.re ]});

				this.instructions.push({ code: 'vxorpd', ops: [ tmp3, tmp3, tmp3 ] });
				this.instructions.push({ code: 'vsubpd', ops: [ tmp4, tmp3, right.im ]});
				this.instructions.push({ code: 'vsubpd', ops: [ result.im, tmp4, right.im ]});
			}
			else
			{
				var c = this.getConstant(left.re);
				this.instructions.push({ code: 'vmulpd', ops: [ result.re, c, right.re ] });
				this.instructions.push({ code: 'vmulpd', ops: [ result.im, c, right.im ] });				
			}
		}
	}

	if (!isSpecialCaseHandled)
	{
		// generic case

		if (isLeftNumber)
			left = this.number(left, true, true);

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
