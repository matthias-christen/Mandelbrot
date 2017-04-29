function MandelbrotView(model, $view, $canvas)
{
	this.model = model;
	this.$view = $view;
	this.$canvas = $canvas;

	this.viewOffset = $view.offset();

	var width = $view.width();
	var height = $view.height();

	this.ctx = $canvas[0].getContext('2d');
	this.ctx.canvas.width = width;
	this.ctx.canvas.height = height;
	this.ctx.fillStyle = '#000000';

	this.canvasHidden = document.createElement('canvas');
	this.ctxHidden = this.canvasHidden.getContext('2d');
	this.ctxHidden.canvas.width = width;
	this.ctxHidden.canvas.height = height;

	this.colors = undefined;

	this.defaultXmin = -5;
	this.defaultYmin = -3;

	this.geometry = {
		xmin: this.defaultXmin,
		ymin: this.defaultYmin,
		xcenter: 0,
		ycenter: 0,
		h: 0
	};

	this.zoom = {
		tid: null,
		factor: 1
	};

	this.move = {
		isMouseDown: false,
		offsetX: 0,
		offsetY: 0,
		startX: 0,
		startY: 0,
		xminOld: 0,
		yminOld: 0,
		tid: null
	};

	document.addEventListener('mousewheel', MandelbrotView.prototype.onMouseWheel.bind(this));
	this.$canvas.on('mousedown', MandelbrotView.prototype.onMouseDown.bind(this));
	this.$canvas.on('mouseup', MandelbrotView.prototype.onMouseUp.bind(this));
	this.$canvas.on('mousemove', MandelbrotView.prototype.onMouseMove.bind(this));
	$(window).smartresize(MandelbrotView.prototype.onResize.bind(this));

	this.reset();
}

MandelbrotView.prototype.recompute = function()
{
	this.compute(
		this.geometry.xmin, this.geometry.ymin,
		0, 0, this.ctx.canvas.width, this.ctx.canvas.height
	);
};

/**
 * Compute a rectangle of the Mandelbrot set in parallel.
 */
MandelbrotView.prototype.compute = function(xmin, ymin, x, y, w, h, concurrency)
{
	if (!concurrency)
		concurrency = 1;

	var radius = parseFloat(model.radius());
	var maxIter = parseInt(model.maxIter(), 10);
	if (!maxIter)
		maxIter = 500;

	// compute the number of chunks and the height of a chunk
	var numChunks = Math.ceil(concurrency * (navigator.hardwareConcurrency || 1));
	var chunkHeight = Math.ceil(h / numChunks);

	// prevent that the chunk height gets too small
	if (chunkHeight < 10)
	{
		chunkHeight = Math.min(h, 10);
		numChunks = Math.ceil(h / chunkHeight);
	}

	var xmaxGlob = xmin + this.geometry.h * w;
	var ymaxGlob = ymin + this.geometry.h * h;

	console.log('Computing (' + xmin + ', ' + ymin + ') - (' + xmaxGlob + ', ' + ymaxGlob + ') => (' + x + ', ' + y + ') x (' + w + ', ' + h + ')');

	// start the computations
	for (var i = 0; i < numChunks; i++)
	{
		app.executeCode(
			{
				xmin: xmin,
				ymin: ymin + this.geometry.h * i * chunkHeight,
				xmax: xmaxGlob,
				ymax: Math.min(ymaxGlob, ymin + this.geometry.h * (i + 1) * chunkHeight),
				dx: this.geometry.h,
				dy: this.geometry.h,
				radius: radius || 2,
				maxIter: maxIter
			},
			MandelbrotView.prototype.renderResult.bind(this, x, y + i * chunkHeight)
		);
	}
};

