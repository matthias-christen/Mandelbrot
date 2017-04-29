function CommonSubexpressionEliminator(ast)
{
	this.ast = ast;
	this.assignmentList = [];
	this.tempIdx = 0;
}

CommonSubexpressionEliminator.prototype.run = function()
{
	var len = this.ast.list.length;

	// replace common subexpressions as long as they can be found
	for ( ; ; )
	{
		this.set = new WeakSet();
		var foundReplace = false;

		for (var i = 0; i < len; i++)
			if (this.walk(null, this.ast.list[i]))
				foundReplace = true;

		if (!foundReplace)
			break;
	}

	this.ast.list = this.assignmentList.concat(this.ast.list);
	return this.ast;
};

CommonSubexpressionEliminator.prototype.walk = function(parent, child)
{
	switch (child.type)
	{
	case 'variable':
	case 'number':
		if (this.set.has(parent))
			return false;

		this.set.add(parent);
		var toReplace = [];
		var len = this.ast.list.length;
		for (var i = 0; i < len; i++)
			this.findSame(null, this.ast.list[i], null, parent, toReplace);

		len = toReplace.length;
		if (len < 2)
			return false;

		// append the assignment to a temporary variable to the assignment list
		var varName = 'tmp' + (this.tempIdx++);
		var replacement = {
			type: 'variable',
			name: varName,
			re: varName + '_re',
			im: varName + '_im'
		};

		this.assignmentList.push({
			type: 'assignment',
			target: replacement,
			expr: toReplace[0].parent[toReplace[0].property]
		});

		// replace the occurrences in the AST
		for (var i = 0; i < len; i++)
		{
			var r = toReplace[i];
			r.parent[r.property] = replacement;
		}
		return true;

	case 'assignment':
		return this.walk(child, child.expr);

	case 'unaryExpression':
		return this.walk(child, child.arg);

	case 'binaryExpression':
		var l = this.walk(child, child.left);
		var r = this.walk(child, child.right);
		return l || r;

	case 'functionExpression':
		return this.walk(child, child.arg);
	}
};

CommonSubexpressionEliminator.prototype.findSame = function(parent, child, property, what, result)
{
	if (child === what || this.isEqual(child, what))
		result.push({ parent: parent, property: property });
	else
	{
		switch (child.type)
		{
		case 'assignment':
			this.findSame(child, child.expr, 'expr', what, result);
			break;

		case 'unaryExpression':
			this.findSame(child, child.arg, 'arg', what, result);
			break;

		case 'binaryExpression':
			this.findSame(child, child.left, 'left', what, result);
			this.findSame(child, child.right, 'right', what, result);
			break;

		case 'functionExpression':
			this.findSame(child, child.arg, 'arg', what, result);
			break;
		}
	}
};

CommonSubexpressionEliminator.prototype.isEqual = function(node1, node2)
{
	if (node1.type !== node2.type)
		return false;

	switch (node1.type)
	{
	case 'variable':
		return node1.name === node2.name && node1.re === node2.re && node1.im === node2.im;
	case 'number':
		return node1.re === node2.re && node1.im === node2.im;
	case 'assignment':
		return this.isEqual(node1.expr, node2.expr);
	case 'unaryExpression':
		return node1.op === node2.op && this.isEqual(node1.arg, node2.arg);
	case 'binaryExpression':
		return node1.op === node2.op && this.isEqual(node1.left, node2.left) && this.isEqual(node1.right, node2.right);
	case 'functionExpression':
		return node1.name === node2.name && this.isEqual(node1.arg, node2.arg);
	}

	return false;
};
