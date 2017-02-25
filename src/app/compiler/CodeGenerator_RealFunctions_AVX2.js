/**
 * Computes the square of the absolute value of the complex number "arg".
 * Returns the register in which the result is saved.
 */
CodeGenerator.prototype._real_cabs_square = function(arg)
{
	var ret = this.createRegister();

	this.instructions.push({ code: 'vmulpd', ops: [ ret, arg.re, arg.re ] });
	this.instructions.push({ code: 'vfmadd231pd', ops: [ ret, arg.im, arg.im ] });

	return ret;
};

/**
 * Computes the absolute value of the complex number "arg".
 * Returns the register in which the result is saved.
 */
CodeGenerator.prototype._real_cabs = function(arg)
{
	var ret = this.createRegister();
	this.instructions.push({ code: 'vsqrtpd', ops: [ ret, this._real_abs_square(arg) ] });
	return ret;
};

/**
 * Computes the absolute value of the real number "arg".
 * Returns the register in which the result is saved.
 */
CodeGenerator.prototype._real_abs = function(arg)
{
	var ret = this.createRegister();
	this.instructions.push({ code: 'vandnpd', ops: [ ret, arg, this.getBitConstant(0x8000000000000000, 64) ] });
	return ret;
};

/**
 * Computes the logarithm of the real number "arg".
 * Returns the register in which the result is saved.
 *
 * log = function(x) {
 *   if (x == 0) return -Infinity
 *   if (x < 0) return NaN
 *
 *   x = frexp(x, e)
 *   m = x < sqrt(1/2)
 *   e = e - (m ? 1 : 0)
 *
 *   if (abs(e) > 2) {
 *     // branch 1
 *     z = x - (m ? 0.5 : 1)
 *     y = 0.5 * z + (m ? 0.5 : 1)
 *     x = z / y
 *     z = x^2
 *     y = x * ( z * polevl(z, R, 2) / p1evl(z, S, 3))
 *   } else {
 *     // branch 2
 *     x = x - 1 + (m ? x : 0)
 *     z = x^2
 *     y = x * (z * polevl(x, P, 5) / p1evl(x, Q, 5))
 *   }
 *
 *   y = y - e * 2.121944400546905827679e-4
 *   if (abs(e) <= 2) y = y - 0.5*z
 *   z = y + x
 *   return z + e * 0.693359375
 * }
 */
