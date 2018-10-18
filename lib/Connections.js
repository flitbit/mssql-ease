
const debug = require('debug')('mssql:connections');
const assert = require('assert-plus');
const crypto = require('crypto');
const tds = require('tedious');
const _ = require('lodash');
const EventEmitter = require('events').EventEmitter;
const { ConnectionString } = require('./connection-string');
const { TdsConnector } = require('./tds-connector');

const genPool = require('generic-pool');
const { Connection } = require('./connection');

const DEFAULT_OPTIONS = {
  evictionRunIntervalMillis: 30000,
  max: 10
};

const $poolHashId = Symbol('poolHashId');
const $poolId = Symbol('poolId');
const $pools = Symbol('pools');
const $options = Symbol('options');

const $configDbname = Symbol('configDbName');
const $currentDbname = Symbol('currentDbName');

let __poolId = 0;

function generatePoolHashId(config) {
  let sha = crypto.createHash('sha256');
  sha.update(JSON.stringify(config));
  return sha.digest('hex');
}

function ensurePoolId(obj) {
  assert.object(obj, 'obj');
  if (!obj[$poolHashId]) {
    obj[$poolHashId] = generatePoolHashId(obj);
  }
  return obj[$poolHashId];
}

function safeDescribeConnection(config) {
  return JSON.stringify(_.omit(config, ['password', 'cryptoCredentialsDetails']));
}

async function possiblyForceDatabaseChange(cn) {
  // if the connection has changed databases, change it back to what the caller
  // expects; otherwise they may end up with surprising results (wrong or no data).
  if (cn[$configDbname] &&
    cn[$configDbname].toUpperCase() !== cn[$currentDbname].toUpperCase()) {
    return await new Promise((resolve, reject) => {
      let req = new tds.Request(`USE [${cn[$configDbname]}]`, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(cn);
        }
      });
      cn.execSqlBatch(req);
    });
  }
  return cn;
}

let singleton;

class Connections extends EventEmitter {

  static get defaultOptions() { return DEFAULT_OPTIONS; }

  static async create(options, useAsSingleton) {
    let pool = new Connections(options);
    if (useAsSingleton) {
      if (singleton) {
        throw new Error('Invalid operation; unable to re-assign singleton. This can only be used before an implicit or explicit singleton is created.');
      }
      singleton = pool;
      debug('Connections singleton established explicitly during create.');
    }
    return pool;
  }

  static async connect(connectionStr) {
    if (!singleton) {
      singleton = new Connections();
      debug('Connections singleton established implicitly during connect.');
    }
    return await singleton.connect(connectionStr);
  }

  static async drain() {
    if (singleton) {
      await singleton.drain();
    }
  }

  constructor(options) {
    super();
    this[$pools] = Object.create(null);
    this[$options] = Object.assign({}, options || DEFAULT_OPTIONS);
    debug('Connections created');
  }

  async drain() {
    var all = [];

    const pools = this[$pools];
    const keys = Object.keys(pools);
    let i = -1;
    const len = keys.length;
    while (++i < len) {
      const pool = pools[keys[i]];
      all.push(pool.drain().then(() => pool.clear()));
    }
    return await Promise.all(all);
  }

  $handleConnectionErrors(error, connection) {
    const listeners = this.listeners('connection-error');
    if (listeners.length) {
      this.emit('connection-error', { error, connection });
    } else { throw error; }
  }

  createPool(connectionStr, config) {
    if (typeof connectionStr === 'string') {
      connectionStr = new ConnectionString(connectionStr);
    }
    const poolHashId = ensurePoolId(connectionStr);
    let poolId = ++__poolId;
    debug(`Connection pool #${poolId}: (${poolHashId}): ${safeDescribeConnection(config)}.`);
    const connector = new TdsConnector(connectionStr);
    const pool = genPool.createPool(connector, config || this[$options]);
    pool[$poolId] = poolId;
    this[$pools][poolHashId] = pool;
    return pool;
  }

  /**
   * Connects to the SqlServer instance specified by the connection string provided.
   * @param {string | object} connectionStr Either a connection string or a ConnectionString object.
   */
  async connect(connectionStr) {
    if (typeof connectionStr === 'string') {
      connectionStr = new ConnectionString(connectionStr);
    }
    const pool = this.pool(connectionStr) || this.createPool(connectionStr);
    const cn = await pool.acquire();
    await possiblyForceDatabaseChange(cn);
    return new Connection(pool, cn, TdsConnector.connectionId(cn));
  }

  pool(connectionStr) {
    if (typeof connectionStr === 'string') {
      connectionStr = new ConnectionString(connectionStr);
    }
    assert.object(connectionStr, 'connectionStr');
    const poolHashId = ensurePoolId(connectionStr);
    return this[$pools][poolHashId];
  }

}

Connections.tds = tds;
module.exports = Connections.Connections = Connections;
