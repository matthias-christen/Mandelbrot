function CodeGenerator(expr, options)
{
	this.expr = expr;
	this.options = options;

	this.instructions = [];

	this.currentRegIdx = 0;

	this.constants = [];
	this.floatConstants = new Map();
	this.intConstants = new Map();

	this.constReCMin = this.getConstant();
	this.constImCMin = this.getConstant();
	this.constDx = this.getConstant();
	this.constDy = this.getConstant();
	this.constRadius = this.getConstant();

	this.variables = {
		// z = x + iy
		x: this.createRegister(),
		y: this.createRegister(),

		// c = u + iv
		u: this.createRegister(),
		v: this.createRegister(),

		// dz = dx + idy
		dx: this.createRegister(),
		dy: this.createRegister()
	};
}

CodeGenerator.prototype = new Generator();


var Op = CodeGenerator.Op = {
	READ: 1,
	WRITE: 2
};

CodeGenerator.mnemonics = {
	vaddpd: [ Op.WRITE, Op.READ, Op.READ ],
	vaddsubpd: [ Op.WRITE, Op.READ, Op.READ ],
	vandnpd: [ Op.WRITE, Op.READ, Op.READ ],
	vandpd: [ Op.WRITE, Op.READ, Op.READ ],
	vblendpd: [ Op.WRITE, Op.READ, Op.READ, Op.READ ],
	vblendvpd: [ Op.WRITE, Op.READ, Op.READ, Op.READ ],
	vbroadcastf128: [ Op.WRITE, Op.READ ],
	vbroadcasti128: [ Op.WRITE, Op.READ ],
	vcmppd: [ Op.WRITE, Op.READ, Op.READ, Op.READ ],
	vpcmpeqd: [ Op.WRITE, Op.READ, Op.READ ],
	vcvtdq2pd: [ Op.WRITE, Op.READ ],
	vcvttpd2dq: [ Op.WRITE, Op.READ ],
	vdivpd: [ Op.WRITE, Op.READ, Op.READ ],
	vfmadd132pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfmadd213pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfmadd231pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfmaddsub132pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfmaddsub231pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfmsub132pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfmsub213pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfmsub231pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfmsubadd132pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfmsubadd213pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfmsubadd231pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfnmadd132pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfnmadd213pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfnmadd231pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfnmsub132pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfnmsub213pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vfnmsub231pd: [ Op.READ | Op.WRITE, Op.READ, Op.READ ],
	vhaddpd: [ Op.WRITE, Op.READ, Op.READ ],
	vmaxpd: [ Op.WRITE, Op.READ, Op.READ ],
	vminpd: [ Op.WRITE, Op.READ, Op.READ ],
	vmovapd: [ Op.WRITE, Op.READ ],
	vmovmskpd: [ Op.WRITE, Op.READ ],
	vmulpd: [ Op.WRITE, Op.READ, Op.READ ],
	vorpd: [ Op.WRITE, Op.READ, Op.READ ],
	vpaddd: [ Op.WRITE, Op.READ, Op.READ ],
	vpaddq: [ Op.WRITE, Op.READ, Op.READ ],
	vpermilpd: [ Op.WRITE, Op.READ, Op.READ ],
	vpermpd: [ Op.WRITE, Op.READ, Op.READ ],
	vpmovsxdq: [ Op.WRITE, Op.READ ],
	vpmovzxdq: [ Op.WRITE, Op.READ ],
	vpslld: [ Op.WRITE, Op.READ, Op.READ ],
	vpsllq: [ Op.WRITE, Op.READ, Op.READ ],
	vpsrld: [ Op.WRITE, Op.READ, Op.READ ],
	vpsrlq: [ Op.WRITE, Op.READ, Op.READ ],
	vroundpd: [ Op.WRITE, Op.READ, Op.READ ],
	vshufpd: [ Op.WRITE, Op.READ, Op.READ, Op.READ ],
	vsqrtpd: [ Op.WRITE, Op.READ ],
	vsubpd: [ Op.WRITE, Op.READ, Op.READ ],
	vtestpd: [ Op.WRITE, Op.READ ],
	vunpcklpd: [ Op.WRITE, Op.READ, Op.READ ],
	vxorpd: [ Op.WRITE, Op.READ, Op.READ ]
};


CodeGenerator.prototype.createRegister = function()
{
	return { type: 'register', id: this.currentRegIdx++ };
};

CodeGenerator.prototype.getConstant = function(c)
{
	var id = c === undefined ? undefined : this.floatConstants.get(c);
	if (id === undefined)
	{
		id = this.constants.length;
		this.floatConstants.set(c || 0, id);
		this.constants.push({ type: 'double', value: c });
	}

	return { type: 'constant', id: id };
};

