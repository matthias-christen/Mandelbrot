/**
 * Colors the vertices of the graph <code>graph</code> using the greedy
 * algorithm.
 * See also http://code.google.com/p/annas/">http://code.google.com/p/annas/
 * 
 * @param graph
 *   The graph whose vertices to color
 * @return The number of colors used for the coloring
 */
function colorGraph(graph)
{
	var allColors = [];
	var lastColor = 0;

	for (var vertex of graph.getVerticesSortedByDegree())
	{
		var colors = getUnusedColors(graph, vertex, allColors);

		if (colors.length === 0)
		{
			// no available colors; add a new one
			allColors.push(lastColor);
			vertex.color = lastColor;
			++lastColor;
		}
		else
		{
			// set the vertex color (the first color from the collection of colors)
			vertex.color = colors[0];
		}
	}

	return allColors.length;
}
	
/**
 * Returns a collection of possible candidate colors for vertex <code>vertex</code>
 * @param vertices
 * @return
 */
function getUnusedColors(graph, vertex, colors)
{
	var setColors = new Set(colors);
	
	for (var v of graph.getNeighbors(vertex))
	{
		if (setColors.has(v.color))
			setColors.delete(v.color);
		if (setColors.size === 0)
			break;
	}

	return Array.from(setColors);
}
