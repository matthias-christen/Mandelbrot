CodeGenerator.prototype.re = function(arg)
{
	var result = {
		re: arg.re,
		im: this.createRegister()
	};

	this.instructions.push({ code: 'vxorpd', ops: [ result.im, result.im, result.im ] });

	return result;
};

CodeGenerator.prototype.im = function(arg)
{
	var result = {
		re: arg.im,
		im: this.createRegister()
	};

	this.instructions.push({ code: 'vxorpd', ops: [ result.im, result.im, result.im ] });

	return result;
};

CodeGenerator.prototype.conj = function(arg)
{
	var result = {
		re: arg.re,
		im: this.createRegister()
	};

	var tmp = this.createRegister();
	this.instructions.push({ code: 'vxorpd', ops: [ tmp, tmp, tmp ] });
	this.instructions.push({ code: 'vsubpd', ops: [ result.im, tmp, arg.im ] });

	return result;
};

CodeGenerator.prototype.sqr = function(arg)
{
	return this.multiply(arg, arg);
};

CodeGenerator.prototype.sqrt = function(arg)
{
	// sqrt(z=a+bi) = sqrt(1/2) * (sqrt(abs(z) + a) + i*sgn(b)*sqrt(abs(z) - a))
	// (sgn(0) := 1)
	// (http://math.stackexchange.com/questions/44406/how-do-i-get-the-square-root-of-a-complex-number)

	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	var abs = this._real_cabs(arg);

	var tmp1 = this.createRegister();
	this.instructions.push({ code: 'vaddpd', ops: [ tmp1, abs, arg.re ] });
	var re = this.createRegister();
	this.instructions.push({ code: 'vsqrtpd', ops: [ re, tmp1 ] });

	var tmp2 = this.createRegister();
	this.instructions.push({ code: 'vsubpd', ops: [ tmp2, abs, arg.re ] });
	var im = this.createRegister();
	this.instructions.push({ code: 'vsqrtpd', ops: [ im, tmp2 ] });

	var sgn = this.createRegister();
	this.instructions.push({ code: 'vandpd', ops: [ sgn, arg.im, this.getBitConstant(0x80000000, 0x00000000) ] });
	var imSgn = this.createRegister();
	this.instructions.push({ code: 'vxorpd', ops: [ imSgn, im, sgn ] });

	var sqrt1_2 = this.createRegister();
	this.instructions.push({ code: 'vmovapd', ops: [ sqrt1_2, this.getConstant(1 / Math.sqrt(2)) ] });

	this.instructions.push({ code: 'vmulpd', ops: [ result.re, re, sqrt1_2 ] });
	this.instructions.push({ code: 'vmulpd', ops: [ result.im, imSgn, sqrt1_2 ] });

	return result;
};

CodeGenerator.prototype.exp = function(arg)
{
	// exp(z) = exp(a + bi) = exp(a) * exp(bi) = exp(a) * (cos(b) + i*sin(b))

	var result = {
		re: undefined,
		im: this.createRegister()
	};

	var f = this._real_exp(arg.re);
	if (arg.type === 'number' && arg.im === 0)
	{
		result.re = f;
		this.instructions.push({ code: 'vxorpd', ops: [ result.im, result.im, result.im ] });
	}
	else
	{
		result.re = this.createRegister();

		var sincos = this._real_sincos(arg.im);
		this.instructions.push({ code: 'vmulpd', ops: [ result.re, f, sincos.cos ] });
		this.instructions.push({ code: 'vmulpd', ops: [ result.im, f, sincos.sin ] });
	}

	return result;
};

CodeGenerator.prototype.ln = function(arg)
{
	// ln z = ln r*e^(i*phi) = ln r + i*phi (+ 2*k*pi*i)

	return {
		re: this._real_log(this._real_cabs(arg)),
		im: this._real_atan2(arg.im, arg.re)
	};
};

