var Fs = require('fs');

var lines = Fs.readFileSync('log.asm.txt', 'utf8').split('\n');

var len = lines.length;

try
{
	for (var i = 0; i < len; i++)
	{
		var out = 'asm(".intel_syntax noprefix; ';
		for (var j = 0; j <= i; j++)
			out += lines[j].substr(1, lines[j].length - 2);
		var m = lines[i].match(/.*?([a-z0-9]+) ([xy]mm\d+)/);
		var reg = 'y' + m[2].substr(1);
	//	out += 'vmovupd [rbx],' + reg + '" : : "a"(a), "b"(r));printf("' + reg + ' = %.10f, %.10f, %.10f, %.10f\\n", r[0], r[1], r[2], r[3]);';
		out += 'vmovupd [rbx],' + reg + '" : : "a"(a), "b"(r));printf("' + m[1] + ': %.10f, %.10f, %.10f, %.10f\\n", r[0], r[1], r[2], r[3]);';
		console.log(out);
	}
}
catch (e)
{
	console.error('Error on line ' + (i + 1));
}
