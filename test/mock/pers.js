'use strict';

// public interface
module.exports = {
	reset: reset,
	get: get,
	add: add,
	postRequestProc: postRequestProc,
	getDirtyList: getDirtyList,
	getUnloadList: getUnloadList,
	preAdd: preAdd,
};


var cache = {};
var dlist = {};
var ulist = {};


function reset() {
	cache = {};
	dlist = {};
	ulist = {};
}


function get(tsid, dontCache) {
	if (tsid in cache) {
		log.debug('cache hit: %s', tsid);
		return cache[tsid];
	}
	log.debug('cache miss: %s', tsid);
}


function add(obj, flush) {
	cache[obj.tsid] = obj;
	dlist[obj.tsid] = obj;
	return obj;
}


function preAdd() {
	for (var i = 0; i < arguments.length; i++) {
		var obj = arguments[i];
		cache[obj.tsid] = obj;
	}
}


function postRequestProc(dl, ul, logmsg) {
	dlist = dl;
	ulist = ul;
}


function getDirtyList() {
	return dlist;
}


function getUnloadList() {
	return ulist;
}