MandelbrotView.prototype.reset = function()
{
	var $view = $('.view');
	var width = $view.width();
	var height = $view.height();

	// set up the default geometry
	this.geometry.h = Math.max(2 * (this.geometry.xcenter - this.defaultXmin) / width, 2 * (this.geometry.ycenter - this.defaultYmin) / height);
	this.geometry.xmin = this.geometry.xcenter - this.geometry.h * width * 0.5;
	this.geometry.ymin = this.geometry.ycenter - this.geometry.h * height * 0.5;
};

/*
MandelbrotView.prototype.createColorMap = function(maxIter)
{
	this.colors = [];

	var prevStop = this.colorMap[0];
	var r = prevStop.r;
	var g = prevStop.g;
	var b = prevStop.b;

	this.colors.push((b << 16) | (g << 8) | r);

	var len = this.colorMap.length;
	for (var i = 1; i < len; i++)
	{
		var curStop = this.colorMap[i];
		var num = Math.ceil((curStop.at - prevStop.at) * (maxIter - 1));
		var dr = (curStop.r - prevStop.r) / num;
		var dg = (curStop.g - prevStop.g) / num;
		var db = (curStop.b - prevStop.b) / num;

		for (var j = 0; j < num; j++)
		{
			r += dr;
			g += dg;
			b += db;

			this.colors.push(((b | 0) << 16) | ((g | 0) << 8) | (r | 0));
		}

		prevStop = curStop;
	}

	// color for the Mandelbrot set
	this.colors.push(0);
}*/

MandelbrotView.prototype.getColor = function(n)
{
	if (n === 0)
		return this.model.colorMap[0];

	var q = n / this.model.maxIter();
	var len = this.model.colorMap.length;
	var prevStop = this.model.colorMap[0]

	for (var i = 1; i < len; i++)
	{
		var stop = this.model.colorMap[i];
		if (stop.at === q)
			return stop;
		if (stop.at > q)
		{
			var f = (q - prevStop.at) / (stop.at - prevStop.at);
			return {
				r: (1 - f) * prevStop.r + f * stop.r,
				g: (1 - f) * prevStop.g + f * stop.g,
				b: (1 - f) * prevStop.b + f * stop.b
			};
		}

		prevStop = stop;
	}

	return this.model.colorMap[len - 1];
};

MandelbrotView.prototype.renderResult = function(x, y, width, height, result, zn, dzn, histogram)
{
	var imgData = this.ctxHidden.createImageData(width, height);
	var data = imgData.data;
	var idx = 0;
	var isString = typeof result === 'string';

	for (var j = 0; j < height; j++)
	{
		for (var i = 0; i < width; i++)
		{
			var c = this.getColor(isString ?
				result.charCodeAt(2 * idx) + 128 * result.charCodeAt(2 * idx + 1) :
				result[idx]
			);

			var k = idx * 4;
			data[k] = c.r;
			data[k + 1] = c.g;
			data[k + 2] = c.b;
			data[k + 3] = 255;

			++idx;
		}
	}
	
	this.ctxHidden.putImageData(imgData, x, y);
	this.ctx.drawImage(this.ctxHidden.canvas, 0, 0);
};

MandelbrotView.prototype.onMouseWheel = function(event)
{
	event.preventDefault();

	// get the center point
	var cx = event.clientX - this.viewOffset.left;
	var cy = event.clientY - this.viewOffset.top;
	var oldH = this.geometry.h;

	// compute the zoomed geometry
	var factor = Math.pow(1.01, -event.deltaY);

	this.geometry.h *= factor;
	this.geometry.xmin = this.geometry.xmin + cx * oldH - cx * this.geometry.h;
	this.geometry.ymin = this.geometry.ymin + cy * oldH - cy * this.geometry.h;

	// compute the overall zoom factor for the pending recompute
	this.zoom.factor *= factor;

	var w = this.ctx.canvas.width;
	var h = this.ctx.canvas.height;

	// scale up/down the image to simulate the zoom (until the next recompute)
	this.ctx.fillRect(0, 0, w, h);
	this.ctx.drawImage(
		this.ctxHidden.canvas,
		cx * (1 - this.zoom.factor),
		cy * (1 - this.zoom.factor),
		w * this.zoom.factor,
		h * this.zoom.factor,
		0, 0, w, h
	);

	// recompute (debounced)
	if (this.zoom.tid)
		clearTimeout(this.zoom.tid);

	var that = this;
	this.zoom.tid = setTimeout(function()
	{
		that.ctxHidden.drawImage(that.ctx.canvas, 0, 0);
		that.compute(
			that.geometry.xmin, that.geometry.ymin,
			0, 0, that.ctx.canvas.width, that.ctx.canvas.height
		);

		that.zoom.factor = 1;
		that.zoom.tid = null;
	}, 200);
};

