'use strict';

/**
 * All things logging. Initializes the log library ({@link
 * https://github.com/trentm/node-bunyan|Bunyan}) according to server
 * configuration, and sets up the various log output streams.
 *
 * @module
 */

// public interface
module.exports = {
	init: init,
};


var assert = require('assert');
var bunyan = require('bunyan');
var config = require('config');
var fs = require('fs');
var path = require('path');
var RC = require('data/RequestContext');
var Session = require('comm/Session');

var logger;


/**
 * Initializes logging for this GS process and sets up the global
 * logging handler `log`.
 */
function init() {
	var gsid = config.getGsid();
	var cfg = config.get('log');
	assert(typeof gsid === 'string' && gsid.length > 0, 'invalid GSID: ' + gsid);
	var dir = path.resolve(path.join(cfg.dir));
	try {
		fs.mkdirSync(dir);
	}
	catch (e) {
		if (e.code !== 'EEXIST') throw e;
	}
	logger = bunyan.createLogger({
		name: gsid,
		src: cfg.includeLoc,
		streams: [
			{
				level: cfg.level.stdout,
				stream: process.stdout,
			},
			{
				level: cfg.level.file,
				path: path.join(dir, gsid + '-default.log'),
			},
			{
				level: 'error',
				path: path.join(dir, gsid + '-errors.log'),
			},
		],
		serializers: {
			err: bunyan.stdSerializers.err,
			rc: RC.logSerialize,
			session: Session.logSerialize,
		},
	});
	// set up global log handler that transparently wraps bunyan log calls
	global.log = {
		trace: wrapLogEmitter(logger.trace),
		debug: wrapLogEmitter(logger.debug),
		info: wrapLogEmitter(logger.info),
		warn: wrapLogEmitter(logger.warn),
		error: wrapLogEmitter(logger.error),
		fatal: wrapLogEmitter(logger.fatal),
		// pass through other bunyan API functions directly:
		child: logger.child.bind(logger),
		level: logger.level.bind(logger),
		levels: logger.levels.bind(logger),
		reopenFileStreams: logger.reopenFileStreams.bind(logger),
	};
}


function addField(args, name, val) {
	// first arg is an Error -> wrap it in a fields object
	if (args[0] instanceof Error) {
		args[0] = {err: args[0]};
	}
	// handle unexpected input gracefully (probably caller meant to supply an
	// error that wasn't really there)
	if (args[0] === null || args[0] === undefined) {
		args[0] = {};
	}
	// first arg is the log message -> insert an empty fields object
	if (typeof args[0] === 'string') {
		Array.prototype.splice.call(args, 0, 0, {});
	}
	// add the new field
	args[0][name] = val;
}


/**
 * Transparent wrapper for Bunyan log emitter functions (`log.info`,
 * `log.debug` etc). Adds the current request context and session
 * as additional fields if available.
 *
 * This is a partial workaround for
 * {@link https://github.com/trentm/node-bunyan/issues/166}.
 *
 * @private
 */
function wrapLogEmitter(emitter) {
	return function log() {
		// abort immediately if this log level is not enabled
		if (!emitter.call(logger)) return;
		// add 'rc' and 'session' fields if available
		var rc = RC.getContext(true);
		if (rc) {
			addField(arguments, 'rc', rc);
			if (rc.session) addField(arguments, 'session', rc.session);
		}
		// override bunyan's source code location detection (otherwise it would
		// just always indicate this module/function)
		if (logger.src) addField(arguments, 'src', getCallerInfo());
		return emitter.apply(logger, arguments);
	};
}


/**
 * A copy of Bunyan's `getCaller3Info` function to retrieve log call
 * site information. Duplicated here because otherwise log messages
 * would always show this module as their origin.
 *
 * @private
 */
function getCallerInfo() {
	var obj = {};
	var saveLimit = Error.stackTraceLimit;
	var savePrepare = Error.prepareStackTrace;
	Error.stackTraceLimit = 2;
	var e = new Error();
	Error.captureStackTrace(e, getCallerInfo);
	Error.prepareStackTrace = function (_, stack) {
		var caller = stack[1];
		obj.file = caller.getFileName();
		obj.line = caller.getLineNumber();
		var func = caller.getFunctionName();
		if (func) obj.func = func;
	};
	/*jshint -W030 */  // the following expression triggers prepareStackTrace
	e.stack;
	Error.stackTraceLimit = saveLimit;
	Error.prepareStackTrace = savePrepare;
	return obj;
}