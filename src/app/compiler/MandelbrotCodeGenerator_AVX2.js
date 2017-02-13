function MandelbrotCodeGenerator()
{
}

MandelbrotCodeGenerator.prototype = new CodeGenerator();


MandelbrotCodeGenerator.prototype.generate = function(expr)
{
	// registers:
	// %rax: pointer to constants
	// %rcx: iteration count (counts down from maxIter to 0)
	// %rdx: comparison mask
	// %rbx: pointer to result array
	// %r9: current escape count
	// %r10: xmax
	// %r11: x-counter
	// %r12: y-counter
	// %r13: maxIter

	// constants:
	// 0x00: xmin
	// 0x20: ymin
	// 0x40: 4*dx
	// 0x60: dy
	// 0x80: radius

	/*
	  ; initialization (before calling the generated code)
	  ; * init %rax with the pointer to the constants
	  ; * init %rbx with the pointer to the result
	  ; * init %r10 with xmax (ceil(0.25 * number of points) in x-direction to compute)
	  ; * init %r12 with ymax
	  ; * init %r13 with maxIter
	*/

	/*
      ; c <- (Re(c), Im(c0))
      vmovapd ymm3, ymmword ptr [rax+0x20]

	NEXT_Y:
	  ; c <- (Re(c0), Im(c))
	  vmovapd ymm2, ymmword ptr [rax]

	  ; xCounter <- xmax
	  mov r11, r10

	NEXT_X:
	  ; z <- 0
	  vxorpd ymm0, ymm0, ymm0
	  vxorpd ymm1, ymm1, ymm1

	  ; iterCount <- maxIter
	  mov rcx, r13

	  ; iters <- 0
	  xor r9, r9
	  xor rdx, rdx
	NEXT_ITER:
	*/

	var ret = CodeGenerator.prototype.generate.call(this, expr);

	// end: process the result
	if (!expr)
	{
		// move the result to ymm0/ymm1
		if (!this.replaceRegister(ret.re, this.variables.x))
			this.instructions.push({ code: 'vmovapd', ops: [ this.variables.x, ret.re ] });
		if (!this.replaceRegister(ret.im, this.variables.y))
			this.instructions.push({ code: 'vmovapd', ops: [ this.variables.y, ret.im ] });

		// compute abs(z)^2
		var abs = this.createRegister();
		this.instructions.push({ code: 'vmulpd', ops: [ abs, this.variables.x, this.variables.x ] });
		this.instructions.push({ code: 'vfmadd231pd', ops: [ abs, this.variables.y, this.variables.y ] });

		// compare abs <= radius; move to mask (in %rdx)
		var cmp = this.createRegister();
		this.instructions.push({ code: 'vcmppd', ops: [ cmp, abs, this.constRadius, 17 /* LT_OQ */ ] });
		this.instructions.push({ code: 'vmovmskpd', ops: [ { type: 'gpr', id: 2 /* %rdx */ }, cmp ] });

		/*
		  ; test if all orbits have escaped
		  or rdx, rdx
		  jz EXIT

		  ; %rdx contains the test results (bits 0:3): abcd
		  ; in %r8, create the bits spaced apart so %r8 can be used to increment the counter,
		  ; 00..00a 00..00b 00..00c 00..00d
		  mov r8, rdx
		  shl rdx, 15
		  or r8, rdx
		  shl rdx, 15
		  or r8, rdx
		  shl rdx, 15
		  or r8, rdx
		  mov rdx, 0x0001000100010001
		  and r8, rdx

		  ; increment the counter
		  add r9, r8

		  ; decrement the iteration count and go to the next iteration
		  dec rcx
		  jnz NEXT_ITER

		EXIT:
		  ; convert the iteration count to base 128 (to be used in JavaScript strings)
		  mov r14, r9
		  shl r14, 1
		  mov rdx, 0x007f007f007f007f
		  and r9, rdx
		  shl rdx, 8
		  and r14, rdx
		  or r9, r14
		  mov [rbx], r9
		  add rbx, 8

		  ; next x
		  vaddpd ymm2, ymm2, ymmword ptr [rax+0x40]
		  dec r11
		  jnz NEXT_X

		  ; next y
		  vaddpd ymm3, ymmword ptr [rax+0x60]
		  dec r12
		  jnz NEXT_Y
		  ret
		*/
	}

	return ret;
};
