ko.components.register('inputWithSamples', {
	viewModel: function(params)
	{
		var that = this;

		this.input = params.input;
		this.samples = params.samples;

		this.isSamplesVisible = ko.observable(false);

		document.addEventListener('click', function(event)
		{
			that.isSamplesVisible(false);
		}, true);
	},
	template:
		'<input type="text" data-bind="value: input">' +
		'<span data-bind="click: function() { this.isSamplesVisible(!this.isSamplesVisible()); }">▾</span>' +
		'<ul class="samples-list" data-bind="foreach: samples, css: { visible: isSamplesVisible }">' +
			'<li data-bind="click: function() { $parent.input(formula); }">' +
				'<code data-bind="text: formula"></code>' +
				'<p data-bind="text: name"></p>' +
			'</li>' +
		'</ul>'
});