CodeGenerator.prototype.getConstants = function(c1, c2, c3, c4)
{
	var id = this.constants.length;
	this.constants.push({ type: 'double', value: [ c1, c2, c3, c4 ] });
	return { type: 'constant', id: id };
};

CodeGenerator.prototype.getBitConstant = function(hi, lo)
{
	var key = String(hi) + ':' + (lo === undefined ? '' : String(lo));
	var id = this.intConstants.get(key);

	if (id === undefined)
	{
		id = this.constants.length;
		this.intConstants.set(key, id);
		this.constants.push({ type: 'int', value: lo === undefined ? hi : [ hi, lo ] });
	}

	return { type: 'constant', id: id };
};

CodeGenerator.prototype.getMemorySpace = function()
{
	var id = this.constants.length;
	this.constants.push({ type: 'double', value: 0 });
	return { type: 'constant', id: id };
};

CodeGenerator.prototype.replaceRegister = function(toReplace, replaceBy)
{
	if (toReplace.type !== 'register')
		return false;

	for (var i = this.instructions.length - 1; i >= 0; i--)
	{
		var instruction = this.instructions[i];
		var registerModes = CodeGenerator.mnemonics[instruction.code];

		if (!registerModes)
			continue;

		var ops = instruction.ops;
		var len = ops.length;

		for (var j = 0; j < len; j++)
		{
			var op = ops[j];

			if (op.type === 'register' && op.id === toReplace.id)
			{
				if (registerModes[j] === CodeGenerator.Op.WRITE)
				{
					ops[j] = replaceBy;
					return true;					
				}
				else
					return false;
			}
		}
	}

	return false;
};

CodeGenerator.prototype.number = function(expr, re, im)
{
	return {
		re: re !== false ? this.getConstant(expr.re) : expr.re,
		im: im !== false ? this.getConstant(expr.im) : expr.im
	};
};

CodeGenerator.prototype.variable = function(expr)
{
	return {
		re: this.variables[expr.re],
		im: this.variables[expr.im]
	};
};

CodeGenerator.prototype.assignmentList = function(assignments)
{
	var len = assignments.list.length;
	for (var i = 0; i < len; i++)
		this.generate(assignments.list[i]);
};

CodeGenerator.prototype.assignment = function(expr)
{
	var value = this.generate(expr.expr);

	this.variables[expr.target.re] = value.re;
	this.variables[expr.target.im] = value.im;

	return value;
};

CodeGenerator.prototype.unaryExpression = function(expr)
{
	var arg = this.generate(expr.arg);

	if (expr.op !== '-')
		return arg;

	var result = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	// load 0
	this.instructions.push({ code: 'vxorpd', ops: [ result.re, result.re, result.re ] });
	this.instructions.push({ code: 'vxorpd', ops: [ result.im, result.im, result.im ] });

	// subtract the argument
	this.instructions.push({ code: 'vsubpd', ops: [ result.re, result.re, arg.re ] });
	this.instructions.push({ code: 'vsubpd', ops: [ result.im, result.im, arg.im ] });

	return result;
};

CodeGenerator.prototype.generateIfNotNumber = function(expr)
{
	return expr.type === 'number' ? expr : this.generate(expr);
};

CodeGenerator.prototype.binaryExpression = function(expr)
{
	switch (expr.op)
	{
	case '+':
		return this.add(this.generateIfNotNumber(expr.left), this.generateIfNotNumber(expr.right));

	case '-':
		return this.subtract(this.generateIfNotNumber(expr.left), this.generateIfNotNumber(expr.right));

	case '*':
		return this.multiply(this.generateIfNotNumber(expr.left), this.generateIfNotNumber(expr.right));

	case '/':
		return this.divide(this.generateIfNotNumber(expr.left), this.generateIfNotNumber(expr.right));

	case '^int':
		return this.integerPower(this.generateIfNotNumber(expr.left), expr.right);

	case '^':
		return this.exp(this.multiply(
			this.generateIfNotNumber(expr.left),
			expr.right.type === 'number' ? Complex.ln(expr.right) : this.ln(this.generate(expr.right))
		));

	default:
		throw new Error('Unknown operator ' + expr.op);
	}
};