CodeGenerator.prototype._real_log = function(arg)
{
    // arg = frexp(arg, &exp);
    var noExpMask = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ noExpMask, this.getBitConstant(0x800fffffffffffff, 64) ] });

    // filter out mantissa
    var tmp1 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp1, arg, noExpMask ] });
    // set the new exponent
    var x = this.createRegister();
    this.instructions.push({ code: 'vorpd', ops: [ x, tmp1, this.getBitConstant(0x3fe0000000000000, 64) ] });

    // filter out exponent
    var tmp2 = this.createRegister();
    this.instructions.push({ code: 'vandnpd', ops: [ tmp2, noExpMask, arg ] });
    var intExp = this.createRegister();
    this.instructions.push({ code: 'vpsrlq', ops: [ intExp, tmp2, 52 ] });

    // convert uint64 => double; http://stackoverflow.com/questions/41144668/how-to-efficiently-perform-double-int64-conversions-with-sse-avx
    var tmp3 = this.createRegister();
    this.instructions.push({ code: 'vpaddq', ops: [ tmp3, intExp, this.getConstant(0x0018000000000000) ] });
    var exp = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ exp, tmp3, this.getConstant(0x0018000000000000 + 1022) ] });
    
    // compute mask "x < sqrt(1/2)"
    var maskLtSqrtHalf = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ maskLtSqrtHalf, x, this.getConstant(Math.sqrt(0.5)), 17 ] });
    
    // e -= mask ? 1 : 0;
    var one = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ one, this.getConstant(1) ] });
    var maskedOne = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ maskedOne, maskLtSqrtHalf, one ] });
    newExp = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ newExp, exp, maskedOne ] });
    

    // branch 1:
    
    // z = x - (mask ? 0.5 : 1);
    var half = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ half, this.getConstant(0.5) ] });
    // mask ? 0.5 : 1
    var mask1 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ mask1, one, half, maskLtSqrtHalf ] });
    var z1 = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ z1, x, mask1 ] });
    
    // y = 0.5*z + (mask ? 0.5 : 1)
    var tmp4 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ tmp4, z1, half ] });
    var ytmp = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ ytmp, tmp4, mask1 ] });
    
    // x = z / y
    var x1 = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ x1, z1, ytmp ] });
    
    var x1square = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ x1square, x1, x1 ] });
    
    // polevl(x^2, R, 2)
    var r = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ r, this.getConstant(-7.89580278884799154124e-1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ r, x1square, this.getConstant(1.63866645699558079767e1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ r, x1square, this.getConstant(-6.41409952958715622951e1) ] });
    
    // p1evl(x^2, S, 3)
    var s = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ s, x1square, this.getConstant(-3.56722798256324312549e1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ s, x1square, this.getConstant(3.12093766372244180303e2) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ s, x1square, this.getConstant(-7.69691943550460008604e2) ] });

    // y = x * (x^2 * polevl(x^2, R, 2) / p1evl(x^2, S, 3))
    var tmp5 = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ tmp5, r, s ] });
    var tmp6 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ tmp6, x1square, tmp5 ] });
    var y1 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ y1, x1, tmp6 ] });
    
    
    // branch 2:
    
    // x = x + 1 + (mask ? x : 0)
    // tmp7 = x + 1
    var tmp7 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ tmp7, x, one ] });
    // tmp8 = mask ? x : 0
    var tmp8 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp8, x, maskLtSqrtHalf ] });
    // x2 = tmp7 + tmp8
    var x2 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ x2, tmp7, tmp8 ] });
    
    // x2square = x*x;
    var x2square = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ x2square, x2, x2 ] });
    
    // polevl(x, P, 5)
    var p = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ p, this.getConstant(1.01875663804580931796e-4) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, x2, this.getConstant(4.97494994976747001425e-1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, x2, this.getConstant(4.70579119878881725854e0) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, x2, this.getConstant(1.44989225341610930846e1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, x2, this.getConstant(1.79368678507819816313e1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, x2, this.getConstant(7.70838733755885391666e0) ] });
    
    // p1evl(x, Q, 5)
    var q = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ q, x2, this.getConstant(1.12873587189167450590e1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, x2, this.getConstant(4.52279145837532221105e1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, x2, this.getConstant(8.29875266912776603211e1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, x2, this.getConstant(7.11544750618563894466e1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, x2, this.getConstant(2.31251620126765340583e1) ] });
    
    // y = x * (x^2 * polevl(x, P, 5) / p1evl(x, Q, 5));
    var tmp9 = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ tmp9, p, q ] });
    var tmp10 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ tmp10, tmp9, x2square ] });
    var y2 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ y2, tmp10, x2 ] });
    
    
    // combine x and y
    
    // abs(e)<=2
    var tmp11 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp11, newExp, this.getBitConstant(0x8000000000000000, 64) ] });
    var maskLe2 = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ maskLe2, tmp11, this.getConstant(2), 18 ] });
    
    var x0 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ x0, x2, x1, maskLe2 ] });
    var y0 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ y0, y2, y1, maskLe2 ] });
    
    // y = y - e * 2.121944400546905827679e-4;
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ y0, newExp, this.getConstant(2.121944400546905827679e-4) ] });
    
    // z = y + x
    var z0 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ z0, y0, x0 ] });
    
    // z = z + e * 0.693359375
    this.instructions.push({ code: 'vfmadd231pd', ops: [ z0, newExp, this.getConstant(0.693359375) ] });

    
    // check for x <= 0
    var zero = this.createRegister();
    this.instructions.push({ code: 'vxorpd', ops: [ zero, zero, zero ] });
    var maskLe0 = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ maskLe0, arg, zero, 18 ] });
    // NaN
    var tmp12 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ tmp12, z0, this.getConstant(NaN), maskLe0 ] });
    var maskEq0 = this.createRegister();
    this.instructions.push({ code: 'vpcmpeqd', ops: [ maskEq0, arg, zero ] });
    // -Inf
    var ret = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ ret, tmp12, this.getConstant(-Infinity), maskEq0 ] });
    
    return ret;
};

