function MandelbrotCodeGenerator(expr, options)
{
	return CodeGenerator.call(this, expr, options);
}

MandelbrotCodeGenerator.prototype = new CodeGenerator();


MandelbrotCodeGenerator.prototype.generate = function(expr)
{
	// create the computation of the inner-most loop
	var ret = CodeGenerator.prototype.generate.call(this, expr);

	// end: process the result
	if (!expr)
	{
		// move the result (x,y) to ymm0/ymm1
		if (!this.replaceRegister(this.variables.xnew, this.variables.x))
			this.instructions.push({ code: 'vmovapd', ops: [ this.variables.x, this.variables.xnew ] });
		if (!this.replaceRegister(this.variables.ynew, this.variables.y))
			this.instructions.push({ code: 'vmovapd', ops: [ this.variables.y, this.variables.ynew ] });

		// move (dx,dy) to ymm4/ymm5
		if (this.options && this.options.computeDerivatives)
		{
			if (!this.replaceRegister(this.variables.dxnew, this.variables.dx))
				this.instructions.push({ code: 'vmovapd', ops: [ this.variables.dx, this.variables.dxnew ] });
			if (!this.replaceRegister(this.variables.dynew, this.variables.dy))
				this.instructions.push({ code: 'vmovapd', ops: [ this.variables.dy, this.variables.dynew ] });
		}

		// compute abs(z)^2
		var abs = this.createRegister();
		this.instructions.push({ code: 'vmulpd', ops: [ abs, this.variables.x, this.variables.x ] });
		this.instructions.push({ code: 'vfmadd231pd', ops: [ abs, this.variables.y, this.variables.y ] });

		// compare abs <= radius; move to mask (in %rbx)
		var cmp = this.createRegister();
		this.instructions.push({ code: 'vcmppd', ops: [ cmp, abs, this.constRadius, 17 /* LT_OQ */ ] });
		this.instructions.push({ code: 'vmovmskpd', ops: [ { type: 'gpr', id: 3 /* %rbx */ }, cmp ] });
	}

	return ret;
};
