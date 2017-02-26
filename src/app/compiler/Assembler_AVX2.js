function Assembler(instructions)
{
	var that = this;

	this.instructions = instructions;
	this.code = [];
	this.labels = new Map();

	// types
	var T_0F = Assembler.AVXtype.T_0F;
	var T_66 = Assembler.AVXtype.T_66;
	var T_F3 = Assembler.AVXtype.T_F3;
	var T_F2 = Assembler.AVXtype.T_F2;
	var T_0F = Assembler.AVXtype.T_0F;
	var T_0F38 = Assembler.AVXtype.T_0F38;
	var T_0F3A = Assembler.AVXtype.T_0F3A;
	var T_L0 = Assembler.AVXtype.T_L0;
	var T_L1 = Assembler.AVXtype.T_L1;
	var T_W0 = Assembler.AVXtype.T_W0;
	var T_W1 = Assembler.AVXtype.T_W1;
	var T_EW0 = Assembler.AVXtype.T_EW0;
	var T_EW1 = Assembler.AVXtype.T_EW1;
	var T_YMM = Assembler.AVXtype.T_YMM;
	var T_EVEX = Assembler.AVXtype.T_EVEX;
	var T_ER_X = Assembler.AVXtype.T_ER_X;
	var T_ER_Y = Assembler.AVXtype.T_ER_Y;
	var T_ER_Z = Assembler.AVXtype.T_ER_Z;
	var T_SAE_X = Assembler.AVXtype.T_SAE_X;
	var T_SAE_Y = Assembler.AVXtype.T_SAE_Y;
	var T_SAE_Z = Assembler.AVXtype.T_SAE_Z;
	var T_MUST_EVEX = Assembler.AVXtype.T_MUST_EVEX;
	var T_B32 = Assembler.AVXtype.T_B32;
	var T_B64 = Assembler.AVXtype.T_B64;
	var T_M_K = Assembler.AVXtype.T_M_K;
	var T_N1 = Assembler.AVXtype.T_N1;
	var T_N2 = Assembler.AVXtype.T_N2;
	var T_N4 = Assembler.AVXtype.T_N4;
	var T_N8 = Assembler.AVXtype.T_N8;
	var T_N16 = Assembler.AVXtype.T_N16;
	var T_N32 = Assembler.AVXtype.T_N32;
	var T_N_VL = Assembler.AVXtype.T_N_VL;
	var T_DUP = Assembler.AVXtype.T_DUP;

	var YMM0 = { type: 'register', id: 0 };
	var YMM2 = { type: 'register', id: 2 };
	var YMM6 = { type: 'register', id: 6 };

	this.mnemonics = {
		vaddpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0x58); },
		vaddsubpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_66 | T_0F | T_YMM, 0xD0); },
		vandnpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0x55); },
		vandpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0x54); },
		vblendpd: function(x1, x2, op, imm) { that.opVex(x1, x2, op, T_66 | T_0F3A | T_W0 | T_YMM, 0x0D, imm); },
		vblendvpd: function(x1, x2, op, x4) { that.opVex(x1, x2, op, T_0F3A | T_66 | T_YMM, 0x4B, x4.id << 4); },
		vbroadcastf128: function(y, addr) { that.opVex(y, addr, T_0F38 | T_66 | T_W0 | T_YMM, 0x1A); },
		vbroadcasti128: function(y, addr) { that.opVex(y, addr, T_0F38 | T_66 | T_W0 | T_YMM, 0x5A); },
		vcmppd: function(x1, x2, op, imm) { that.opVex(x1, x2, op, T_66 | T_0F | T_YMM, 0xC2, imm); },
		vpcmpeqd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F | T_YMM, 0x76); },
		vcvtdq2pd: function(x, op) { that.opVex(x, null, op, T_0F | T_F3 | T_YMM | T_EVEX | T_EW0 | T_B32 | T_N8 | T_N_VL, 0xE6); },
		vcvttpd2dq: function(x, op) { that.opVex(x, YMM0, op, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0xE6); },
		vdivpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0x5E); },
		vfmadd132pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0x98); },
		vfmadd213pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0xA8); },
		vfmadd231pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0xB8); },
		vfmaddsub132pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0x96); },
		vfmaddsub231pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0xB6); },
		vfmsub132pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0x9A); },
		vfmsub213pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0xAA); },
		vfmsub231pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0xBA); },
		vfmsubadd132pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0x97); },
		vfmsubadd213pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0xA7); },
		vfmsubadd231pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0xB7); },
		vfnmadd132pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0x9C); },
		vfnmadd213pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0xAC); },
		vfnmadd231pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0xBC); },
		vfnmsub132pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0x9E); },
		vfnmsub213pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0xAE); },
		vfnmsub231pd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F38 | T_W1 | T_EW1 | T_YMM | T_EVEX | T_B64, 0xBE); },
		vhaddpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_66 | T_0F | T_YMM, 0x7C); },
		vmaxpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0x5F); },
		vminpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0x5D); },
		vmovapd: function(xmm, op) { that.opVex(xmm, YMM0, op, T_66 | T_0F | T_EW1 | T_YMM | T_EVEX, 0x28); },
		vmovmskpd: function(r, x) { that.opVex(r, YMM0, x, T_0F | T_66 | T_W0 | T_YMM, 0x50); },
		vmulpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0x59); },
		vorpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0x56); },
		vpaddd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F | T_EW0 | T_YMM | T_EVEX | T_B32, 0xFE); },
		vpaddq: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F | T_EW1 | T_YMM | T_EVEX | T_B64, 0xD4); },
		vpermilpd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_66 | T_0F38 | T_W0 | T_EW1 | T_YMM | T_EVEX | T_B64, 0x0D); },
		vpermpd: function(y, op, imm) { that.opVex(y, YMM0, op, T_66 | T_0F38 | T_W0 | T_EW1 | T_YMM | T_EVEX | T_B64, 0x01, imm); },
		vpmovsxdq: function(xm, op) { that.opVex(xm, YMM0, op, T_66 | T_0F38 | T_EW0 | T_YMM | T_EVEX | T_N8 | T_N_VL, 0x25); },
		vpmovzxdq: function(xm, op) { that.opVex(xm, YMM0, op, T_66 | T_0F38 | T_EW0 | T_YMM | T_EVEX | T_N8 | T_N_VL, 0x35); },
		vpslld: function(x, op, imm) { that.opVex(YMM6, x, op, T_66 | T_0F | T_EW0 | T_YMM | T_EVEX | T_B32, 0x72, imm); },
		vpsllq: function(x, op, imm) { that.opVex(YMM6, x, op, T_66 | T_0F | T_EW1 | T_YMM | T_EVEX | T_B64, 0x73, imm); },
		vpsrld: function(x, op, imm) { that.opVex(YMM2, x, op, T_66 | T_0F | T_EW0 | T_YMM | T_EVEX | T_B32, 0x72, imm); },
		vpsrlq: function(x, op, imm) { that.opVex(YMM2, x, op, T_66 | T_0F | T_EW1 | T_YMM | T_EVEX | T_B64, 0x73, imm); },
		vroundpd: function(xm, op, imm) { that.opVex(xm, YMM0, op, T_0F3A | T_66 | T_YMM, 0x09, imm); },
		vshufpd: function(x1, x2, op, imm) { that.opVex(x1, x2, op, T_66 | T_0F | T_EW1 | T_YMM | T_EVEX | T_B64, 0xC6, imm); },
		vsqrtpd: function(xm, op) { that.opVex(xm, YMM0, op, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0x51); },
		vsubpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0x5C); },
		vtestpd: function(xm, op) { that.opVex(xm, YMM0, op, T_66 | T_0F38 | T_YMM, 0x0F); },
		vunpcklpd: function(x1, x2, op) { that.opVex(x1, x2, op, T_66 | T_0F | T_EW1 | T_YMM | T_EVEX | T_B64, 0x14); },
		vxorpd: function(xmm, op1, op2) { that.opVex(xmm, op1, op2, T_0F | T_66 | T_EW1 | T_YMM | T_EVEX | T_ER_Z | T_B64, 0x57); }
	};
}