CodeGenerator.prototype.ifZeroExpression = function(expr)
{
	var zero = this.createRegister();
    this.instructions.push({ code: 'vxorpd', ops: [ zero, zero, zero ] });

	var maskRe = this.createRegister();
	var maskIm = this.createRegister();
	var test = this.generate(expr.test);

	this.instructions.push({ code: 'vpcmpeqd', ops: [ maskRe, test.re, zero ] });
	this.instructions.push({ code: 'vpcmpeqd', ops: [ maskIm, test.im, zero ] });

	var mask = this.createRegister();
	this.instructions.push({ code: 'vandpd', ops: [ mask, maskRe, maskIm ] });

	var ret = {
		re: this.createRegister(),
		im: this.createRegister()
	};

	var consequent = this.generateIfNotNumber(expr.consequent);
	var alternate = this.generateIfNotNumber(expr.alternate);

	this.instructions.push({ code: 'vblendvpd', ops: [ ret.re, alternate.re, consequent.re, mask ] });
	this.instructions.push({ code: 'vblendvpd', ops: [ ret.im, alternate.im, consequent.im, mask ] });

	return ret;
};

CodeGenerator.prototype.functionExpression = function(expr)
{
	var f = CodeGenerator.prototype[expr.name];
	if (f)
		return f.call(this, this.generate(expr.arg));

	throw new Error('Unsupported function ' + expr.name);
};

CodeGenerator.instructionToString = function(instruction)
{
	if (!instruction.code)
		return null;

	var ret = instruction.code + ' ';
	var lenOps = instruction.ops.length;

	for (var j = 0; j < lenOps; j++)
	{
		if (j > 0)
			ret += ', ';

		var op = instruction.ops[j];
		if (typeof op === 'object')
			ret += op.type + op.id;
		else
			ret += op;
	}

	return ret;
};

CodeGenerator.prototype.toString = function()
{
	var ret = '';

	var lenConstants = this.constants.length;
	for (var i = 0; i < lenConstants; i++)
	{
		var v = this.constants[i].value || '(undefined)';
		ret += 'constant' + i + ' := (' + (this.constants[i].type || 'double') + ') ' + v.toString() + '\n';
	}

	var lenInstructions = this.instructions.length;
	for (var i = 0; i < lenInstructions; i++)
	{
		var s = CodeGenerator.instructionToString(this.instructions[i]);
		if (s)
			ret += s + '\n';
	}

	return ret;
};

/**
 * asm(".intel_syntax noprefix; vxorpd ymm15,ymm15,ymm15\nvmovupd [rbx],ymm15" : : "a"(a), "b"(r)); printf("ymm15 = %.10f, %.10f, %.10f, %.10f\n", r[0], r[1], r[2], r[3]);
 */
CodeGenerator.prototype.generateDebugCode = function()
{
	var code = '';

	var lenConstants = this.constants.length;
	for (var i = 0; i < lenConstants; i++)
	{
		var c = this.constants[i];

		code += 'addConstant(consts, ' + i + ', ';

		switch (c.type)
		{
		case 'double':
			code += c.value === undefined ? '0.0' : '(double) ' + c.value;
			break;
		case 'int64':
			code += '(uint64_t) ' + c.value + 'ull';
			break;
		case 'int32':
			code += '(uint32_t) ' + c.value;
		}

		code += ');\n';
	}

	var lines = [];
	var lenInstructions = this.instructions.length;

	for (var i = 0; i < lenInstructions; i++)
	{
		var inst = this.instructions[i];
		var line = inst.code + ' ';
		var l = inst.ops.length;
		var regtype = [ 'y', 'y', 'y', 'y' ];

		switch (inst.code)
		{
		case 'vcvttpd2dq':
			regtype[0] = 'x';
			break;
		case 'vpmovsxdq':
		case 'vpmovzxdq':
		case 'vcvttpd2dq':
		case 'vcvtdq2pd':
			regtype[1] = 'x';
			break;
		}

		for (var j = 0; j < l; j++)
		{
			if (j > 0)
				line += ',';
			
			var op = inst.ops[j];
			if (typeof op === 'number')
				line += op;
			else if (op.type === 'register')
				line += regtype[j] + 'mm' + op.id;
			else if (op.type === 'constant')
				line += '[rax+' + (32 * op.id) + ']';
		}

		lines.push(line);
	}

	var len = lines.length;
	for (var i = 0; i < len; i++)
	{
		code += 'asm(".intel_syntax noprefix; ';
		for (var j = 0; j <= i; j++)
			code += lines[j] + '\\n';
		var m = lines[i].match(/([a-z0-9]+) ([xy]mm\d+)/);
		var reg = 'y' + m[2].substr(1);
		code += 'vmovupd [rbx],' + reg + '" : : "a"(a), "b"(r));printf("' + m[1] + ': %.10f, %.10f, %.10f, %.10f\\n", r[0], r[1], r[2], r[3]);\n';
	}

	return code;
};