MandelbrotView.prototype.onMouseDown = function(event)
{
	// save the current coordinates in case the image will be moved
	this.move.isMouseDown = true;
	this.move.startX = this.move.offsetX = event.clientX - this.viewOffset.left;
	this.move.startY = this.move.offsetY = event.clientY - this.viewOffset.top;
	this.move.xminOld = this.geometry.xmin;
	this.move.yminOld = this.geometry.ymin;
};

MandelbrotView.prototype.onMouseUp = function(event)
{
	this.move.isMouseDown = false;
}

MandelbrotView.prototype.onMouseMove = function(event)
{
	var that = this;

	// nothing to do if we aren't moving the image
	if (!this.move.isMouseDown)
		return;

	var x = event.clientX - this.viewOffset.left;
	var y = event.clientY - this.viewOffset.top;

	// compute the new (xmin, ymin) coordinates
	this.geometry.xmin += (this.move.offsetX - x) * this.geometry.h;
	this.geometry.ymin += (this.move.offsetY - y) * this.geometry.h;

	// move the portion of the image we already have (no need to recompute)
	this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
	this.ctx.drawImage(this.ctxHidden.canvas, x - this.move.startX, y - this.move.startY);

	// compute the areas we haven't computed yet (debounced)
	if (this.move.tid)
		clearTimeout(this.move.tid);

	var that = this;
	this.move.tid = setTimeout(function()
	{
		var w = that.ctx.canvas.width;
		var h = that.ctx.canvas.height;

		var dx = x - that.move.startX;
		var dy = y - that.move.startY;

		// copy over the part of the image we already have
		that.ctxHidden.drawImage(that.ctx.canvas, 0, 0);

		// compute the vertical missing strip
		if (dx !== 0)
		{
			that.compute(
				dx < 0 ? that.geometry.xmin + that.geometry.h * (w + dx) : that.geometry.xmin,
				dy < 0 ? that.geometry.ymin : that.geometry.ymin + that.geometry.h * dy,
				dx < 0 ? w + dx : 0,
				dy < 0 ? 0 : dy,
				Math.abs(dx),
				h - Math.abs(dy),
				dy === 0 ? 1 : 0.5
			);
		}

		// compute the horizontal missing strip
		if (dy !== 0)
		{
			that.compute(
				that.geometry.xmin,
				dy < 0 ? that.geometry.ymin + that.geometry.h * (h + dy) : that.geometry.ymin,
				0,
				dy < 0 ? h + dy : 0,
				w,
				Math.abs(dy),
				dx === 0 ? 1 : 0.5
			);
		}

		that.move.startX = x;
		that.move.startY = y;
		that.move.tid = null;
	}, 200);

	this.move.offsetX = x;
	this.move.offsetY = y;
};

MandelbrotView.prototype.onResize = function()
{
	var w = this.$view.width();
	var h = this.$view.height();

	this.ctx.canvas.width = w;
	this.ctx.canvas.height = h;
	this.ctxHidden.canvas.width = w;
	this.ctxHidden.canvas.height = h;

	this.compute(this.geometry.xmin, this.geometry.ymin, 0, 0, w, h);
};