Assembler.prototype.run = function()
{
	// assemble the instructions
	for (var instr of this.instructions)
	{
		var f = this.mnemonics[instr.code];
		if (f)
			f.apply(this, instr.ops);
		else
			throw new Error('Unknown mnemonic: ' + instr.code);
	}
};

Assembler.prototype.addLabel = function(label)
{
	var idx = 0;
	var len = this.code.length;

	for (var i = 0; i < len; i++)
	{
		var c = this.code[i];
		idx += (typeof c === 'object' && c.type === 'label') ? 4 : 1;
	}

	this.labels.set(label, idx);
};

Assembler.prototype.getLabelRef = function(label)
{
	return { type: 'label', ref: label };
};

Assembler.prototype.resolveLabels = function()
{
	var len = this.code.length;
	for (var i = 0; i < len; i++)
	{
		var c = this.code[i];
		if (typeof c === 'object' && c.type === 'label')
		{
			if (!this.labels.has(c.ref))
				throw new Error('The label ' + c.ref + ' is not defined.');

			var delta = (this.labels.get(c.ref) - i - 4) | 0;
			this.code.splice(i, 1, delta & 0xff, (delta >> 8) & 0xff, (delta >> 16) & 0xff, (delta >> 24) & 0xff);

			i += 3;
			len += 3;
		}
	}
};


