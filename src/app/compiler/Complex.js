window.Complex = {
	re: function(a)
	{
		if (a.type === 'number')
		{
			return {
				type: 'number',
				re: a.re,
				im: 0
			};
		}
	},

	im: function(a)
	{
		if (a.type === 'number')
		{
			return {
				type: 'number',
				re: a.im,
				im: 0
			};
		}
	},

	conj: function(a)
	{
		if (a.type === 'number')
		{
			return {
				type: 'number',
				re: a.re,
				im: -a.im
			};
		}
	},

	add: function(a, b)
	{
		if (a.type === 'number' && b.type === 'number')
		{
			return {
				type: 'number',
				re: a.re + b.re,
				im: a.im + b.im
			};
		}
	},

	subtract: function(a, b)
	{
		if (a.type === 'number' && b.type === 'number')
		{
			return {
				type: 'number',
				re: a.re - b.re,
				im: a.im - b.im
			};
		}
	},

	multiply: function(a, b)
	{
		if (a.type === 'number' && b.type === 'number')
		{
			// (a+bi) * (c+di) = ac-bd + (ad+bc)i
			return {
				type: 'number',
				re: a.re * b.re - a.im * b.im,
				im: a.re * b.im + a.im * b.re
			};
		}
	},

	divide: function(a, b)
	{
		if (a.type === 'number' && b.type === 'number')
		{
			// (a+bi) / (c+di) = (a+bi)*(c-di) / (c^2+d^2)
			var f = 1 / (b.re * b.re + b.im * b.im);
			return {
				type: 'number',
				re: f * (a.re * b.re + a.im * b.im),
				im: f * (a.im * b.re - a.re * b.im)
			};
		}
	},

	power: function(a, b)
	{
		if (a.type === 'number' && b.type === 'number')
			return Complex.exp(Complex.multiply(Complex.ln(a), b));
	},

	sqr: function(a)
	{
		return {
			type: 'binaryExpression',
			op: '^',
			left: a,
			right: { type: 'number', re: 2, im: 0 }
		};
	},

	sqrt: function(a)
	{
		if (a.type !== 'number')
			return;

		// sqrt(z) = sqrt(r*e^(i*phi)) = sqrt(r) * e^(i*phi/2)
		var f = Math.sqrt(Math.sqrt(a.re * a.re + a.im * a.im));
		var phi_2 = Math.atan2(a.im, a.re) / 2;

		return {
			type: 'number',
			re: f * Math.cos(phi_2),
			im: f * Math.sin(phi_2)
		};
	},

	// http://www.milefoot.com/math/complex/functionsofi.htm
	// http://www.suitcaseofdreams.net/inverse__hyperbolic_functions.htm

	ln: function(a)
	{
		if (a.type !== 'number')
			return;

		// ln z = ln r*e^(i*phi) = ln r + i*phi (+ 2*k*pi*i)
		var r = Math.sqrt(a.re * a.re + a.im * a.im);
		var phi = Math.atan2(a.im, a.re);

		return {
			type: 'number',
			re: Math.log(r),
			im: phi
		};
	},

	exp: function(a)
	{
		if (a.type !== 'number')
			return;

		// exp(z) = exp(a + bi) = exp(a) * exp(bi) = exp(a) * (cos(b) + i*sin(b))
		var f = Math.exp(a.re);
		return {
			type: 'number',
			re: f * Math.cos(a.im),
			im: f * Math.sin(a.im)
		};
	},

	log: function(a)
	{
		if (a.type !== 'number')
			return;

		var f = 1 / Math.log(10);
		var ret = Complex.ln(a);
		ret.re *= f;
		ret.im *= f;

		return ret;
	},

	sin: function(a)
	{
		if (a.type !== 'number')
			return;

		// sin(a + bi) = sin(a)*cosh(b) + i*cos(a)*sinh(b)
		return {
			type: 'number',
			re: Math.sin(a.re) * Math.cosh(a.im),
			im: Math.cos(a.re) * Math.sinh(a.im)
		};
	},

	cos: function(a)
	{
		if (a.type !== 'number')
			return;

		// cos(a + bi) = cos(a)*cosh(b) - i*sin(a)*sinh(b)
		return {
			type: 'number',
			re: Math.cos(a.re) * Math.cosh(a.im),
			im: -Math.sin(a.re) * Math.sinh(a.im)
		};
	},

	tan: function(a)
	{
		if (a.type !== 'number')
			return;

		// tan(a + bi) = (sin(2a) + i*sinh(2b)) / (cos(2a) + cosh(2b))
		var f = 1 / (Math.cos(2 * a.re) + Math.cosh(2 * a.im));
		return {
			type: 'number',
			re: f * Math.sin(2 * a.re),
			im: f * Math.sinh(2 * a.im)
		};
	},

	sinh: function(a)
	{
		if (a.type !== 'number')
			return;

		// sinh(a + bi) = sinh(a)*cos(b) + i*cosh(a)*sin(b)
		return {
			type: 'number',
			re: Math.sinh(a.re) * Math.cos(a.im),
			im: Math.cosh(a.re) * Math.sin(a.im)
		};
	},

	cosh: function(a)
	{
		if (a.type !== 'number')
			return;

		// cosh(a + bi) = cosh(a)*cos(b) + i*sinh(a)*sin(b)
		return {
			type: 'number',
			re: Math.cosh(a.re) * Math.cos(a.im),
			im: Math.sinh(a.re) * Math.sin(a.im)
		};
	},

	tanh: function(a)
	{
		if (a.type !== 'number')
			return;

		// tanh(a + bi) = (sinh(2a) + i*sin(2b)) / (cosh(2a) + cos(2b))
		var f = 1 / (Math.cosh(2 * a.re) + Math.cos(2 * a.im));
		return {
			type: 'number',
			re: f * Math.sinh(2 * a.re),
			im: f * Math.sin(2 * a.im)
		};
	},

	asin: function(a)
	{
		if (a.type !== 'number')
			return;

		// asin(z) = -i ln(iz +/- sqrt(1 - z^2))
		var r = Complex.sqr(a);
		r.re = 1 - r.re;
		r.im = -r.im;
		r = Complex.sqrt(r);

		r.re += a.im;
		r.im -= a.re;
		r = Complex.ln(r);

		return {
			type: 'number',
			re: r.im,
			im: -r.re
		};
	},

	acos: function(a)
	{
		if (a.type !== 'number')
			return;

		// acos(z) = -i ln(z +/- i*sqrt(1 - z^2))
		var r = Complex.sqr(a);
		r.re = 1 - r.re;
		r.im = -r.im;
		r = Complex.sqrt(r);

		r.re = a.re - r.im;
		r.im = a.im + r.re;
		r = Complex.ln(r);

		return {
			type: 'number',
			re: r.im,
			im: -r.re
		};
	},

	atan: function(a)
	{
		if (a.type !== 'number')
			return;

		// atan(z) = i/2 ln ((i+z) / (i-z))
		var r = Complex.ln(Complex.divide(
			{ type: 'number', re: a.re, im: 1 + a.im },
			{ type: 'number', re: -a.re, im: 1 - a.im }
		));

		return {
			type: 'number',
			re: -r.im * 0.5,
			im: r.re * 0.5
		};
	},

	asinh: function(a)
	{
		if (a.type !== 'number')
			return;

		// asinh(z) = ln (z +/- sqrt(z^2 + 1))
		var r = Complex.sqr(a);
		++r.re;
		r = Complex.sqrt(r);
		r.re += a.re;
		r.im += a.im;
		r = Complex.ln(r);

		return {
			type: 'number',
			re: r.re,
			im: r.im
		};
	},

	acosh: function(a)
	{
		if (a.type !== 'number')
			return;

		// acosh(z) = ln (z +/- sqrt(z^2 - 1))
		var r = Complex.sqr(a);
		--r.re;
		r = Complex.sqrt(r);
		r.re += a.re;
		r.im += a.im;
		r = Complex.ln(r);

		return {
			type: 'number',
			re: r.re,
			im: r.im
		};
	},

	atanh: function(a)
	{
		if (a.type !== 'number')
			return;

		// atanh(z) = 1/2 * (ln(1+z) - ln(1-z))
		var s = Complex.ln({ type: 'number', re: 1 + a.re, im: a.im });
		var t = Complex.ln({ type: 'number', re: 1 - a.re, im: -a.im });

		return {
			type: 'number',
			re: 0.5 * (s.re - t.re),
			im: 0.5 * (s.im - t.im)
		};
	}
};
