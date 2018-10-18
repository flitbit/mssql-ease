const debug = require('debug')('mssql-ease:tds-connector');
const assert = require('assert-plus');
const { Connection } = require('tedious');
const { ConnectionString } = require('./connection-string');

let __id = 0;
const $ended = Symbol('ended');
const $id = Symbol('id');
const $error = Symbol('error');

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
      debug(`Connection ${connection[$id]} connecting...`);
      connection.once('error', (e) => {
        if (!connected) {
          debug(`Connection ${connection[$id]} encountered an error while connecting: ${e.stack || e}`);
          reject(e);
        }
        connection[$error] = e;
      });
      connection.on('connect', err => {
        if (err) { reject(err); return; }
        connected = true;
        debug(`Connection ${connection[$id]} connected`);
        connection.once('end', () => {
          connection[$ended] = true;
          debug(`Connection ${connection[$id]} ended`);
        });
        resolve(connection);
      });
    });
  }

  async destroy(connection) {
    if (!connection[$ended]) {
      debug(`Destroying connection ${connection[$id]}`);
      const ended = new Promise((resolve, reject) => {
        connection.once('end', err => {
          if (err) { reject(err); return; }
          debug(`Connection ${connection[$id]} destroyed`);
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