// https://github.com/herumi/xbyak

Assembler.AVXtype = {
	T_66: 1 << 0,
	T_F3: 1 << 1,
	T_F2: 1 << 2,
	T_0F: 1 << 3,
	T_0F38: 1 << 4,
	T_0F3A: 1 << 5,
	T_L0: 1 << 6,
	T_L1: 1 << 7,
	T_W0: 1 << 8,
	T_W1: 1 << 9,
	T_EW0: 1 << 10,
	T_EW1: 1 << 11,
	T_YMM: 1 << 12, // support YMM, ZMM
	T_EVEX: 1 << 13,
	T_ER_X: 1 << 14, // xmm{er}
	T_ER_Y: 1 << 15, // ymm{er}
	T_ER_Z: 1 << 16, // zmm{er}
	T_SAE_X: 1 << 17, // xmm{sae}
	T_SAE_Y: 1 << 18, // ymm{sae}
	T_SAE_Z: 1 << 19, // zmm{sae}
	T_MUST_EVEX: 1 << 20, // contains T_EVEX
	T_B32: 1 << 21, // m32bcst
	T_B64: 1 << 22, // m64bcst
	T_M_K: 1 << 23, // mem{k}
	T_N1: 1 << 24,
	T_N2: 1 << 25,
	T_N4: 1 << 26,
	T_N8: 1 << 27,
	T_N16: 1 << 28,
	T_N32: 1 << 29,
	T_N_VL: 1 << 30, // N * (1, 2, 4) for VL
	T_DUP: 1 << 31 // N = (8, 32, 64)
};

Assembler.prototype.vex = function(reg, base, /* Operand */ v, type, code, x)
{
	var w = (type & Assembler.AVXtype.T_W1) ? 1 : 0;
	var is256 = (type & Assembler.AVXtype.T_L1) ? true : ((type & Assembler.AVXtype.T_L0) ? false : true);
	var r = reg.id >= 8;
	var b = base.id >= 8;
	var idx = v ? v.id : 0;

	if ((idx | reg.id | base.id) >= 16)
		throw new Error('ERR_BAD_COMBINATION');

	var pp = (type & Assembler.AVXtype.T_66) ? 1 : (type & Assembler.AVXtype.T_F3) ? 2 : (type & Assembler.AVXtype.T_F2) ? 3 : 0;
	var vvvv = (((~idx) & 15) << 3) | (is256 ? 4 : 0) | pp;

	if (!b && !x && !w && (type & Assembler.AVXtype.T_0F))
	{
		this.code.push(0xC5);
		this.code.push((r ? 0 : 0x80) | vvvv);
	}
	else
	{
		var mmmm = (type & Assembler.AVXtype.T_0F) ? 1 : (type & Assembler.AVXtype.T_0F38) ? 2 : (type & Assembler.AVXtype.T_0F3A) ? 3 : 0;
		this.code.push(0xC4);
		this.code.push((r ? 0 : 0x80) | (x ? 0 : 0x40) | (b ? 0 : 0x20) | mmmm);
		this.code.push((w << 7) | vvvv);
	}

	this.code.push(code);
}

// reg is reg field of ModRM
Assembler.prototype.opAddr = function(addr, reg)
{
	// ymmword ptr [rdi + disp]; disp = 32 * constant.id
	var disp = addr.id * 32;
	var baseIdx = 7; // rdi

	if (disp === 0)
		this.setModRM(0, reg, baseIdx);
	else if (disp <= 0x7f)
	{
		this.setModRM(1, reg, baseIdx);
		this.code.push(disp);
	}
	else
	{
		this.setModRM(2, reg, baseIdx);
		this.code.push(disp & 0xff);
		this.code.push((disp >> 8) & 0xff);
		this.code.push((disp >> 16) & 0xff);
		this.code.push((disp >> 24) & 0xff);
	}
}

Assembler.prototype.setModRM = function(mod, r1, r2)
{
	this.code.push((mod << 6) | ((r1 & 7) << 3) | (r2 & 7));
};

Assembler.prototype.opVex = function(r, op1, op2, type, code, imm8)
{
	if (op2.type === 'constant')
	{
		this.vex(r, { id: 0 }, op1, type, code, false);
		this.opAddr(op2, r.id);
	}
	else
	{
		this.vex(r, op2, op1, type, code);
		this.setModRM(3, r.id, op2.id);
	}
	
	if (imm8 !== undefined)
		this.code.push(imm8);
};
