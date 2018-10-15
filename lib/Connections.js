
const debug = require('debug')('mssql:connections');
const assert = require('assert-plus');
const crypto = require('crypto');
const tds = require('tedious');
const _ = require('lodash');
const EventEmitter = require('events').EventEmitter;

const genPool = require('generic-pool');
const { Connection } = require('./Connection');

const $poolHashId = Symbol('poolHashId');
const $poolId = Symbol('poolId');
const $pools = Symbol('pools');
const $drained = Symbol('drained');
const $connectionId = Symbol('connectionId');
const $connected = Symbol('connected');

const $configDbname = Symbol('configDbName');
const $currentDbname = Symbol('currentDbName');

const MINIMUM_POOLED_CONNECTIONS = 2;
const MAXIMUM_POOLED_CONNECTIONS = 10;
const IDLE_TIMEOUT_MILLISECONDS = -1;
const LOG_CONNECTION_POOL = false;

let poolIdSeed = -1;
let connectionIdSeed = -1;

function generatePoolHashId(config) {
  let sha = crypto.createHash('sha256');
  sha.update(JSON.stringify(config));
  return sha.digest('hex');
}

function ensurePoolId(config) {
  assert.object(config, 'config');
  if (!config[$poolHashId]) {
    config[$poolHashId] = generatePoolHashId(config);
  }
  return config[$poolHashId];
}

function safeDescribeConnection(config) {
  return JSON.stringify(_.omit(config, ['password', 'cryptoCredentialsDetails']));
}