CodeGenerator.prototype.log = function(arg)
{
	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	var ln = this.ln(arg);
	var c = this.getConstant(1 / Math.log(10));

	this.instructions.push({ code: 'vmulpd', ops: [ result.re, ln.re, c ] });
	this.instructions.push({ code: 'vmulpd', ops: [ result.im, ln.im, c ] });

	return result;
};

CodeGenerator.prototype.sin = function(arg)
{
	// sin(a + bi) = sin(a)*cosh(b) + i*cos(a)*sinh(b)

	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	var sincos = this._real_sincos(arg.re);
	var sinhcosh = this._real_sinhcosh(arg.im);

	this.instructions.push({ code: 'vmulpd', ops: [ result.re, sincos.sin, sinhcosh.cosh ] });
	this.instructions.push({ code: 'vmulpd', ops: [ result.im, sincos.cos, sinhcosh.sinh ] });

	return result;
};

CodeGenerator.prototype.cos = function(arg)
{
	// cos(a + bi) = cos(a)*cosh(b) - i*sin(a)*sinh(b)

	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	var sincos = this._real_sincos(arg.re);
	var sinhcosh = this._real_sinhcosh(arg.im);

	this.instructions.push({ code: 'vmulpd', ops: [ result.re, sincos.cos, sinhcosh.cosh ] });

	this.instructions.push({ code: 'vxorpd', ops: [ result.im, result.im, result.im ] });
	this.instructions.push({ code: 'vfnmadd231pd', ops: [ result.im, sincos.sin, sinhcosh.sinh ] });

	return result;
};

CodeGenerator.prototype.tan = function(arg)
{
	// tan(a + bi) = (sin(2a) + i*sinh(2b)) / (cos(2a) + cosh(2b))

	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	// 2a
	var argRe2 = this.createRegister();
	this.instructions.push({ code: 'vaddpd', ops: [ argRe2, arg.re, arg.re ] });

	// sin(2a), cos(2a)
	var sincos = this._real_sincos(argRe2);

	// 2b
	var argIm2 = this.createRegister();
	this.instructions.push({ code: 'vaddpd', ops: [ argIm2, arg.im, arg.im ] });

	// sinh(2b), cosh(2b)
	var sinhcosh = this._real_sinhcosh(argIm2);

	// cos 2a + cosh 2b
	var tmp1 = this.createRegister();
	this.instructions.push({ code: 'vaddpd', ops: [ tmp1, sincos.cos, sinhcosh.cosh ] });

	// 1 / (cos 2a + cosh 2b)
	var one = this.createRegister();
	this.instructions.push({ code: 'vmovapd', ops: [ one, this.getConstant(1) ] });
	var f = this.createRegister();
	this.instructions.push({ code: 'vdivpd', ops: [ f, one, tmp1 ] });

	this.instructions.push({ code: 'vmulpd', ops: [ result.re, f, sincos.sin ] });
	this.instructions.push({ code: 'vmulpd', ops: [ result.im, f, sinhcosh.sinh ] });

	return result;
};

CodeGenerator.prototype.sinh = function(arg)
{
	// sinh(a + bi) = sinh(a)*cos(b) + i*cosh(a)*sin(b)

	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	var sincos = this._real_sincos(arg.im);
	var sinhcosh = this._real_sinhcosh(arg.re);

	this.instructions.push({ code: 'vmulpd', ops: [ result.re, sinhcosh.sinh, sincos.cos ] });
	this.instructions.push({ code: 'vmulpd', ops: [ result.im, sinhcosh.cosh, sincos.sin ] });

	return result;
};

CodeGenerator.prototype.cosh = function(arg)
{
	// cosh(a + bi) = cosh(a)*cos(b) + i*sinh(a)*sin(b)

	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	var sincos = this._real_sincos(arg.im);
	var sinhcos = this._real_sinhcosh(arg.re);

	this.instructions.push({ code: 'vmulpd', ops: [ result.re, sinhcosh.cosh, sincos.cos ] });
	this.instructions.push({ code: 'vmulpd', ops: [ result.im, sinhcosh.sinh, sincos.sin ] });

	return result;
};