/**
 * Compute exp(arg).
 *
 * exp = function(x) {
 *   n = floor(log2(e) * x + 0.5)
 *   x -= n * 6.93145751953125e-1
 *   x -= n * 1.42860682030941723212e-6
 *   xx = x^2
 *   px = x * polevl(xx, P, 2)
 *   x = px / (polevl(xx, Q, 3) - px)
 *   x = 1 + 2*x
 *   return x * 2^n
 * }
 */
CodeGenerator.prototype._real_exp = function(arg)
{
    // limit -709 < arg < 709
    var tmp1 = this.createRegister();
    this.instructions.push({ code: 'vminpd', ops: [ tmp1, arg, this.getConstant(709.78288357821549920801706215) ] });
    var argLim = this.createRegister();
    this.instructions.push({ code: 'vmaxpd', ops: [ argLim, tmp1, this.getConstant(-709.78288357821549920801706215) ] });

    // express exp(x) as exp(g + n*log(2))
    var tmp2 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ tmp2, argLim, this.getConstant(1.44269504088896341 /* log2(e) */) ] });
    var tmp3 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ tmp3, tmp2, this.getConstant(0.5) ] });
    // round down toward -infinity
    var argRounded = this.createRegister();
    this.instructions.push({ code: 'vroundpd', ops: [ argRounded, tmp3, 1 ] });

    // x -= px * C1
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ argLim, argRounded, this.getConstant(6.93145751953125e-1) ] });
    // x -= px * C2
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ argLim, argRounded, this.getConstant(1.42860682030941723212e-6) ] });

    // rational approximation for exponential of the fractional part:
    // e^x = 1 + 2x P(x^2) / (Q(x^2) - P(x^2))

    // xx <- x * x;
    var xx = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ xx, argLim, argLim ] });
    // px <- x * polevl(xx, P, 2)
    var p = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ p, this.getConstant(1.26177193074810590878e-4) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, xx, this.getConstant(3.02994407707441961300e-2) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, xx, this.getConstant(9.99999999999999999910e-1) ] });
    var px = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ px, p, argLim ] });

    // x <- px / (polevl(xx, Q, 3) - px)
    var q = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ q, this.getConstant(3.00198505138664455042e-6) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, xx, this.getConstant(2.52448340349684104192e-3) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, xx, this.getConstant(2.27265548208155028766e-1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, xx, this.getConstant(2.00000000000000000009e0) ] });
    var tmp4 = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ tmp4, q, px ] });
    var x = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ x, px, tmp4 ] });

    // x <- 1 + 2x;
    var twoX = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ twoX, x, x ] });
    var twoXp1 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ twoXp1, twoX, this.getConstant(1) ] });

    // x <- x * 2^n
    this.instructions.push({ code: 'vcvttpd2dq', ops: [ argRounded, argRounded ] });
    this.instructions.push({ code: 'vpmovzxdq', ops: [ argRounded, argRounded ] });
    var tmp5 = this.createRegister();
    this.instructions.push({ code: 'vpaddd', ops: [ tmp5, argRounded, this.getBitConstant(1023, 64) ] });
    var tmp6 = this.createRegister();
    this.instructions.push({ code: 'vpsllq', ops: [ tmp6, tmp5, 52 ] });
    var ret = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ ret, twoXp1, tmp6 ] });

    return ret;
};

/**
 * Compute sin(arg), cos(arg).
 * https://groups.google.com/forum/#!topic/alt.lang.asm/nHd0kZ13v3Y
 */
