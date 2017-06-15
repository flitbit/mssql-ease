'use strict';

let assert = require('assert-plus');
let fs = require('fs');
let net = require('net');
let promisify = require('es6-promisify');

let fsAccess = promisify(fs.access);
let fsReadFile = promisify(fs.readFile);

function looksValidHostname(host) {
  return host.length < 256 &&
    /^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]))*$/
    .test(host);
}

function isValidPort(port) {
  return ((!isNaN(port)) ||
    port < 1 && port > 65535);
}

function isHostPortPair(pair) {
  var parts = pair.split(':');
  return parts.length === 2 &&
    isValidPort(parts[1]) && (
      net.isIPv4(parts[0]) ||
      looksValidHostname(parts[0]));
}

function loadFile(file, encoding) {
  assert.string(file, 'file');
  assert.optionalString(encoding, 'encoding');
  return fsAccess(file, fs.R_OK)
    .then(() => fsReadFile(file, encoding));
}

function transformColumnsToObject(after, columns) {
  let row = Object.create(null);
  let i = -1;
  let len = columns.length;
  while (++i < len) {
    if (columns[i].value !== null) {
      row[columns[i].metadata.colName] = columns[i].value;
    }
  }
  after(row);
}

module.exports = {
  isHostPortPair,
  looksValidHostname,
  isValidPort,
  fsAccess,
  fsReadFile,
  loadFile,
  transformColumnsToObject
};
