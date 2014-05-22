#! /opt/local/bin/node

/*
 * Copyright 2014 Joyent, Inc.  All rights reserved.
 */

var mod_assert = require('assert-plus');
var mod_readline = require('readline');
var mod_util = require('util');
var mod_events = require('events');
var mod_stream = require('stream');
var mod_extsprintf = require('extsprintf');

var fmt = mod_extsprintf.sprintf;
var CT_cmdstream = require('../lib/CT_cmdstream.js');

function
CT_clisrc(arg)
{
	var self = this;
	var stropts;

	mod_assert.object(arg, 'arg');
	mod_assert.object(arg.session, 'arg.session');
	mod_assert.optionalObject(arg.stropts, 'arg.stropts');
	stropts = arg.stropts || {};

	stropts.decodeStrings = false;
	stropts.encoding = 'utf8';
	stropts.highWaterMark = 0;

	mod_stream.Readable.call(this, stropts);

	this._read = function () {
		arg.session.resume();
	};

	arg.session.on('line', function (line) {
		if (!self.push(line))
			arg.session.pause();
	});

	arg.session.on('close', function () {
		self.push(null);
	});
}
mod_util.inherits(CT_clisrc, mod_stream.Readable);
CT_clisrc.prototype.name = 'CT_clisrc';

function
CT_session()
{
	mod_events.EventEmitter.call(this);

	this._rl = null;
	this._is = null;
	this._os = null;
	this._cs = null;
}
mod_util.inherits(CT_session, mod_events.EventEmitter);
CT_session.prototype.name = 'CT_session';

CT_session.prototype.start = function (arg)
{
	var self = this;
	var cpstream;
	var sim;
	var cis, cos, ces;
	var sos, ses;
	var cs;
	var rl;
	var cli;

	mod_assert.object(arg, 'arg');
	mod_assert.optionalObject(arg.ctlin, 'arg.ctlin');
	mod_assert.optionalObject(arg.ctlout, 'arg.ctlout');
	mod_assert.optionalObject(arg.ctlerr, 'arg.ctlerr');
	mod_assert.optionalObject(arg.simout, 'arg.simout');
	mod_assert.optionalObject(arg.simerr, 'arg.simerr');
	mod_assert.object(arg.simulation, 'arg.simulation');

	cis = self._cis = arg.ctlin || process.stdin;
	cos = self._cos = arg.ctlout || process.stdout;
	ces = self._ces = arg.ctlerr || process.stderr;

	sos = self._sos = arg.simout || process.stdout;
	ses = self._ses = arg.simerr || process.stderr;

	rl = self._rl = mod_readline.createInterface(cis, cos);
	cli = self._cli = new CT_clisrc({ session: self });
	cs = self._cs = new CT_cmdstream({});
	sim = self._simulation = arg.simulation;

	/*
	 * For now, we emulate the synchronous target mode of mdb and do not
	 * accept any commands while the simulation is running.  We don't have
	 * to do this; we could instead emulate the kernel mode, but as with
	 * mdb, doing so would preclude the use of stdin by the target.  In
	 * fairness, that doesn't work very well anyway, so we could get rid
	 * of this.
	 */
	rl.on('line', function (line) {
		if (sim.running())
			return;

		line = line.trim();

		if (line === '') {
			rl.prompt();
			return;
		}

		self.emit('line', line);
	});

	rl.on('close', function () {
		/* XXX ctl teardown */
		cos.write('\n');
		self.emit('close');
	});

	/*
	 * ^C is the only command that can be accepted when the simulation is
	 * running (in synchronous mode, anyway).  In this case, we act as if
	 * the user had been able to supply a command, and supplied the hidden
	 * ::stop scmd.
	 */
	rl.on('SIGINT', function () {
		self.emit('line', '::stop');
	});

	rl.setPrompt('> ');

	sim.on('ctl-response', function (res) {
		cos.write(JSON.stringify(res) + '\n');
		if (res.done || typeof (res.err) !== 'undefined') {
			if (!sim.running()) {
				self.resume();
				rl.prompt();
			}
		}
	});

	sim.on('ctl-error', function (err) {
		ces.write('Internal control plane error:\n');
		ces.write(fmt('%s\n', err.toString()));
		process.exit(2);
	});

	sim.on('sim-data', function (obj) {
		sos.write(JSON.stringify(obj) + '\n');
	});

	sim.on('sim-error', function (err) {
		ses.write(err);
	});

	sim.on('suspend', function () {
		rl.prompt();
	});

	cpstream = cli.pipe(cs);
	sim.plumb_ctl({ stream: cpstream });

	rl.prompt();
};

CT_session.prototype.pause = function ()
{
	this._rl.pause();
};

CT_session.prototype.resume = function ()
{
	this._rl.resume();
};

module.exports = CT_session;