function MandelbrotCodeGenerator(expr)
{
	CodeGenerator.call(this, expr);
}

MandelbrotCodeGenerator.prototype = new CodeGenerator();


MandelbrotCodeGenerator.prototype.generate = function(expr)
{
	// registers:

	// - initialized by caller:
	// https://en.wikipedia.org/wiki/X86_calling_conventions#x86-64_calling_conventions
	// (Unix / Windows)
	// %rdi / %rcx: pointer to constants
	// %rsi / %rdx: pointer to results
	// %rdx / %r8: width/4 (xmax)
	// %rcx / %r9: height (ymax and y-counter)
	// %r8 / stack: maxIter

	// - internal usage:
	// %rax: iteration count (counts down from maxIter to 0)
	// %rbx: comparison mask
	// %r10: current escape count
	// %r11: x-counter
	// %r14, %r15: temporary

	// constants:
	// 0x00: xmin
	// 0x20: ymin
	// 0x40: 4*dx
	// 0x60: dy
	// 0x80: radius

	/*
	  ; Windows: move argument registers to the ones used by Unix:
	  pop rax
	  push rdi
	  push rsi
	  mov rdi,rcx
	  mov rsi,rdx
	  mov rdx,r8
	  mov rcx,r9
	  mov r8,rax

	  ; save registers
	  push rbx
	  push r14
	  push r15

      ; c <- (Re(c), Im(c0))
      vmovapd ymm3, ymmword ptr [rdi+0x20]

	NEXT_Y:
	  ; c <- (Re(c0), Im(c))
	  vmovapd ymm2, ymmword ptr [rdi]

	  ; xCounter <- xmax
	  mov r11, rdx

	NEXT_X:
	  ; z <- 0
	  vxorpd ymm0, ymm0, ymm0
	  vxorpd ymm1, ymm1, ymm1

	  ; iterCount <- maxIter
	  mov rax, r8

	  ; iters <- 0
	  xor r10, r10
	  xor rbx, rbx
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

		// compare abs <= radius; move to mask (in %rbx)
		var cmp = this.createRegister();
		this.instructions.push({ code: 'vcmppd', ops: [ cmp, abs, this.constRadius, 17 /* LT_OQ */ ] });
		this.instructions.push({ code: 'vmovmskpd', ops: [ { type: 'gpr', id: 3 /* %rbx */ }, cmp ] });

		/*
		  ; test if all orbits have escaped
		  or rbx, rbx
		  jz EXIT

		  ; %rbx contains the test results (bits 0:3): abcd
		  ; in %r15, create the bits spaced apart so %r15 can be used to increment the counter,
		  ; 00..00a 00..00b 00..00c 00..00d
		  mov r15, rbx
		  shl rbx, 15
		  or r15, rbx
		  shl rbx, 15
		  or r15, rbx
		  shl rbx, 15
		  or r15, rbx
		  mov rbx, 0x0001000100010001
		  and r15, rbx

		  ; increment the counter
		  add r10, r15

		  ; decrement the iteration count and go to the next iteration
		  dec rax
		  jnz NEXT_ITER

		EXIT:
		  ; convert the iteration count to base 128 (to be used in JavaScript strings)
		  mov r14, r10
		  shl r14, 1
		  mov rbx, 0x007f007f007f007f
		  and r10, rbx
		  shl rbx, 8
		  and r14, rbx
		  or r10, r14
		  mov [rsi], r10
		  add rsi, 8

		  ; next x
		  vaddpd ymm2, ymm2, ymmword ptr [rdi+0x40]
		  dec r11
		  jnz NEXT_X

		  ; next y
		  vaddpd ymm3, ymm3, ymmword ptr [rdi+0x60]
		  dec rcx
		  jnz NEXT_Y

		  ; restore registers
		  pop r15
		  pop r14
		  pop rbx
		  pop rsi ; Windows
		  pop rdi ; Windows

		  ret
		*/
	}

	return ret;
};
