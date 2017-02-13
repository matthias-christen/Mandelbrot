function Vertex(data)
{
	this.data = data;
}


function Edge(graph, head, tail)
{
	this.tail = graph.findVertex(tail);
	this.head = graph.findVertex(head);
}


function Graph()
{
	this.vertices = new Map();
	this.edges = new Set();

	this.vertexData = new Map();
}

Graph.prototype.addVertex = function(vertex)
{
	if (!this.vertices.has(vertex))
	{
		this.vertices.set(vertex, vertex);
		this.vertexData.set(vertex.data, vertex);
	}
};
	
Graph.prototype.containsVertex = function(vertex)
{
	return this.vertices.has(vertex);
};

Graph.prototype.containsVertexWithData = function(data)
{
	return !!this.getVertexWithData(data);
};

Graph.prototype.getVertexWithData = function(data)
{
	return this.vertexData.get(data);
};
	
Graph.prototype.findVertex = function(vertex)
{
	var v = this.vertices.get(vertex);
	if (!v)
	{
		this.addVertex(vertex);
		return vertex;
	}

	return v;
};

Graph.prototype.findEdgeWithVertices = function(head, tail)
{
	for (var edge of this.edges)
		if (edge.head === head && edge.tail === tail)
			return edge;

	return null;
}

Graph.prototype.addEdge = function(edgeOrVertex1, vertex2)
{
	if (edgeOrVertex1 instanceof Edge)
		this.edges.add(edgeOrVertex1);
	else if ((edgeOrVertex1 instanceof Vertex) && !this.findEdgeWithVertices(edgeOrVertex1, vertex2))
		this.edges.add(new Edge(this, edgeOrVertex1, vertex2));
};

Graph.prototype.getVerticesCount = function()
{
	return this.vertices.size;
};

Graph.prototype.getEdgesCount = function()
{
	return this.edges.size;
};

Graph.prototype.removeAllVertices = function()
{
	this.vertices.clear();
	this.removeAllEdges();
};
	
Graph.prototype.removeEdge = function(edge)
{
	this.edges.delete(edge);
};
	
Graph.prototype.removeAllEdges = function()
{
	this.edges.clear ();
};

Graph.prototype.getNeighbors = function(vertex)
{
	var neighbors = [];

	for (var edge of this.edges)
		if (edge.head === vertex)
			neighbors.push(edge.tail);

	return neighbors;
};

Graph.prototype.getVerticesSortedByDegree = function()
{
	// reset degrees
	for (var v of this.vertices.keys())
		v.degree = 0;

	// compute degrees
	for (var e of this.edges)
	{
		++e.head.degree;
		++e.tail.degree;
	}

	// create array and sort by degree
	return Array.from(this.vertices.keys()).sort((v1, v2) => v2.degree - v1.degree);
};
