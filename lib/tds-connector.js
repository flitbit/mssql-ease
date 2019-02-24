const debug = require('debug')('mssql-ease:tds-connector');
const assert = require('assert-plus');
const { inspect } = require('util');
const { pick } = require('lodash');
const { Connection } = require('tedious');
const { ConnectionString } = require('./connection-string');

let __id = 0;
const $ended = Symbol('ended');
const $id = Symbol('id');
const $error = Symbol('error');

function decodeInfoMessage(kind, message) {
  const {
    number: infoNumber, // Error number
    state, // The error state, used as a modifier to the error number.
    class: infoClass, // The class (severity) of the error. A class of less than 10 indicates an informational message.
    message: infoMessage, // The message text.
    procName, // The stored procedure name (if a stored procedure generated the message).
    lineNumber, // The line number in the SQL batch or stored procedure that caused the error.
    //Line numbers begin at 1; therefore, if the line number is not applicable to the message, the value of LineNumber will be 0.
  } = message;
  return `${kind}: number=${infoNumber}, state=${state}, class='${infoClass}', message='${infoMessage}', procName='${procName}', lineNumber=${lineNumber}`;
}

class TdsConnector {
  static connectionId(connection) {
    assert.object(connection, 'connection');
    return connection[$id];
  }

  constructor(config) {
    const cfg = new ConnectionString(config);
    Object.defineProperties(this, {
      config: {
        value: cfg
      }
    });
  }

  async create() {
    const { config } = this;
    const connection = new Connection(config);
    return await new Promise((resolve, reject) => {
      let connected = false;
      connection[$id] = ++__id;
      debug(`Connection #${connection[$id]} connecting...`);
      connection.on('connect', err => {
        if (err) { reject(err); return; }
        connected = true;
        debug(`Connection #${connection[$id]} connected.`);
        resolve(connection);
      });
      connection.once('end', () => {
        connection[$ended] = true;
        debug(`Connection #${connection[$id]} ended.`);
      });
      connection.once('error', (e) => {
        if (!connected) {
          debug(`Connection #${connection[$id]} encountered an error while connecting: ${e.stack || e}.`);
          reject(e);
        }
        connection[$error] = e;
      });
      connection.on('debug', message => {
        debug(`Connection #${connection[$id]} debug: ${message}.`);
      });
      connection.on('infoMessage', message => {
        debug(`Connection #${connection[$id]} TSQL info message: ${decodeInfoMessage('INFO', message)}.`);
      });
      connection.on('errorMessage', message => {
        debug(`Connection #${connection[$id]} TSQL error message: ${decodeInfoMessage('ERROR', message)}.`);
      });
      connection.on('databaseChange', name => {
        debug(`Connection #${connection[$id]} database change: ${name}.`);
      });
      connection.on('languageChange', name => {
        debug(`Connection #${connection[$id]} language change: ${name}.`);
      });
      connection.on('charsetChange', name => {
        debug(`Connection #${connection[$id]} character set change: ${name}.`);
      });
      connection.on('secure', socket => {
        const data = pick(socket, ['servername', 'alpnProtocol', 'authorized', 'authorizationError',
          'encrypted']);
        debug(`Connection #${connection[$id]} secure: ${inspect(data)}.`);
      });
    });
  }

  async destroy(connection) {
    if (!connection[$ended]) {
      debug(`Destroying connection #${connection[$id]}`);
      const ended = new Promise((resolve, reject) => {
        connection.once('end', err => {
          if (err) { reject(err); return; }
          debug(`Connection #${connection[$id]} destroyed`);
          resolve();
        });
      });
      connection.close();
      await ended;
    }
  }

  async validate(connection) {
    // any error invalidates the connection; have the pool throw it away.
    return (connection[$error]) ? false : true;
  }

}

module.exports = TdsConnector.TdsConnector = TdsConnector;
