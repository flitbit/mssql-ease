'use strict';

let debug = require('debug')('mssql:connection');
let assert = require('assert-plus');
let tds = require('tedious');

let xutil = require('./xutil');
let SqlStatement = require('./SqlStatement');
let StoredProcedure = require('./StoredProcedure');

let $pool = Symbol('pool');
let $connection = Symbol('connection');
let $connectionId = Symbol('connectionId');
let $transactions = Symbol('transactions');

let queryCount = 0;


class Connection {

  constructor(pool, connection, id) {
    assert.object(pool, 'pool');
    assert.object(connection, 'connection');
    this[$pool] = pool;
    this[$connection] = connection;
    this[$connectionId] = (typeof(id) === 'number') ? id : 'unknown id';
    this[$transactions] = [];
    debug(`Connection created: ${this[$connectionId]}`);
  }

  get connected() {
    return this[$connection] && this[$connection].connected;
  }

  get connection() {
    return this[$connection];
  }

  get transactionStarted() {
    return this[$transactions].length;
  }

  release() {
    assert.ok(this.connection, 'this.connection already released');
    let self = this;
    let errors = [];
    let transactions = self[$transactions];

    function implicitEndTransaction() {
      if (transactions[transactions.length - 1].implicitCommit) {
        debug(`Connection #${self[$connectionId]}: incomplete transaction; beginning implicit commit...`);
        return self.commitTransaction().catch(err => errors.push(err));
      }
      debug(`Connection #${self[$connectionId]}: incomplete transaction; beginning implicit rollback...`);
      return self.rollbackTransaction().catch(err => errors.push(err));
    }

    return new Promise((resolve, reject) => {
      transactions.reduce((series) => series.then(implicitEndTransaction),
          Promise.resolve())
        .then(() => (this.connected) ?
            self[$pool].release(self[$connection]):
            self[$pool].destroy(self[$connection]))
        .then(() => {
          delete self[$connection];
          debug(`Connection released: #${self[$connectionId]}`);
          if (errors.length) {
            reject(errors);
          } else {
            resolve();
          }
        });
    });
  }

  beginTransaction(options) {
    assert.optionalObject(options, 'options');
    options = options || {};
    assert.optionalString(options.name, 'options.name');
    assert.optionalString(options.isolationLevel, 'options.isolationLevel');
    assert.optionalBool(options.implicitCommit, 'options.implicitCommit');
    let self = this;
    return new Promise((resolve, reject) => {
      function onCompleted(err) {
        if (err) {
          debug(`Connection #${self[$connectionId]}: transaction start error.
  ${err}.`);
          reject(err);
        } else {
          debug(`Connection #${self[$connectionId]}: transaction started`);
          self[$transactions].push({
            implicitCommit: options.implicitCommit
          });
          resolve(self);
        }
      }
      try {
        this.connection.beginTransaction(onCompleted, options.name, options.isolationLevel);
        debug(`Connection #${self[$connectionId]}: transaction starting`);
      } catch (err) {
        reject(err);
      }
    });
  }

  commitTransaction() {
    let trans = this[$transactions].pop();
    assert.ok(trans, 'this.transactionStarted');
    let self = this;
    return new Promise((resolve, reject) => {
      function onCompleted(err) {
        if (err) {
          debug(`Connection #${self[$connectionId]}: transaction commit error.
  ${err}.`);
          reject(err);
        } else {
          debug(`Connection #${self[$connectionId]}: transaction commit complete.`);
          resolve(self);
        }
      }
      try {
        this.connection.commitTransaction(onCompleted);
        debug(`Connection #${self[$connectionId]}: transaction commit started`);
      } catch (err) {
        reject(err);
      }
    });
  }

  rollbackTransaction() {
    let trans = this[$transactions].pop();
    assert.ok(trans, 'this.transactionStarted');
    let self = this;
    return new Promise((resolve, reject) => {
      function onCompleted(err) {
        if (err) {
          debug(`Connection #${self[$connectionId]}: transaction rollback error.
  ${err}.`);
          reject(err);
        } else {
          debug(`Connection #${self[$connectionId]}: transaction rollback complete.`);
          resolve(self);
        }
      }
      try {
        self.connection.rollbackTransaction(onCompleted);
        debug(`Connection #${self[$connectionId]}: transaction rollback started.`);
      } catch (err) {
        reject(err);
      }
    });
  }

  run(runnables, release) {
    let self = this;
    let actions = (Array.isArray(runnables)) ? runnables : [runnables];
    let cn = this.connection;
    return new Promise((resolve, reject) => {
      let res = actions.reduce((acc, action) => {
        if (typeof(action) === 'function') {
          return acc.then(() => action(cn));
        }
        if (typeof(action) === 'object' && action.run) {
          return acc.then(() => action.run(cn));
        }
        throw Error(`Unrecognized runnable: ${action}. Runnables should be functions with arity 1, taking a connection and returning a Promise. A runnable may also be an object with a public method called 'run' having the runnable signature.`);
      }, Promise.resolve());
      res.then(
          () => {
            if (release) {
              self.release()
                .then(resolve)
                .catch(reject);
            } else {
              resolve();
            }
          })
        .catch(reason => {
          if (release) {
            self.release()
              .then(() => reject(reason))
              .catch(() => reject(reason));
          } else {
            reject(reason);
          }
        });
    });
  }

  queryRows(query, each, release) {
    let self = this;
    let cn = this.connection;
    return new Promise((resolve, reject) => {
      let id = queryCount++;
      let beg = process.hrtime();

      function onCompleted(err, rowCount) {
        if (err) {
          debug(`query #${id} error: ${err}`);
          if (release) {
            self.release()
              .then(() => reject(err))
              .catch(() => reject(err));
          } else {
            reject(err);
          }
        } else {
          let hrtime = process.hrtime(beg);
          debug(`query #${id} resulted in ${rowCount} rows`);
          if (release) {
            self.release()
              .then(() => resolve({
                rowCount,
                hrtime
              }))
              .catch(reject);
          } else {
            resolve({
              rowCount,
              hrtime
            });
          }
        }
      }

      debug(`query #${id} executing: ${query}`);
      let req = new tds.Request(query, onCompleted);
      req.on('row', each);
      cn.execSql(req);
    });
  }

  queryObjects(query, each, release) {
    let onRow = xutil.transformColumnsToObject.bind(null, each);
    return this.queryRows(query, onRow, release);
  }

  statement(stmt) {
    return new SqlStatement(this, stmt);
  }

  procedure(dbobject) {
    return new StoredProcedure(this, dbobject);
  }

}

function create(pool, connection) {
  return new Promise((resolve, reject) => {
    try {
      resolve(new Connection(pool, connection));
    } catch (err) {
      reject(err);
    }
  });
}

// Attach module level methods...
Connection.create = create;

module.exports = Connection;
