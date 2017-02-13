/**
 * Runs the register allocation algorithm on the live analysis graph
 * <code>graph</code> and returns a map specifying how to map the
 * {@link PseudoRegister}s used in the generated {@link InstructionList} to
 * actual register names.
 * 
 * @param graph
 *            The live analysis graph
 * @return A map mapping {@link PseudoRegister} to register names
 * @throws TooFewRegistersException
 *             If, after coloring the LA graph, it is seen that there are too
 *             few free registers of a particular register type
 */
function allocateRegisters(instructions, architecture, minRegisterIdx)
{
	if (minRegisterIdx === undefined)
		minRegisterIdx = 0;

	// perform live analysis
	var liveAnalysis = new LiveAnalysis(instructions, minRegisterIdx);
	var liveAnalysisGraph = liveAnalysis.run();
	//console.log(liveAnalysis.toString());

	// color the graph
	var numRegistersUsed = colorGraph(liveAnalysisGraph);

	if (numRegistersUsed + minRegisterIdx > architecture.registersCount)
		throw new Error('Too few registers available');

	// create the mapping (pseudo register ID => register index)
	var map = new Map();
	for (var vertex of liveAnalysisGraph.vertices.keys())
		map.set(vertex.data, vertex.color + minRegisterIdx);

	// map the pseudo register IDs to register indices
	for (var instruction of instructions)
	{
		var ops = instruction.ops;
		if (!ops)
			continue;

		var lenOps = ops.length;
		for (var i = 0; i < lenOps; i++)
		{
			var op = ops[i];
			if (op.type === 'register' && op.id >= minRegisterIdx)
				ops[i] = { type: 'register', id: map.get(op.id) };
		}
	}			

	return map;
}
