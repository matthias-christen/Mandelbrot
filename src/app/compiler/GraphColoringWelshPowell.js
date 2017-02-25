function colorGraph(graph)
{
	var verticesByDegree = graph.getVerticesSortedByDegree();
	var color = 0;
	var verticesOfCurrentColor;

	while (verticesByDegree.length > 0)
	{
		verticesByDegree[0].color = color;
		verticesOfCurrentColor = [ 0 ];
		var len = verticesByDegree.length;

		for (var i = 1; i < len; i++)
		{
			var vertex = verticesByDegree[i];

			// color the vertex if it isn't incident to the ones colored with the current color
			if (!isIncident(graph, vertex, verticesByDegree, verticesOfCurrentColor))
			{
				vertex.color = color;
				verticesOfCurrentColor.push(i);
			}
		}

		// remove the vertices that were just colored
		for (var i = verticesOfCurrentColor.length - 1; i >= 0; i--)
			verticesByDegree.splice(verticesOfCurrentColor[i], 1);

		++color;
	}

	return color;
}

function isIncident(graph, vertex, allVertices, vertexIndices)
{
	var neighbors = graph.getNeighbors(vertex);
	var len = vertexIndices.length;

	for (var i = 0; i < len; i++)
		if (neighbors.indexOf(allVertices[vertexIndices[i]]) >= 0)
			return true;

	return false;
}
