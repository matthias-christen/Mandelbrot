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
    //"vmovupd ymm3,[rax]\n" // mask: 0x800fffffffffffff
    var noExpMask = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ noExpMask, this.getBitConstant(0x800fffffffffffff, 64) ] });

    //"vandpd ymm1,ymm0,ymm3\n" // filter out mantissa
    var tmp1 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp1, arg, noExpMask ] });
    //"vorpd ymm1,ymm1,[rax+32]\n" // set the new exponent
    var x = this.createRegister();
    this.instructions.push({ code: 'vorpd', ops: [ x, tmp1, this.getBitConstant(0x3fe0000000000000, 64) ] });

    //"vandnpd ymm2,ymm3,ymm0\n" // filter out exponent
    var tmp2 = this.createRegister();
    this.instructions.push({ code: 'vandnpd', ops: [ tmp2, noExpMask, arg ] });
    //"vpsrlq ymm2,ymm2,52\n"
    var intExp = this.createRegister();
    this.instructions.push({ code: 'vpsrlq', ops: [ intExp, tmp2, 52 ] });

    // convert uint64 => double; http://stackoverflow.com/questions/41144668/how-to-efficiently-perform-double-int64-conversions-with-sse-avx
    var tmp3 = this.createRegister();
    //"vpaddq ymm2,ymm2,[rax+64]\n"
    this.instructions.push({ code: 'vpaddq', ops: [ tmp3, intExp, this.getConstant(0x0018000000000000) ] });
    //"vsubpd ymm2,ymm2,[rax+96]\n"
    var exp = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ exp, tmp3, this.getConstant(0x0018000000000000 + 1022) ] });
    // now: x in ymm1, e in ymm2
    
    // x < 0.70710678118654752440, mask in ymm4
    //"vcmppd ymm4,ymm1,[rax+128],17\n"
    var maskLtSqrtHalf = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ maskLtSqrtHalf, x, this.getConstant(Math.sqrt(0.5)) ] });
    
    // e -= mask ? 1 : 0;
    //"vmovapd ymm10,[rax+192]\n" // ymm10=1
    var one = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ one, this.getConstant(1) ] });
    //"vandpd ymm15,ymm4,ymm10\n"
    var maskedOne = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ maskedOne, maskLtSqrtHalf, one ] });
    //"vsubpd ymm2,ymm2,ymm15\n"
    newExp = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ newExp, exp, maskedOne ] });
    

    // branch 1:
    
    // z = x - (mask ? 0.5 : 1);
    //"vmovapd ymm14,[rax+160]\n" // ymm14=0.5
    var half = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ half, this.getConstant(0.5) ] });
    //"vblendvpd ymm5,ymm10,ymm14,ymm4\n" // ymm5 = mask ? 0.5 : 1
    var mask1 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ mask1, one, half, maskLtSqrtHalf ] });
    //"vsubpd ymm7,ymm1,ymm5\n" // ymm7=z
    var z1 = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ z1, x, mask1 ] });
    
    // y = 0.5*z + (mask ? 0.5 : 1)
    //"vmulpd ymm6,ymm7,ymm14\n" // ymm6=y
    var tmp4 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ tmp4, z1, half ] });
    //"vaddpd ymm6,ymm6,ymm5\n"
    var ytmp = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ ytmp, tmp4, mask1 ] });
    
    // x = z / y
    //"vdivpd ymm8,ymm7,ymm6\n" // ymm8=x1
    var x1 = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ x1, z1, ytmp ] });
    
    // z = x*x
    //"vmulpd ymm7,ymm8,ymm8\n"
    var x1square = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ x1square, x1, x1 ] });
    
    // polevl( z, R, 2 )
    //"vmovapd ymm15,[rax+224]\n" // R0
    var r = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ r, this.getConstant(-7.89580278884799154124e-1) ] });
    //"vfmadd213pd ymm15,ymm7,[rax+256]\n" // R1
    this.instructions.push({ code: 'vfmadd213pd', ops: [ r, x1square, this.getConstant(1.63866645699558079767e1) ] });
    //"vfmadd213pd ymm15,ymm7,[rax+288]\n" // R2
    this.instructions.push({ code: 'vfmadd213pd', ops: [ r, x1square, this.getConstant(-6.41409952958715622951e1) ] });
    
    // p1evl( z, S, 3 )
    //"vaddpd ymm13,ymm7,[rax+320]\n" // S0
    var s = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ s, x1square, this.getConstant(-3.56722798256324312549e1) ] });
    //"vfmadd213pd ymm13,ymm7,[rax+352]\n" // S1
    this.instructions.push({ code: 'vfmadd213pd', ops: [ s, x1square, this.getConstant(3.12093766372244180303e2) ] });
    //"vfmadd213pd ymm13,ymm7,[rax+384]\n" // S2
    this.instructions.push({ code: 'vfmadd213pd', ops: [ s, x1square, this.getConstant(-7.69691943550460008604e2) ] });

    // y = x * ( z * polevl( z, R, 2 ) / p1evl( z, S, 3 ) )
    //"vdivpd ymm15,ymm15,ymm13\n"
    var tmp5 = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ tmp5, r, s ] });
    //"vmulpd ymm6,ymm7,ymm15\n"
    var tmp6 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ tmp6, x1square, tmp5 ] });
    //"vmulpd ymm6,ymm8,ymm6\n"
    var y1 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ y1, x1, tmp6 ] });
    
    
    // branch 2:
    
    // x = x + 1 + (mask ? x : 0)
    //"vaddpd ymm10,ymm1,ymm10\n" // ymm10=x2
    var tmp7 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ tmp7, x, one ] });
    //"vandpd ymm15,ymm1,ymm4\n"
    var tmp8 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp8, x, maskLtSqrtHalf ] });
    //"vaddpd ymm10,ymm1,ymm15\n"
    var x2 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ x2, x, tmp8 ] });
    
    // z = x*x;
    //"vmulpd ymm7,ymm10,ymm10\n" // ymm7=z2
    var x2square = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ x2square, x2, x2 ] });
    
    // polevl(x, P, 5)
    var p = this.createRegister();
    //"vmovapd ymm15,[rax+480]\n" // P0
    this.instructions.push({ code: 'vmovapd', ops: [ p, this.getConstant(1.01875663804580931796e-4) ] });
    //"vfmadd213pd ymm15,ymm10,[rax+512]\n" // P1
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, x, this.getConstant(4.97494994976747001425e-1) ] });
    //"vfmadd213pd ymm15,ymm10,[rax+544]\n" // P2
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, x, this.getConstant(4.70579119878881725854e0) ] });
    //"vfmadd213pd ymm15,ymm10,[rax+576]\n" // P3
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, x, this.getConstant(1.44989225341610930846e1) ] });
    //"vfmadd213pd ymm15,ymm10,[rax+608]\n" // P4
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, x, this.getConstant(1.79368678507819816313e1) ] });
    //"vfmadd213pd ymm15,ymm10,[rax+640]\n" // P5
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, x, this.getConstant(7.70838733755885391666e0) ] });
    
    // p1evl(x, Q, 5)
    //"vaddpd ymm13,ymm10,[rax+672]\n" // Q0
    var q = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ q, this.getConstant(1.12873587189167450590e1) ] });
    //"vfmadd213pd ymm13,ymm10,[rax+704]\n" // Q1
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, x, this.getConstant(4.52279145837532221105e1) ] });
    //"vfmadd213pd ymm13,ymm10,[rax+736]\n" // Q2
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, x, this.getConstant(8.29875266912776603211e1) ] });
    //"vfmadd213pd ymm13,ymm10,[rax+768]\n" // Q3
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, x, this.getConstant(7.11544750618563894466e1) ] });
    //"vfmadd213pd ymm13,ymm10,[rax+800]\n" // Q4
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, x, this.getConstant(2.31251620126765340583e1) ] });
    
    // y = x * (z * polevl(x, P, 5) / p1evl(x, Q, 5));
    //"vdivpd ymm11,ymm15,ymm13\n"
    var tmp9 = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ tmp9, p, q ] });
    //"vmulpd ymm11,ymm11,ymm7\n"
    var tmp10 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ tmp10, tmp9, x2square ] });
    //"vmulpd ymm11,ymm11,ymm10\n"
    var y2 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ y2, tmp10, x2 ] });
    
    
    // combine x and y
    
    // abs(e)<=2
    //"vandpd ymm15,ymm2,[rax+832]\n"
    var tmp11 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp11, newExp, this.getBitConstant(0x8000000000000000, 64) ] });
    //"vcmppd ymm15,ymm15,[rax+864],18\n" // mask in ymm15
    var maskLe2 = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ maskLe2, tmp11, this.getConstant(2), 18 ] });
    
    //"vblendvpd ymm1,ymm10,ymm8,ymm15\n"
    var x0 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ x0, x2, x1, maskLe2 ] });
    //"vblendvpd ymm6,ymm11,ymm6,ymm15\n"
    var y0 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ y0, y2, y1, maskLe2 ] });
    
    // y = y - e * 2.121944400546905827679e-4;
    //"vfnmadd231pd ymm6,ymm2,[rax+416]\n"
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ y0, newExp, this.getConstant(2.121944400546905827679e-4) ] });
    
    // z = y + x
    //"vaddpd ymm7,ymm6,ymm1\n"
    var z0 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ z0, y0, x0 ] });
    
    // z = z + e * 0.693359375
    //"vfmadd231pd ymm7,ymm2,[rax+448]\n"
    this.instructions.push({ code: 'vfmadd231pd', ops: [ z0, newExp, this.getConstant(0.693359375) ] });

    
    // check for x <= 0
    //"vxorpd ymm15,ymm15,ymm15\n"
    var zero = this.createRegister();
    this.instructions.push({ code: 'vxorpd', ops: [ zero, zero, zero ] });
    //"vcmppd ymm14,ymm0,ymm15,18\n"
    var maskLe0 = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ maskLe0, arg, zero ] });
    //"vblendvpd ymm7,ymm7,[rax+896],ymm14\n" // NaN
    var tmp12 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ tmp12, z0, this.getConstant(NaN), maskLe0 ] });
    //"vpcmpeqd ymm14,ymm0,ymm15\n"
    var maskEq0 = this.createRegister();
    this.instructions.push({ code: 'vpcmpeqd', ops: [ maskEq0, arg, zero ] });
    //"vblendvpd ymm7,ymm7,[rax+928],ymm14\n" // -Inf
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
    // vminpd ymm0,ymm0,[rax]\n" // EXPHI_DOUBLE_PD
    var tmp1 = this.createRegister();
    // vmaxpd ymm0,ymm0,[rax+32]\n" // EXPLO_DOUBLE_PD
    var argLim = this.createRegister();
    this.instructions.push({ code: 'vmaxpd', ops: [ argLim, tmp1, this.getConstant(-709.78288357821549920801706215) ] });

    // express exp(x) as exp(g + n*log(2))
    //"vmulpd ymm1,ymm0,[rax+64]\n"
    var tmp2 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ tmp2, argLim, this.getConstant(1.44269504088896341 /* log2(e) */) ] });
    //"vaddpd ymm1,ymm1,[rax+96]\n" // 0.5
    var tmp3 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ tmp3, tmp2, this.getConstant(0.5) ] });
    //"vroundpd ymm2,ymm1,1\n" // ymm2=round down toward -inf
    var argRounded = this.createRegister();
    this.instructions({ code: 'vroundpd', ops: [ argRounded, tmp3, 1 ] });
    // ymm2 = n = px

    // x -= px * C1
    //"vfnmadd231pd ymm0,ymm2,[rax+128]\n"
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ argLim, argRounded, this.getConstant(6.93145751953125e-1) ] });
    // x -= px * C2
    //"vfnmadd231pd ymm0,ymm2,[rax+160]\n"
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ argLim, argRounded, this.getConstant(1.42860682030941723212e-6) ] });

    // rational approximation for exponential of the fractional part:
    // e^x = 1 + 2x P(x^2) / (Q(x^2) - P(x^2))

    // xx <- x * x;
    //"vmulpd ymm3,ymm0,ymm0\n"
    var xx = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ xx, argLim, argLim ] });
    // px <- x * polevl(xx, P, 2)
    //"vmovapd ymm15,[rax+192]\n"
    var p = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ p, this.getConstant(1.26177193074810590878e-4) ] });
    // "vfmadd213pd ymm15,ymm3,[rax+224]\n" // P1
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, xx, this.getConstant(3.02994407707441961300e-2) ] });
    //"vfmadd213pd ymm15,ymm3,[rax+256]\n" // P2
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, xx, this.getConstant(9.99999999999999999910e-1) ] });
    //"vmulpd ymm4,ymm15,ymm0\n"
    var px = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ px, p, argLim ] });

    // x <- px / (polevl(xx, Q, 3) - px)
    //"vmovapd ymm15,[rax+288]\n"
    var q = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ q, this.getConstant(3.00198505138664455042e-6) ] });
    //"vfmadd213pd ymm15,ymm3,[rax+320]\n" // Q1
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, xx, this.getConstant(2.52448340349684104192e-3) ] });
    //"vfmadd213pd ymm15,ymm3,[rax+352]\n" // Q2
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, xx, this.getConstant(2.27265548208155028766e-1) ] });
    //"vfmadd213pd ymm15,ymm3,[rax+384]\n" // Q3
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, xx, this.getConstant(2.00000000000000000009e0) ] });
    //"vsubpd ymm15,ymm15,ymm4\n"
    var tmp4 = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ tmp4, q, px ] });
    //"vdivpd ymm5,ymm4,ymm15\n"
    var x = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ x, px, tmp4 ] });

    // x <- 1 + 2x;
    //"vaddpd ymm5,ymm5,ymm5\n"
    var twoX = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ twoX, x, x ] });
    //"vaddpd ymm5,ymm5,[rax+416]\n"
    var twoXp1 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ twoXp1, twoX, this.getConstant(1) ] });

    /* multiply by power of 2 */
    // x <- x * 2^n
    //"vcvttpd2dq xmm2,ymm2\n"
    this.instructions.push({ code: 'vcvttpd2dq', ops: [ argRounded, argRounded ] });
    //"vpmovzxdq ymm2,xmm2\n"
    this.instructions.push({ code: 'vpmovzxdq', ops: [ argRounded, argRounded ] });
    //"vpaddd ymm2,ymm2,[rax+448]\n"
    var tmp5 = this.createRegister();
    this.instructions.push({ code: 'vpaddd', ops: [ tmp5, argRounded, this.getBitConstant(1023, 64) ] });
    //"vpsllq ymm2,ymm2,52\n"
    var tmp6 = this.createRegister();
    this.instructions.push({ code: 'vpsllq', ops: [ tmp6, tmp5, 52 ] });
    //"vmulpd ymm2,ymm5,ymm2\n"
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
    var extX = this.createRegister();
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ extX, y1, this.getConstant(7.85398125648498535156e-1) ] });
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ extX, y1, this.getConstant(3.77489470793079817668e-8) ] });
    this.instructions.push({ code: 'vfnmadd231pd', ops: [ extX, y1, this.getConstant(2.69515142907905952645e-15) ] });

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
    this.instructions.push({ code: 'vmulpd', ops: [ z, extX, extX ] });

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
    this.instructions.push({ code: 'vmulpd', ops: [ p2, p1, extX ] });
    var p = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ p, p2, extX ] });

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
    //"vxorpd ymm15,ymm15,ymm15\n"
    var zero = this.createRegister();
    this.instructions.push({ code: 'vxorpd', ops: [ zero, zero, zero ] });
    //"vpcmpeqd ymm9,ymm0,ymm15\n" // ymm9 = mask(x==0)
    var xEqZeroMask = this.createRegister();
    this.instructions.push({ code: 'vpcmpeqd', ops: [ xEqZeroMask, x, zero ] });
    
    // angle selection depending on signs of x, y
    // c = (pi + (y<0 ? -2pi : 0)) & (x<0)
    //"vcmppd ymm11,ymm1,ymm15,17\n" // y < 0?
    var yLtZeroMask = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ yLtZeroMask, y, zero, 17 ] });
    //"vandpd ymm11,ymm11,[rax+512]\n"
    var m2PiMasked = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ m2PiMasked, yLtZeroMask, this.getConstant(-2 * Math.PI) ] });
    // "vaddpd ymm11,ymm11,[rax+544]\n"
    var m2PiPlusPiMasked = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ m2PiPlusPiMasked, m2PiMasked, this.getConstant(Math.PI) ] });
    //"vcmppd ymm10,ymm0,ymm15,17\n" // x < 0?
    var xLtZeroMask = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ xLtZeroMask, x, zero, 17 ] });
    //"vandpd ymm11,ymm11,ymm10\n" // ymm11 = c
    var c = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ c, m2PiPlusPiMasked, xLtZeroMask ] });

    //"vdivpd ymm0,ymm1,ymm0\n" // x <- y/x
    var z = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ z, y, x ] });
    //"vmovapd ymm2,[rax]\n" // sign_mask
    var signMask = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ signMask, this.getBitConstant(0x8000000000000000, 64) ] });
    //"vandpd ymm1,ymm0,ymm2\n" // ymm1 = sign_mask; save sign bit
    var signBit = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ signBit, x, signMask ] });
    //"vandnpd ymm0,ymm2,ymm0\n" // ymm0 = abs(x)
    var absX = this.createRegister();
    this.instructions.push({ code: 'vandnpd', ops: [ absX, signMask, x ] });
    
    // x > 2.41421356237309504880 /* tan(3pi/8)*/
    //"vmovapd ymm15,[rax+32]\n"
    var tan3Pi8 = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ tan3Pi8, this.getConstant(Math.tan(3 * Math.PI / 8)) ] });
    //"vcmppd ymm3,ymm0,ymm15,30\n" // M1
    var mask1 = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ mask1, absX, tan3Pi8, 30 ] });
    
    // x <= 0.66
    // "vcmppd ymm4,ymm0,[rax+64],30\n" // !M2
    var notMask2 = this.createRegister();
    this.instructions.push({ code: 'vcmppd', ops: [ notMask2, absX, this.getConstant(0.66), 30 ] });
    
    // M1 | !M2
    //"vorpd ymm5,ymm3,ymm4\n"
    var mask1OrNotMask2 = this.createRegister();
    this.instructions.push({ code: 'vorpd', ops: [ mask1OrNotMask2, mask1, notMask2 ] });
    
    // x = blend(M1, -1/x, blend(!M2, (x-1)/(x+1), x))
    //"vmovapd ymm15,[rax+160]\n" // -1
    var mOne = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ mOne, this.getConstant(-1) ] });
    //"vaddpd ymm6,ymm0,ymm15\n" // x-1
    var xm1 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ xm1, absX, mOne ] });
    //"vsubpd ymm7,ymm0,ymm15\n" // x+1
    var xp1 = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ xp1, absX, mOne ] });
    //"vdivpd ymm6,ymm6,ymm7\n" // (x-1)/(x+1)
    var xm1Byxp1 = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [xm1Byxp1, xm1, xp1 ] });
    //"vblendvpd ymm6,ymm0,ymm6,ymm4\n"
    var tmp1 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ tmp1, absX, xm1Byxp1, notMask2 ] });
    //"vdivpd ymm7,ymm15,ymm0\n"  // -1/x
    var m1Byx = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ m1Byx, mOne, absX ] });
    //"vblendvpd ymm0,ymm6,ymm7,ymm3\n"
    // ymm0 = x
    var x0 = this.createRegister();
    this.instructions.push({ code: 'vblendvpd', ops: [ x0, tmp1, m1Byx, mask1 ] });
    
    // y=0; y += (M1 | !M2) & (M_PI/4); y += M1 & (M_PI/4)
    //"vmovapd ymm14,[rax+96]\n"
    var piBy4 = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ piBy4, this.getConstant(Math.PI / 4) ] });
    //"vandpd ymm15,ymm14,ymm5\n" // ymm15 = pi/4 & (M1 | !M2)
    var tmp2 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp2, piBy4, mask1OrNotMask2 ] });
    //"vandpd ymm6,ymm14,ymm3\n" // ymm6 = pi/4 & M1
    var tmp3 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp3, piBy4, mask1 ] });
    //"vaddpd ymm6,ymm6,ymm15\n" // y = ymm15 + ymm6
    var y = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ y, tmp2, tmp3 ] });
    
    // m=0; m += (M1 | !M2) & (0.5 * 6.123233995736765886130E-17); m += M1 & (0.5 * 6.123233995736765886130E-17);
    //"vmovapd ymm14,[rax+128]\n"
    var a = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ a, this.getConstant(0.5 * 6.123233995736765886130e-17) ] });
    //"vandpd ymm15,ymm14,ymm5\n"
    var tmp4 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp4, a, mask1OrNotMask2 ] });
    //"vandpd ymm7,ymm14,ymm3\n"
    var tmp5 = this.createRegister();
    this.instructions.push({ code: 'vandpd', ops: [ tmp5, a, mask1 ] });
    //"vaddpd ymm7,ymm7,ymm15\n"
    var m = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ m, tmp4, tmp5 ] });
    // ymm7 = m
    
    // z = x * x
    //"vmulpd ymm8, ymm0, ymm0\n"
    var z = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ z, x, x ] });

    // polevl( z, P, 4 )
    //"vmovapd ymm15,[rax+192]\n" // P0
    var p = this.createRegister();
    this.instructions.push({ code: 'vmovapd', ops: [ p, this.getConstant(-8.750608600031904122785e-1) ] });
    //"vfmadd213pd ymm15,ymm8,[rax+224]\n" // P1
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, z, this.getConstant(-1.615753718733365076637e1) ] });
    //"vfmadd213pd ymm15,ymm8,[rax+256]\n" // P2
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, z, this.getConstant(-7.500855792314704667340e1) ] });
    //"vfmadd213pd ymm15,ymm8,[rax+288]\n" // P3
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, z, this.getConstant(-1.228866684490136173410e2) ] });
    //"vfmadd213pd ymm15,ymm8,[rax+320]\n" // P4
    this.instructions.push({ code: 'vfmadd213pd', ops: [ p, z, this.getConstant(-6.485021904942025371773e1) ] });

    // p1evl( z, Q, 5 )
    //"vaddpd ymm13,ymm8,[rax+352]\n" // Q0
    var q = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ q, z, this.getConstant(2.485846490142306297962e1) ] });
    //"vfmadd213pd ymm13,ymm8,[rax+384]\n" // Q1
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, z, this.getConstant(1.650270098316988542046e2) ] });
    //"vfmadd213pd ymm13,ymm8,[rax+416]\n" // Q2
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, z, this.getConstant(4.328810604912902668951e2) ] });
    //"vfmadd213pd ymm13,ymm8,[rax+448]\n" // Q3
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, z, this.getConstant(4.853903996359136964868e2) ] });
    //"vfmadd213pd ymm13,ymm8,[rax+480]\n" // Q4
    this.instructions.push({ code: 'vfmadd213pd', ops: [ q, z, this.getConstant(1.945506571482613964425e2) ] });

    // z = z * polevl( z, P, 4 ) / p1evl( z, Q, 5 )
    //"vdivpd ymm15,ymm15,ymm13\n"
    var pByQ = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ pByQ, p, q ] });
    //"vmulpd ymm8,ymm8,ymm15\n"
    var z0 = this.createRegister();
    this.instructions.push({ code: 'vmulpd', ops: [ z0, z, pByQ ] });

    // z = x * z + x;
    //"vfmadd213pd ymm8,ymm0,ymm0\n"
    this.instructions.push({ code: 'vfmadd213pd', ops: [ z0, absX, absX ] });

    // z += m
    //"vaddpd ymm8,ymm8,ymm7\n"
    var z1 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ z1, z0, m ] });

    // y = y + z
    //"vaddpd ymm6,ymm6,ymm8\n"
    var y0 = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ y0, y, z1 ] });

    // if (sign < 0) y = -y
    //"vxorpd ymm6,ymm6,ymm1\n"
    var y1 = this.createRegister();
    this.instructions.push({ code: 'vxorpd', ops: [ y1, y0, signBit ] });

    // y = y + c
    // "vaddpd ymm6,ymm6,ymm11\n"
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
    this.instructions.push({ code: 'vmulpd', ops: [ halfExp, exp, half ] });

    var halfExpNeg = this.createRegister();
    this.instructions.push({ code: 'vdivpd', ops: [ expNeg, half, exp ] });

    var sinh = this.createRegister();
    this.instructions.push({ code: 'vsubpd', ops: [ sinh, halfExp, halfExp ] });

    var cosh = this.createRegister();
    this.instructions.push({ code: 'vaddpd', ops: [ cosh, halfExp, halfExp ] });

    return {
        sinh: sinh,
        cosh: cosh
    };
};
