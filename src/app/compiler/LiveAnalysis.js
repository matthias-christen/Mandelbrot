/**
 * Performs a pseudo register live analysis on the provided instruction list.
 */
function LiveAnalysis(instructions, minRegisterIdx)
{
	this.instructions = instructions;
	this.minRegisterIdx = minRegisterIdx || 0;
	this.livePseudoRegisters = null;
}


///////////////////////////////////////////////////////////////////
// Constants

LiveAnalysis.STATE_UNASSIGNED = -Infinity;
LiveAnalysis.STATE_DEAD = -1;
LiveAnalysis.STATE_LIVE = 0;
	
LiveAnalysis.NO_NEXT_READ = -1;
	
	
///////////////////////////////////////////////////////////////////
// Implementation

/**
 * Runs the live analysis.
 * 
 * @return The live analysis graph
 */
LiveAnalysis.prototype.run = function()
{
	var graph = new Graph();
	
	// construct the matrix and add the vertices to the LAGraph
	this.createStateMatrix(graph);
	
	// add edges according to the state matrix
	this.createLAGraphEdges (graph);
			
	return graph;
}

/**
 * Finds the maximum pseudo register index.
 * 
 * @return The maximum pseudo register index
 */
LiveAnalysis.prototype.getMaxPseudoRegIndex = function()
{
	var maxIdx = 0;

	for (var instruction of this.instructions)
	{
		if (!instruction.ops)
			continue;

		for (var operand of instruction.ops)
			if (operand.type === 'register')
				maxIdx = Math.max(maxIdx, operand.id);
	}
	
	return maxIdx;
}
	
/**
 * Construct the graph from the matrix: Add an edge between two vertices if
 * the two corresponding pseudo registers are live at the same time (the
 * vertices were added in createStateMatrix)
 * 
 * @param graph
 */
LiveAnalysis.prototype.createLAGraphEdges = function(graph)
{
	graph.removeAllEdges ();
	
	for (var states of this.livePseudoRegisters)
	{
		var lenStates = states.length;

		for (var j = 0; j < lenStates; j++)
		{
			for (var k = j + 1; k < lenStates; k++)
			{
				if (states[j] >= LiveAnalysis.STATE_LIVE && states[k] >= LiveAnalysis.STATE_LIVE)
				{
					graph.addEdge(graph.getVertexWithData(j), graph.getVertexWithData(k));
					graph.addEdge(graph.getVertexWithData(k), graph.getVertexWithData(j));
				}
			}
		}
	}		
}
	
/**
 * Constructs a matrix, <code>livePseudoRegisters</code>, which captures which pseudo registers
 * (columns of the matrix) are live in which instruction (rows of the matrix).
 * 
 * @param graph
 *  An instance of the live analysis graph, to which vertices are added in this method.
 */
LiveAnalysis.prototype.createStateMatrix = function(graph)
{
	// create the matrix of pseudo registers
	var nPseudoRegistersCount = this.getMaxPseudoRegIndex() + 1;	
	var lenInstructions = this.instructions.length;

	this.livePseudoRegisters = [];
	for (var i = 0; i < lenInstructions; i++)
	{
		this.livePseudoRegisters[i] = [];
		for (var j = 0; j < nPseudoRegistersCount; j++)
			this.livePseudoRegisters[i].push(LiveAnalysis.STATE_UNASSIGNED);
	}

	if (nPseudoRegistersCount == 1)
		return;

	for (var i = 0; i < lenInstructions; i++)
	{
		var instruction = this.instructions[i];
		var ops = instruction.ops;

		if (!ops)
			continue;

		var registerModes = CodeGenerator.mnemonics[instruction.code];
		if (!registerModes)
			throw new Error('Unknown instruction ' + instruction.code);
		
		// - a register becomes live if it is written to (it is the output operand)
		// - a register is killed when the instruction contains the last read
		//   (pseudo registers are not reused, i.e., they are written only once)
		
		// check whether a register gets killed
		var idx = 0;
		for (var op of ops)
		{
			if (op.type !== 'register' || op.id < this.minRegisterIdx || (registerModes[idx] & CodeGenerator.Op.READ) === 0)
				continue;

			// check the register
			if (!graph.containsVertexWithData(op.id))
				graph.addVertex(new Vertex(op.id));
			
			var nNextReadIdx = this.getNextRead(op, i);
			if (nNextReadIdx === LiveAnalysis.NO_NEXT_READ)
			{
				this.livePseudoRegisters[i][op.id] = LiveAnalysis.STATE_LIVE;
				if (i < lenInstructions - 1)
					this.livePseudoRegisters[i + 1][op.id] = LiveAnalysis.STATE_DEAD;
			}
			else
				this.livePseudoRegisters[i][op.id] = nNextReadIdx - i;

			++idx;
		}

		// new write register becomes live
		idx = 0;
		for (var op of ops)
		{
			if (op.type !== 'register' || op.id < this.minRegisterIdx || (registerModes[idx] & CodeGenerator.Op.WRITE) === 0)
				continue;

			if (!graph.containsVertexWithData(op.id))
				graph.addVertex(new Vertex(op.id));
			
			var nNextReadIdx = this.getNextRead(op, i);
			this.livePseudoRegisters[i][op.id] = nNextReadIdx === LiveAnalysis.NO_NEXT_READ ?
				LiveAnalysis.STATE_DEAD :
				nNextReadIdx - i;

			++idx;
		}

		// promote unassigned flags from previous instruction
		this.promoteUnassignedFlags(i);
	}
}
	