CodeGenerator.prototype._real_sincos = function(arg)
{
    // load the sign mask
    var signMask = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ signMask, this.getBitConstant(0x8000000000000000, 64) ] });

    // save the sign bit
    var signBit = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ signBit, arg, signMask ] });

    // take the absolute value of x
    var absX = this.createRegister();
    this.instructions.push({ code: 'vandnpd', ops: [ absX, signMask, arg ] });

    // y = |x| * 4 / pi
    var y = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ y, absX, this.getConstant(4 / Math.PI) ] });
    var roundY = this.createRegister();
    this.instructions.push({ code: 'vroundpd', ops: [ roundY, y, 3 ] });

    // j = (j+1) & ~1 (see the cephes sources)
    var tmp1 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ tmp1, roundY, this.getConstant(0.0625) ] });
    var tmp2 = this.createRegister();
    this.instructions.push({ code: 'vroundpd', ops: [ tmp2, tmp1, 3 ] });
    this.instructions.push({ code: 'vfnmadd132pd', ops: [ tmp2, roundY, this.getConstant(16) ] });
    var truncY = this.createRegister();
    this.instructions.push({ code: 'vcvttpd2dq', ops: [ truncY, tmp2 ] });
    var tmp3 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp3, truncY, this.getBitConstant(1, 32) ] });
    // j += 1
    var j = this.createRegister();
    this.instructions.push({ code: 'vpaddd', ops: [ j, truncY, tmp3 ] });
    var dblJ = this.createRegister();
    this.instructions.push({ code: 'vcvtdq2pd', ops: [ dblJ, tmp3 ] });
    // y += 1.0
    var y1 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ y1, roundY, dblJ ] });

    var tmp4 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp4, j, this.getBitConstant(4, 32) ] });
    // move mask to highest position
    var tmp5 = this.createRegister();
    this.instructions.push({ code: 'vpslld', ops: [ tmp5, tmp4, 29 ] });
    var tmp6 = this.createRegister();
    this.instructions.push({ code: 'vpmovzxdq', ops: [ tmp6, tmp5 ] });
    var mask = this.createRegister();
    this.instructions.push({ code: 'vpsllq', ops: [ mask, tmp6, 32 ] });

    // invert the sign
    var sinSignBit = this.createRegister();
    this.instructions.push({ code: 'vxorpd', ops: [ sinSignBit, signBit, mask ] });

    var cmp = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ cmp, j, this.getBitConstant(3, 32) ] });
    var zero = this.createRegister();
    this.instructions.push({ code: 'vxorpd', ops: [ zero, zero, zero ] });
    var cmpMask = this.createRegister();
    this.instructions.push({ code: 'vpcmpeqd', ops: [ cmpMask, cmp, zero ] });
    var selMask = this.createRegister();
    this.instructions.push({ code: 'vpmovsxdq', ops: [ selMask, cmpMask ] });

    // extended precision modular arithmetic
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ absX, y1, this.getConstant(7.85398125648498535156e-1) ] });
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ absX, y1, this.getConstant(3.77489470793079817668e-8) ] });
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ absX, y1, this.getConstant(2.69515142907905952645e-15) ] });

    // compute the sign bit for "cos"
    var tmp7 = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ tmp7, j, this.getBitConstant(2, 32) ] });
    var tmp8 = this.createRegister();
    this.instructions.push({ code: 'vandnpd', ops: [ tmp8, tmp7, this.getBitConstant(4, 32) ] });
    var tmp9 = this.createRegister();
    this.instructions.push({ code: 'vpslld', ops: [ tmp9, tmp8, 29 ] });
    var tmp10 = this.createRegister();
    this.instructions.push({ code: 'vpmovzxdq', ops: [ tmp10, tmp9 ] });
    var cosSignBit = this.createRegister();
    this.instructions.push({ code: 'vpsllq', ops: [ cosSignBit, tmp10, 32 ] });

    // compute z = x^2
    var z = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ z, absX, absX ] });

    // evaluate the first polynomial
    // ((SINCOF_P0 * z + SINCOF_P1) * z + SINCOF_P2) ... * z * x + x
    var p0 = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ p0, this.getConstant(1.58962301576546568060e-10) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p0, z, this.getConstant(-2.50507477628578072866e-8) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p0, z, this.getConstant(2.75573136213857245213e-6) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p0, z, this.getConstant(-1.98412698295895385996e-4) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p0, z, this.getConstant(8.33333333332211858878e-3) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p0, z, this.getConstant(-1.66666666666666307295e-1) ] });
    var p1 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ p1, p0, z ] });
    var p2 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ p2, p1, absX ] });
    var p = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ p, p2, absX ] });

    // evaluate the second polynomial
    // ((COSCOF_P0 * z + COSCOF_P1) * z + COSCOF_P2) ... * z^2 - 0.5*z + 1
    var q0 = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ q0, this.getConstant(-1.13585365213876817300e-11) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q0, z, this.getConstant(2.08757008419747316778e-9) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q0, z, this.getConstant(-2.75573141792967388112e-7) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q0, z, this.getConstant(2.48015872888517045348e-5) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q0, z, this.getConstant(-1.38888888888730564116e-3) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q0, z, this.getConstant(4.16666666666665929218e-2) ] });
    var q1 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ q1, q0, z ] });
    var q2 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ q2, q1, z ] });
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ q2, z, this.getConstant(0.5) ] });
    var q = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ q, q2, this.getConstant(1) ] });

    // combine sin
    var sinNoSign = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ sinNoSign, q, p, selMask ] });
    var sin = this.createRegister();
    this.instructions.push({ code: 'vxorpd', ops: [ sin, sinNoSign, sinSignBit ] });

    // combine cos
    var cosNoSign = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ cosNoSign, p, q, selMask ] });
    var cos = this.createRegister();
    this.instructions.push({ code: 'vxorpd', ops: [ cos, cosNoSign, cosSignBit ] });

    return {
    	sin: sin,
    	cos: cos
    };
};