CodeGenerator.prototype.tanh = function(arg)
{
	// tanh(a + bi) = (sinh(2a) + i*sin(2b)) / (cosh(2a) + cos(2b))

	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	// 2b
	var argIm2 = this.createRegister();
	this.instructions.push({ code: 'vaddpd', ops: [ argIm2, arg.im, arg.im ] });

	// sin(2b), cos(2b)
	var sincos = this._real_sincos(argIm2);

	// 2a
	var argRe2 = this.createRegister();
	this.instructions.push({ code: 'vaddpd', ops: [ argRe2, arg.re, arg.re ] });

	// sinh(2a), cosh(2a)
	var sinhcosh = this._real_sinhcosh(argRe2);

	// cos 2b + cosh 2a
	var tmp1 = this.createRegister();
	this.instructions.push({ code: 'vaddpd', ops: [ tmp1, sincos.cos, sinhcosh.cosh ] });

	// 1 / (cos 2b + cosh 2a)
	var f = this.createRegister();
	this.instructions.push({ code: 'vdivpd', ops: [ f, this.getConstant(1), tmp1 ] });

	this.instructions.push({ code: 'vmulpd', ops: [ result.re, f, sinhcosh.sinh ] });
	this.instructions.push({ code: 'vmulpd', ops: [ result.im, f, sincos.sin ] });

	return result;
};

CodeGenerator.prototype.asin = function(arg)
{
	// asin(z) = -i ln(iz +/- sqrt(1 - z^2))

	return this.multiply(
		{ type: 'number', re: 0, im: -1 },
		this.ln(
			this.add(
				this.multiply(
					{ type: 'number', re: 0, im: 1 },
					arg
				),
				this.sqrt(
					this.subtract(
						{ type: 'number', re: 1, im: 0 },
						this.sqr(arg)
					)
				)
			)
		)
	);
};

CodeGenerator.prototype.acos = function(arg)
{
	// acos(z) = -i ln(z +/- i*sqrt(1 - z^2))

	return this.multiply(
		{ type: 'number', re: 0, im: -1 },
		this.ln(
			this.add(
				arg,
				this.multiply(
					{ type: 'number', re: 0, im: 1 },
					this.sqrt(
						this.subtract(
							{ type: 'number', re: 1, im: 0 },
							this.sqr(arg)
						)
					)
				)
			)
		)
	);
};

CodeGenerator.prototype.atan = function(arg)
{
	// atan(z) = i/2 ln ((i+z) / (i-z))

	return this.multiply(
		{ type: 'number', re: 0, im: 0.5 },
		this.ln(
			this.divide(
				this.add(
					{ type: 'number', re: 0, im: 1 },
					arg
				),
				this.subtract(
					{ type: 'number', re: 0, im: 1 },
					arg
				)
			)
		)
	);
};

CodeGenerator.prototype.asinh = function(arg)
{
	// asinh(z) = ln (z +/- sqrt(z^2 + 1))

	return this.ln(
		this.add(
			arg,
			this.sqrt(
				this.add(
					this.sqr(arg),
					{ type: 'number', re: 1, im: 0 }
				)
			)
		)
	);
};

CodeGenerator.prototype.acosh = function(arg)
{
	// acosh(z) = ln (z +/- sqrt(z^2 - 1))

	return this.ln(
		this.add(
			arg,
			this.sqrt(
				this.subtract(
					this.sqr(arg),
					{ type: 'number', re: 1, im: 0 }
				)
			)
		)
	);
};

CodeGenerator.prototype.atanh = function(arg)
{
	// atanh(z) = 1/2 * (ln(1+z) - ln(1-z))

	return this.multiply(
		{ type: 'number', re: 0.5, im: 0 },
		this.subtract(
			this.ln(
				this.add(
					{ type: 'number', re: 1, im: 0 },
					arg
				)
			),
			this.ln(
				this.subtract(
					{ type: 'number', re: 1, im: 0 },
					arg
				)
			)
		)
	);
};