/**
 * Promotes unassigned flags from previous instruction.
 * 
 * @param curIdx
 *            The current instruction index
 */
LiveAnalysis.prototype.promoteUnassignedFlags = function(curIdx)
{
	var len = this.livePseudoRegisters[curIdx].length;

	for (var j = 0; j < len; j++)
	{
		if (curIdx == 0)
		{
			if (this.livePseudoRegisters[curIdx][j] === LiveAnalysis.STATE_UNASSIGNED)
				this.livePseudoRegisters[curIdx][j] = LiveAnalysis.STATE_DEAD;
		}
		else if (this.livePseudoRegisters[curIdx][j] === LiveAnalysis.STATE_UNASSIGNED)
		{
			this.livePseudoRegisters[curIdx][j] = this.livePseudoRegisters[curIdx - 1][j] >= LiveAnalysis.STATE_LIVE ?
				this.livePseudoRegisters[curIdx - 1][j] - 1 :
				this.livePseudoRegisters[curIdx - 1][j];
		}
	}
}
	
/**
 * Determines when the next read of the pseudo register <code>reg</code>
 * occurs in the instruction list after the instruction with index
 * <code>nCurrentIstrIdx</code>. If the register is read for the last time
 * in the instruction with index <code>nCurrentInstrIdx</code>,
 * {@link LiveAnalysis#NO_NEXT_READ} is returned.
 * 
 * @param reg
 *            The pseudo register
 * @param nCurrentInstrIdx
 *            The index of the instruction
 * @return The index of the instruction in which the next read of register
 *         <code>reg</code> occurs or {@link LiveAnalysis#NO_NEXT_READ} if
 *         there is none
 */
LiveAnalysis.prototype.getNextRead = function(reg, nCurrentInstrIdx)
{
	var len = this.instructions.length;

	for (var i = nCurrentInstrIdx + 1; i < len; i++)
	{
		var instr = this.instructions[i];
		var registerModes = CodeGenerator.mnemonics[instr.code];
		if (!registerModes)
			throw new Error('Unknown instruction ' + instr.code);

		var ops = instr.ops;
		var lenOps = (ops && ops.length) || 0;

		if (!lenOps)
			continue;
						
		// check input operands
		for (var j = 0; j < lenOps; j++)
		{
			var op = ops[j];
			if (reg.id === op.id && (registerModes[j] & CodeGenerator.Op.READ))
			{
				// another, later read was found
				return i;
			}
		}

		// check output operand: last read if no read occurred previously and the register is written to
		if (reg.id === ops[0].id)
			return LiveAnalysis.NO_NEXT_READ;
	}
	
	return LiveAnalysis.NO_NEXT_READ;
}

LiveAnalysis.prototype.toString = function()
{
	var s = 'Instr \\ Reg';

	var maxLen = s.length;
	for (var instr of this.instructions)
	{
		var opLen = 0;
		for (var op of instr.ops)
			opLen += ('x' + op.id).length + 1;
		maxLen = Math.max(maxLen, instr.code.length + opLen);
	}

	s += '                    '.substr(0, maxLen - s.length) + '  ';
	var len = this.livePseudoRegisters[0].length;
	for (var j = 0; j < len; j++)
		s += 'r' + j + '    '.substr(0, 4 - ('r' + j).length);
	s += '\n';

	var i = 0;
	for (var instr of this.instructions)
	{
		var ops = '';
		for (var op of instr.ops)
		{
			if (ops)
				ops += ',';
			ops += op.type.charAt(0) + op.id;
		}

		var t = instr.code + ' ' + ops;
		s += t + '                    '.substr(0, maxLen - t.length) + ' ';

		var lprs = this.livePseudoRegisters[i];
		var len = lprs.length;
		for (var j = 0; j < len; j++)
		{
			switch (lprs[j])
			{
			case LiveAnalysis.STATE_UNASSIGNED:
				s += ' ---';
				break;
			case LiveAnalysis.STATE_DEAD:
				s += ' ...';
				break;
			default:
				s += '    '.substr(0, 4 - ('' + lprs[j]).length) + lprs[j];
				break;
			}
		}

		++i;
		s += '\n';
	}

	return s;
}
