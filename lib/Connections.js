'use strict';

let debug = require('debug')('mssql:connections');
let assert = require('assert-plus');
let crypto = require('crypto');
let tds = require('tedious');
let _ = require('lodash');

let Pool = require('generic-pool').Pool;
let Connection = require('./Connection');

let $poolHashId = Symbol();
let $poolId = Symbol();
let $pools = Symbol();
let $optMin = Symbol();
let $optMax = Symbol();
let $optIdleTimeout = Symbol();
let $optDebugListenInfo = Symbol();
let $optLog = Symbol();
let $drained = Symbol();
let $connectionId = Symbol();

let $configDbname = Symbol();
let $currentDbname = Symbol();

const MINIMUM_POOLED_CONNECTIONS = 2;
const MAXIMUM_POOLED_CONNECTIONS = 10;
const IDLE_TIMEOUT_MILLISECONDS = 30000;
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

class Connections {

  constructor(options) {
    var opt = options || {};
    assert.optionalNumber(opt.minPooledConnections, 'options.minPooledConnections');
    assert.optionalNumber(opt.maxPooledConnections, 'options.maxPooledConnections');
    assert.optionalNumber(opt.idleTimeoutMillis, 'options.idleTimeoutMillis');
    this[$optMin] = opt.minPooledConnections || MINIMUM_POOLED_CONNECTIONS;
    this[$optMax] = opt.maxPooledConnections || MAXIMUM_POOLED_CONNECTIONS;
    this[$optIdleTimeout] = opt.idleTimeoutMillis || IDLE_TIMEOUT_MILLISECONDS;
    this[$optLog] = opt.log || LOG_CONNECTION_POOL;
    this[$optDebugListenInfo] = opt.debugListenInfo || false;
    this[$pools] = new Map();
    debug('Connections created');
  }

  drain() {
    var all = [];

    function drainOne(pool, resolve) {
      pool.drain(() => {
        pool.destroyAllNow();
        debug(`Connections drained: ${pool[$poolId]}.`);
        resolve();
      });
    }
    for (let value of this[$pools].values()) {
      let capture = value;
      if (!value[$drained]) {
        value[$drained] = true;
        debug(`Connections draining: ${capture[$poolId]}.`);
        all.push(new Promise(drainOne.bind(this, capture)));
      }
    }
    return Promise.all(all);
  }

  createNewPool(poolHashId, config) {
    assert.string(poolHashId, 'poolHashId');
    assert.object(config, 'config');
    let poolId = ++poolIdSeed;
    debug(`Connection pool #${poolId}: (${poolHashId}): ${safeDescribeConnection(config)}.`);
    let pool = Pool({
      name: poolHashId,
      create: (callback) => {
        var cn = new tds.Connection(config);
        cn[$connectionId] = ++connectionIdSeed;
        cn[$configDbname] = config.database || '';
        debug(`Connections #${poolId}; connection attempt: #${cn[$connectionId]}`);
        cn.on('connect', (err) => {
          if (err) {
            debug(`Connections #${poolId}; connection errored: #${cn[$connectionId]} - ${err}`);
            callback(err);
          } else {
            debug(`Connections #${poolId}; connection connected: #${cn[$connectionId]}`);
            callback(null, cn);
          }
        });
        if (this[$optDebugListenInfo]) {
          cn.on('infoMessage', debug);
          cn.on('languageChange', debug);
          cn.on('charsetChange', debug);
        }
        cn.on('databaseChange', (dbname) => cn[$currentDbname] = dbname);
        cn.on('errorMessage', debug);
      },
      destroy: function(cn) {
        cn.close();
        debug(`Connections #${poolId}; connection destroyed: #${cn[$connectionId]}`);
      },
      validate: function(cn) {
        if (!cn.connected) {
          debug(`Connections #${poolId}; connection dead: #${cn[$connectionId]}`);
        }
        return cn.connected;
      },
      max: this[$optMax],
      min: this[$optMin],
      idleTimeoutMillis: this[$optIdleTimeout],
      log: this[$optLog]
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
    return new Promise((resolve, reject) => {
      pool.acquire((err, cn) => {
        if (err) {
          reject(err);
        } else {
          possiblyForceDatabaseChange(cn)
            .then(() => resolve(new Connection(pool, cn, cn[$connectionId])))
            .catch(reject);
        }
      });
    });
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
        debug(`Connections singleton established explicitly during create.`);
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
    debug(`Connections singleton established implicitly during connect.`);
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
