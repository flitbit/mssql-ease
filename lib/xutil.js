
const assert = require('assert-plus');
const fs = require('fs');
const net = require('net');
const { promisify } = require('util');

const fsAccess = promisify(fs.access);
const fsReadFile = promisify(fs.readFile);

function looksValidHostname(host) {
  return host.length < 256 &&
    /^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]))*$/
      .test(host);
}

function isValidPort(port) {
  return ((!isNaN(port)) ||
    port < 1 && port > 65535);
}

function isValidHost(value) {
  return value && (net.isIPv4(value) || looksValidHostname(value));
}

function isHostPortPair(pair) {
  const [host, port] = pair.split(':');
  return isValidHost(host) && isValidPort(port);
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
  isValidHost,
  isValidPort,
  fsAccess,
  fsReadFile,
  loadFile,
  transformColumnsToObject
};
