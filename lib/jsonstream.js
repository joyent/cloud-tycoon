/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var mod_util = require('util');
var mod_stream = require('stream');

function
JSONStream(opts)
{
	opts = opts || {};
	opts.objectMode = true;

	this.js_accum = '';

	mod_stream.Transform.call(this, opts);
}
mod_util.inherits(JSONStream, mod_stream.Transform);

JSONStream.prototype._flush = function
_flush(done)
{
	var self = this;

	if (!self.js_accum) {
		done();
		return;
	}

	var out;
	try {
		out = JSON.parse(self.js_accum);
	} catch (ex) {
		done(ex);
		return;
	}

	self.push(out);
	done();
};

JSONStream.prototype._transform = function
_transform(line, encoding, done)
{
	var self = this;

	line = line.trim();
	if (!line) {
		done();
		return;
	}

	var out;
	var newl = self.js_accum + '\n' + line;
	try {
		out = JSON.parse(newl);
		self.js_accum = '';
	} catch (ex) {
		self.js_accum = newl;
		done();
		return;
	}

	self.push(out);
	done();
};

module.exports = JSONStream;