/**
 * Compute atan2(y, x).
 *
 * atan2 = function(y, x) {
 *   // angle selection depending on signs of x, y
 *   c = x >= 0 ? (pi + (y < 0 ? -2pi : 0)) : 0
 *   return atan(y / x) + c
 * }
 *
 * atan = function(x) {
 *   sign = sgn(x)
 *   x = abs(x)
 *
 *   // range reduction
 *   if (x > tan(3pi/8)) {
 *     y = pi/2
 *     x = -1/x
 *     m = 6.123233995736765886130E-17
 *   } else if (x <= 0.66) {
 *     y = 0
 *     m = 0
 *   } else {
 *     y = pi/4
 *     x = (x-1) / (x+1)
 *     m = 0.5 * 6.123233995736765886130E-17
 *   }
 *
 *   z = x^2
 *   z = z * polevl(z, P, 4) / p1evl(z, Q, 5)
 *   z = x * z + x + m
 *   return sign * (y + z)
 * }
 */
CodeGenerator.prototype._real_atan2 = function(y, x)
{
    var zero = this.createRegister();
    this.instructions.push({ code: 'vxorpd', ops: [ zero, zero, zero ] });
    
    // angle selection depending on signs of x, y
    // c = (pi + (y<0 ? -2pi : 0)) & (x<0)
    // compute the mask "y < 0"
    var yLtZeroMask = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ yLtZeroMask, y, zero, 17 ] });
    var m2PiMasked = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ m2PiMasked, yLtZeroMask, this.getConstant(-2 * Math.PI) ] });
    var m2PiPlusPiMasked = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ m2PiPlusPiMasked, m2PiMasked, this.getConstant(Math.PI) ] });

    // compute the mask "x < 0"
    var xLtZeroMask = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ xLtZeroMask, x, zero, 17 ] });
    var c = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ c, m2PiPlusPiMasked, xLtZeroMask ] });

    // z = y / x
    var z = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ z, y, x ] });
    var signMask = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ signMask, this.getBitConstant(0x8000000000000000, 64) ] });
    var signBit = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ signBit, z, signMask ] });
    var absX = this.createRegister();
    this.instructions.push({ code: 'vandnpd', ops: [ absX, signMask, z ] });
    
    // compute the mask M1 := "x > tan(3pi/8)"
    var tan3Pi8 = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ tan3Pi8, this.getConstant(Math.tan(3 * Math.PI / 8)) ] });
    var mask1 = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ mask1, absX, tan3Pi8, 30 ] });
    
    // compute the mask !M2 := "x <= 0.66"
    var notMask2 = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ notMask2, absX, this.getConstant(0.66), 30 ] });
    
    // M1 | !M2
    var mask1OrNotMask2 = this.createRegister();
    this.instructions.push({ code: 'vorpd', ops: [ mask1OrNotMask2, mask1, notMask2 ] });
    
    // x = blend(M1, -1/x, blend(!M2, (x-1)/(x+1), x))
    var mOne = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ mOne, this.getConstant(-1) ] });
    // x-1
    var xm1 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ xm1, absX, mOne ] });
    // x+1
    var xp1 = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ xp1, absX, mOne ] });
    // (x-1)/(x+1)
    var xm1Byxp1 = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [xm1Byxp1, xm1, xp1 ] });
    var tmp1 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ tmp1, absX, xm1Byxp1, notMask2 ] });
    // -1/x
    var m1Byx = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ m1Byx, mOne, absX ] });
    var x0 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ x0, tmp1, m1Byx, mask1 ] });
    
    // y=0; y += (M1 | !M2) & (M_PI/4); y += M1 & (M_PI/4)
    var piBy4 = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ piBy4, this.getConstant(Math.PI / 4) ] });
    // tmp2 = pi/4 & (M1 | !M2)
    var tmp2 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp2, piBy4, mask1OrNotMask2 ] });
    // tmp3 = pi/4 & M1
    var tmp3 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp3, piBy4, mask1 ] });
    var y = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ y, tmp2, tmp3 ] });
    
    // m=0; m += (M1 | !M2) & (0.5 * 6.123233995736765886130E-17); m += M1 & (0.5 * 6.123233995736765886130E-17);
    var a = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ a, this.getConstant(0.5 * 6.123233995736765886130e-17) ] });
    var tmp4 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp4, a, mask1OrNotMask2 ] });
    var tmp5 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp5, a, mask1 ] });
    var m = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ m, tmp4, tmp5 ] });
    
    // z = x * x
    var z = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ z, x0, x0 ] });

    // polevl(z, P, 4)
    var p = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ p, this.getConstant(-8.750608600031904122785e-1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, z, this.getConstant(-1.615753718733365076637e1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, z, this.getConstant(-7.500855792314704667340e1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, z, this.getConstant(-1.228866684490136173410e2) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, z, this.getConstant(-6.485021904942025371773e1) ] });

    // p1evl(z, Q, 5)
    var q = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ q, z, this.getConstant(2.485846490142306297962e1) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, z, this.getConstant(1.650270098316988542046e2) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, z, this.getConstant(4.328810604912902668951e2) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, z, this.getConstant(4.853903996359136964868e2) ] });
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, z, this.getConstant(1.945506571482613964425e2) ] });

    // z = z * polevl(z, P, 4) / p1evl(z, Q, 5)
    var pByQ = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ pByQ, p, q ] });
    var z0 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ z0, z, pByQ ] });

    // z = x * z + x;
    this.instructions.push({ code: 'vfmadd213pd', ops: [ z0, x0, x0 ] });

    // z += m
    var z1 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ z1, z0, m ] });

    // y = y + z
    var y0 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ y0, y, z1 ] });

    // if (sign < 0) y = -y
    var y1 = this.createRegister();
    this.instructions.push({ code: 'vxorpd', ops: [ y1, y0, signBit ] });

    // y = y + c
    var y2 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ y2, y1, c ] });

    return y2;
};

/**
 * Compute sinh(arg), cosh(arg).
 */
CodeGenerator.prototype._real_sinhcosh = function(arg)
{
    // sinh(x) = 0.5 * (exp(x) - exp(-x))
	// cosh(x) = 0.5 * (exp(x) + exp(-x))

    var exp = this._real_exp(arg);

    var half = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ half, this.getConstant(0.5) ] });

    var halfExp = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ halfExp, half, exp ] });

    var halfExpNeg = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ halfExpNeg, half, exp ] });

    var sinh = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ sinh, halfExp, halfExpNeg ] });

    var cosh = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ cosh, halfExp, halfExpNeg ] });

    return {
        sinh: sinh,
        cosh: cosh
    };
};