function possiblyForceDatabaseChange(cn) {
  // if the connection has changed databases, change it back to what the caller
  // expects; otherwise they may end up with surprising results (wrong or no data).
  if (cn[$configDbname] &&
    cn[$configDbname].toUpperCase() !== cn[$currentDbname].toUpperCase()) {
    return new Promise((resolve, reject) => {
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
  return Promise.resolve(cn);
}

class Connections extends EventEmitter {

  constructor(options) { // eslint-disable-line complexity
    var opt = options || {};
    assert.optionalNumber(opt.minPooledConnections, 'options.minPooledConnections');
    assert.optionalNumber(opt.maxPooledConnections, 'options.maxPooledConnections');
    assert.optionalNumber(opt.idleTimeoutMillis, 'options.idleTimeoutMillis');
    assert.optionalNumber(opt.evictionRunIntervalMillis, 'options.evictionRunIntervalMillis');
    assert.optionalBool(opt.validateOnAcquire, 'options.validateOnAcquire');
    super();
    Object.defineProperties(this, {
      minPooledConnections: {
        enumerable: true,
        value: opt.minPooledConnections || MINIMUM_POOLED_CONNECTIONS
      },
      maxPooledConnections: {
        enumerable: true,
        value: opt.maxPooledConnections || MAXIMUM_POOLED_CONNECTIONS
      },
      idleTimeoutMillis: {
        enumerable: true,
        value: opt.idleTimeoutMillis || IDLE_TIMEOUT_MILLISECONDS
      },
      evictionRunIntervalMillis: {
        enumerable: true,
        value: opt.evictionRunIntervalMillis || 0
      },
      validateOnAcquire: {
        enumerable: true,
        value: opt.validateOnAcquire || false
      },
      underlyingConnectionPoolLogger: {
        value: opt.log || LOG_CONNECTION_POOL
      },
      loggingUnderlyingConnectionPool: {
        enumerable: true,
        get: () => typeof (this.underlyingConnectionPoolLogger) === 'object'
      },
      debugListenInfo: {
        enumerable: true,
        value: opt.debugListenInfo || false
      }
    });
    this[$pools] = new Map();
    debug('Connections created');
  }

  drain() {
    var all = [];

    for (let value of this[$pools].values()) {
      if (!value[$drained]) {
        value[$drained] = true;
        all.push(
          Promise.resolve(value)
            .then(cn => {
              debug(`Connections - draining: ${cn[$poolId]}.`);
              return cn.drain()
                .then(() => {
                  debug(`Connections - clear: ${cn[$poolId]}.`);
                  return cn.clear();
                });
            }));
      }
    }
    return Promise.all(all);
  }

  $handleConnectionErrors(error, connection) {
    const listeners = this.listeners('connection-error');
    if (listeners.length) {
      this.emit('connection-error', { error, connection });
    } else throw error;
  }

  createNewPool(poolHashId, config) {
    assert.string(poolHashId, 'poolHashId');
    assert.object(config, 'config');
    assert.optionalObject(config.options, 'config.options');
    config.options = config.options || { encrypt: true };
    config.options.encrypt = typeof config.options.encrypt !== 'boolean' ? config.options.encrypt : false;
    let poolId = ++poolIdSeed;
    debug(`Connection pool #${poolId}: (${poolHashId}): ${safeDescribeConnection(config)}.`);
    let pool = genPool.createPool({
      name: poolHashId,
      create: () => new Promise((resolve, reject) => {
        var cn = new tds.Connection(config);
        cn[$connectionId] = ++connectionIdSeed;
        cn[$configDbname] = config.database || '';
        debug(`Connections #${poolId}; connection attempt: #${cn[$connectionId]}`);
        cn.on('end', () => {
          cn[$connected] = false;
          debug(`Connections #${poolId}; connection end: #${cn[$connectionId]}`);
        });
        cn.on('connect', (err) => {
          if (err) {
            debug(`Connections #${poolId}; connection errored: #${cn[$connectionId]} - ${err.stack || err}`);
            cn[$connected] = false;
            reject(err);
          } else {
            debug(`Connections #${poolId}; connection connected: #${cn[$connectionId]}`);
            cn[$connected] = true;
            resolve(cn);
          }
        });
        if (this.optDebugListenInfo) {
          cn.on('infoMessage', debug);
          cn.on('languageChange', debug);
          cn.on('charsetChange', debug);
        }
        cn.on('databaseChange', (dbname) => cn[$currentDbname] = dbname);
        cn.on('errorMessage', debug);
        cn.on('error', (err) => this.$handleConnectionErrors(err, cn));
        cn[$connected] = false;
        Object.defineProperties(cn, {
          connected: {
            enumerable: true,
            get: () => cn[$connected]
          }
        });
      }),
      destroy: (cn) => new Promise((resolve) => {
        if (cn.connected) {
          cn.once('end', () => resolve());
          cn.close();
        } else {
          // not connected.
          resolve();
        }
      }),
      validate: (cn) => Promise.resolve(cn.connected)
    }, {
        max: this.maxPooledConnections,
        min: this.minPooledConnections,
        fifo: false,
        idleTimeoutMillis: this.idleTimeoutMillis,
        testOnBorrow: this.validateOnAcquire,
        evictionRunIntervalMillis: this.evictionRunIntervalMillis,
        log: this.underlyingConnectionPoolLogger
      });
    pool[$poolId] = poolId;
    return pool;
  }

  connect(config) {
    var poolHashId = ensurePoolId(config);
    var pool = this[$pools].get(poolHashId);
    if (!pool) {
      pool = this.createNewPool(poolHashId, config);
      this[$pools].set(poolHashId, pool);
    }
    return pool.acquire()
      .then(possiblyForceDatabaseChange)
      .then(cn => new Connection(pool, cn, cn[$connectionId]));
  }

  pool(config) {
    var poolHashId = ensurePoolId(config);
    return this[$pools].get(poolHashId);
  }

}

let singleton;

function create(options, useAsSingleton) {
  return new Promise((resolve, reject) => {
    try {
      let pool = new Connections(options);
      if (useAsSingleton) {
        if (singleton) {
          throw new Error('Invalid operation; unable to re-assign singleton. This can only be used before an implicit or explicit singleton is created.');
        }
        singleton = pool;
        debug('Connections singleton established explicitly during create.');
      }
      resolve(pool);
    } catch (err) {
      reject(err);
    }
  });
}

function connect(config) {
  if (!singleton) {
    singleton = new Connections();
    debug('Connections singleton established implicitly during connect.');
  }
  return singleton.connect(config);
}

function drain() {
  if (singleton) {
    return singleton.drain();
  }
  return Promise.resolve();
}

// Attach module level methods...
Connections.create = create;
Connections.connect = connect;
Connections.drain = drain;
// Re-export
Connections.tds = tds;

module.exports = Connections;
