MandelbrotModel = function()
{
	this.formula = ko.observable('z^2+c');
	this.radius = ko.observable(2);
	this.maxIter = ko.observable(100);
	this.colorFormula = ko.observable('n/maxIter');

	this.colorMap = [
		{ at: 0, r: 0x00, g: 0x00, b: 0x00 },
		{ at: 0.1, r: 0x06, g: 0x38, b: 0x7a },
		{ at: 0.5, r: 0xe2, g: 0x66, b: 0xcc },
		{ at: 0.7, r: 0xef, g: 0xee, b: 0x94 },
		{ at: 0.8, r: 0x69, g: 0xef, b: 0xb7 },
		{ at: 0.9, r: 0x72, g: 0xc2, b: 0xff }
	];

	this.architecture = {
		registersCount: 16
	};
}

MandelbrotModel.prototype.compile = function(cb)
{
	var expr = Parser.parse(this.formula());
	var exprOpt = new ExpressionOptimizer(expr);

	var ast = {
		type: 'assignmentList',
		list: [
			{
				type: 'assignment',
				target: {
					type: 'variable',
					name: 'znew',
					re: 'xnew',
					im: 'ynew'
				},
				expr: exprOpt.generate()
			}
		]
	};

	var codeGen = new MandelbrotCodeGenerator(ast);
	codeGen.generate();

	//console.log(codeGen.toString());

	allocateRegisters(
		codeGen.instructions,
		this.architecture,
		4 /* 4 registers for zRe, zIm, cRe, cIm */
	);

	console.log(codeGen.toString());

	var assembler = new MandelbrotAssembler(codeGen.instructions);
	assembler.run();

	console.log(assembler.code.map(x => ('0' + x.toString(16)).substr(-2)).join(' '));

	app.compileCode(assembler.code, codeGen.constants, cb);
};
