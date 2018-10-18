
let debug = require('debug')('mssql:connection');
let assert = require('assert-plus');
let tds = require('tedious');

let xutil = require('./xutil');
let { TdsConnector } = require('./tds-connector');
let SqlStatement = require('./SqlStatement');
let StoredProcedure = require('./StoredProcedure');

let $transactions = Symbol('transactions');

let queryCount = 0;


class Connection {
  static async create(pool, connection) {
    return new Connection(pool, connection);
  }

  constructor(pool, connection) {
    assert.object(pool, 'pool');
    assert.object(connection, 'connection');
    this[$transactions] = [];
    Object.defineProperties(this, {
      pool: {
        enumerable: true,
        value: pool
      },
      connectionId: {
        enumerable: true,
        value: TdsConnector.connectionId(connection) || 'unknown id'
      },
      connection: {
        enumerable: true,
        value: connection
      }
    });
    debug(`Connection created: ${this.connectionId}`);
  }

  get connected() {
    const { connection, released } = this;
    return connection && connection.connected && !released;
  }

  get transactionStarted() {
    return this[$transactions].length > 0;
  }

  async release() {
    const { pool, connection, connectionId, released } = this;
    let transactions = this[$transactions];
    let errors = [];
    const self = this;

    async function implicitEndTransaction() {
      try {
        let endTx;
        if (transactions[transactions.length - 1].implicitCommit) {
          debug(`Connection #${connectionId}: incomplete transaction; beginning implicit commit...`);
          endTx = self.commitTransaction();
        } else {
          debug(`Connection #${connectionId}: incomplete transaction; beginning implicit rollback...`);
          endTx = self.rollbackTransaction();
        }
        await endTx;
      } catch (err) {
        errors.push(err);
        debug(`Unexpected exception on connection #${connectionId} while ending transaction: ${err.stack || err}`);
      }
    }

    if (!released) {
      await transactions.reduce((series) => series.then(implicitEndTransaction), Promise.resolve());
      await pool.release(connection);
      Object.defineProperty(this, 'released', { enumerable: true, value: true });
      debug(`Connection released: #${connectionId}`);
      // what to do with errors?
    }
  }

  async beginTransaction(options) {
    assert.optionalObject(options, 'options');
    options = options || {};
    assert.optionalString(options.name, 'options.name');
    assert.optionalString(options.isolationLevel, 'options.isolationLevel');
    assert.optionalBool(options.implicitCommit, 'options.implicitCommit');
    const { connection, connectionId, released } = this;
    const transactions = this[$transactions];
    assert.ok(!released, 'connection already released');
    await new Promise((resolve, reject) => {
      function onCompleted(err) {
        if (err) {
          debug(`Connection #${connectionId}: transaction start error.
  ${err}.`);
          reject(err);
        } else {
          debug(`Connection #${connectionId}: transaction started`);
          transactions.push({
            implicitCommit: options.implicitCommit
          });
          resolve();
        }
      }
      try {
        connection.beginTransaction(onCompleted, options.name, options.isolationLevel);
        debug(`Connection #${connectionId}: transaction starting`);
      } catch (err) {
        reject(err);
      }
    });
    return this;
  }

  async commitTransaction() {
    const { connection, connectionId, released } = this;
    assert.ok(!released, 'connection already released');
    let trans = this[$transactions].pop();
    assert.ok(trans, 'this.transactionStarted');
    await new Promise((resolve, reject) => {
      function onCompleted(err) {
        if (err) {
          debug(`Connection #${connectionId}: transaction commit error.
  ${err}.`);
          reject(err);
        } else {
          debug(`Connection #${connectionId}: transaction commit complete.`);
          resolve();
        }
      }
      try {
        connection.commitTransaction(onCompleted);
        debug(`Connection #${connectionId}: transaction commit started`);
      } catch (err) {
        reject(err);
      }
    });
    return this;
  }

  async rollbackTransaction() {
    const { connection, connectionId, released } = this;
    assert.ok(!released, 'connection already released');
    let trans = this[$transactions].pop();
    assert.ok(trans, 'this.transactionStarted');
    await new Promise((resolve, reject) => {
      function onCompleted(err) {
        if (err) {
          debug(`Connection #${connectionId}: transaction rollback error.
  ${err}.`);
          reject(err);
        } else {
          debug(`Connection #${connectionId}: transaction rollback complete.`);
          resolve();
        }
      }
      try {
        connection.rollbackTransaction(onCompleted);
        debug(`Connection #${connectionId}: transaction rollback started.`);
      } catch (err) {
        reject(err);
      }
    });
    return this;
  }

  async run(runnables, release) {
    const actions = (Array.isArray(runnables)) ? runnables : [runnables];
    const { connection, released } = this;
    assert.ok(!released, 'connection already released');
    let i = -1;
    const len = actions.length;
    const res = [];
    try {
      while (++i < len) {
        const action = actions[i];
        const beg = process.hrtime();
        if (typeof (action) === 'function') {
          await action(connection);
        } else if (typeof (action) === 'object' && action.run) {
          await action.run(connection);
        } else {
          throw Error(`Unrecognized runnable: ${action}. Runnables should be functions with arity 1, taking a connection and returning a Promise. A runnable may also be an object with a public method called 'run' having the runnable signature.`);
        }
        const hrtime = process.hrtime(beg);
        res.push({ hrtime });
      }
    } finally {
      if (release) {
        await this.release();
      }
    }
    return res;
  }

  queryRows(query, each, release) {
    const { connection, released } = this;
    assert.ok(!released, 'connection already released');
    return new Promise((resolve, reject) => {
      let id = queryCount++;
      let beg = process.hrtime();

      function onCompleted(err, rowCount) {
        if (err) {
          debug(`query #${id} error: ${err}`);
          if (release) {
            this.release()
              .then(() => reject(err))
              .catch(() => reject(err));
          } else {
            reject(err);
          }
        } else {
          let hrtime = process.hrtime(beg);
          debug(`query #${id} resulted in ${rowCount} rows`);
          if (release) {
            this.release()
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
      connection.execSql(req);
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

module.exports = Connection.Connection = Connection;
