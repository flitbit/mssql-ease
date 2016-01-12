'use strict';

let debug = require('debug')('mssql:procedure');
let assert = require('assert-plus');
let tds = require('tedious');

let xutil = require('./xutil');

let $connection = Symbol();
let $dbobject = Symbol();
let $id = Symbol();

let idSeed = 0;
let statementCount = 0;

class StoredProcedure {

  constructor(connection, dbobject) {
    assert.object(connection, 'connection');
    this[$connection] = connection;
    this[$dbobject] = dbobject;
    this[$id] = idSeed++;
    debug(`StoredProcedure #${this[$id]} created: ${this[$dbobject]}`);
  }

  get connection() {
    return this[$connection];
  }

  execute(onBind, release) {
    assert.func(onBind, 'onBind');
    assert.optionalBool(release, 'release');
    let self = this;
    let cn = this[$connection].connection;

    return new Promise((resolve, reject) => {
      let id = statementCount++;
      let beg = process.hrtime();
      let outputCount = 0;
      let output = Object.create(null);

      function onReturnValue(parameterName, value, metadata) {
        output[parameterName] = {
          value,
          metadata
        };
      }

      function onCompleted(err, rowCount) {
        if (err) {
          debug(`StoredProcedure #${id} error: ${err}`);
          if (release) {
            self.connection.release()
              .then(() => reject(err))
              .catch(() => reject(err));
          } else {
            reject(err);
          }
        } else {
          let hrtime = process.hrtime(beg);
          let result = {
            stats: {
              rowCount,
              hrtime
            }
          };
          if (outputCount) {
            result.output = output;
          }
          debug(`StoredProcedure #${self[$id]}:${id} ${rowCount} rows in ${hrtime[0]}s ${hrtime[1]/1000000}ms`);
          if (release) {
            self.connection.release()
              .then(() => resolve(result))
              .catch(reject);
          } else {
            resolve(result);
          }
        }
      }

      try {
        let req = new tds.Request(self[$dbobject], onCompleted);
        debug(`StoredProcedure #${self[$id]}:${id}: ${self[$dbobject]}`);
        req.on('returnValue', onReturnValue);
        if (typeof(onBind) === 'function') {
          debug(`StoredProcedure #${self[$id]}:${id} caller supplied bind`);
          onBind(req, tds.TYPES);
        }
        debug(`StoredProcedure #${self[$id]}:${id}: calling procedure`);
        cn.callProcedure(req);
      } catch (err) {
        reject(err);
      }
    });
  }

  executeRows(onEach, onBind, release) {
    onEach = (Array.isArray(onEach)) ? onEach : [onEach];
    assert.arrayOfFunc(onEach, 'onEach');
    assert.func(onBind, 'onBind');
    assert.optionalBool(release, 'release');
    let self = this;
    let cn = this[$connection].connection;

    return new Promise((resolve, reject) => {
      let id = statementCount++;
      let beg = process.hrtime();
      let outputCount = 0;
      let outputParameters = Object.create(null);
      let resultCount = -1;
      let rowCount = 0;
      let rowSum = 0;
      let rowCounts = [];

      function onColumnMetadata() {
        if (~resultCount) {
          rowCounts.push(rowCount);
          rowSum += rowCount;
          rowCount = 0;
        }
        resultCount++;
        debug(`StoredProcedure #${self[$id]}:${id} resultset: ${resultCount}.`);
      }

      function onRow(row) {
        rowCount++;
        if (resultCount < onEach.length) {
          onEach[resultCount](row);
        }
      }

      function onReturnValue(parameterName, value, metadata) {
        outputCount++;
        outputParameters[parameterName] = {
          value,
          metadata
        };
      }

      function onCompleted(err) {
        if (err) {
          debug(`StoredProcedure#${id} error: ${err}.`);
          if (release) {
            self.connection.release()
              .then(() => reject(err))
              .catch(() => reject(err));
          } else {
            reject(err);
          }
        }
      }

      function doneProc(unused, more, returnStatus) {
        if (!more) {
          let hrtime = process.hrtime(beg);
          if (~resultCount) {
            rowCounts.push(rowCount);
            rowSum += rowCount;
          }
          resultCount++;
          let result = {
            stats: {
              hrtime,
              resultCount,
              rowCounts
            },
            returnStatus
          };
          if (outputCount) {
            result.outputParameters = outputParameters;
          }
          debug(`StoredProcedure #${self[$id]}:${id} ${rowSum} rows in ${hrtime[0]}s ${hrtime[1] / 1000000}ms`);
          if (release) {
            self.connection.release()
              .then(() => resolve(result))
              .catch(reject);
          } else {
            resolve(result);
          }
        }
      }

      try {
        let req = new tds.Request(self[$dbobject], onCompleted);
        debug(`StoredProcedure #${self[$id]}:${id}: ${self[$dbobject]}`);
        req.on('returnValue', onReturnValue);
        req.on('row', onRow);
        req.on('doneProc', doneProc);
        req.on('columnMetadata', onColumnMetadata);
        if (typeof(onBind) === 'function') {
          debug(`StoredProcedure #${self[$id]}:${id} caller supplied bind`);
          onBind(req, tds.TYPES);
        }
        debug(`StoredProcedure #${self[$id]}:${id}: calling procedure`);
        cn.callProcedure(req);
      } catch (err) {
        reject(err);
      }
    });
  }

  executeObjects(onEach, onBind, release) {
    onEach = (Array.isArray(onEach)) ? onEach : [onEach];
    assert.arrayOfFunc(onEach, 'onEach');
    assert.func(onBind, 'onBind');
    assert.optionalBool(release, 'release');

    onEach = onEach.reduce((acc, each) => {
      acc.push(xutil.transformColumnsToObject.bind(null, each));
      return acc;
    }, []);
    return this.executeRows(onEach, onBind, release);
  }

}

function create(connection, dbobject) {
  return new Promise((resolve, reject) => {
    try {
      resolve(new StoredProcedure(connection, dbobject));
    } catch (err) {
      reject(err);
    }
  });
}

// Attach module level methods...
StoredProcedure.create = create;

module.exports = StoredProcedure;
