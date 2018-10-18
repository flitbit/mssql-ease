
const debug = require('debug')('mssql:statement');
const assert = require('assert-plus');
const tds = require('tedious');

const xutil = require('./xutil');

const $connection = Symbol();
const $statement = Symbol();
const $id = Symbol();

let idSeed = 0;
let statementCount = 0;

class SqlStatement {

  constructor(connection, statement) {
    assert.object(connection, 'connection');
    this[$connection] = connection;
    this[$statement] = statement;
    this[$id] = idSeed++;
    debug(`SqlStatement #${this[$id]} created: ${this[$statement]}`);
  }

  get connection() {
    return this[$connection];
  }

  executeRows(onEach, onBind, release) {
    onEach = (Array.isArray(onEach)) ? onEach : [onEach];
    assert.arrayOfFunc(onEach, 'onEach');
    assert.optionalFunc(onBind, 'onBind');
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
        debug(`SqlStatement #${self[$id]}:${id} resultset: ${resultCount}.`);
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
          debug(`SqlStatement #${id} error: ${err}`);
          if (release) {
            self.connection.release()
              .then(() => reject(err))
              .catch(() => reject(err));
          } else {
            reject(err);
          }
        }
      }

      function done(unused, more, returnStatus) {
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
            }
          };
          if (returnStatus !== undefined) {
            result.returnStatus = returnStatus;
          }
          if (outputCount) {
            result.outputParameters = outputParameters;
          }
          debug(`SqlStatement #${self[$id]}:${id} ${rowSum} rows in ${hrtime[0]}s ${hrtime[1] / 1000000}ms`);
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
        let req = new tds.Request(self[$statement], onCompleted);
        debug(`SqlStatement #${self[$id]}:${id}: ${self[$statement]}`);
        req.on('returnValue', onReturnValue);
        req.on('row', onRow);
        req.on('error', reject);
        //req.on('done', done);
        //req.on('doneProc', done);
        req.on('requestCompleted', done);
        req.on('columnMetadata', onColumnMetadata);
        if (typeof (onBind) === 'function') {
          debug(`SqlStatement #${self[$id]}:${id} caller supplied bind`);
          onBind(req, tds.TYPES);
        }
        debug(`SqlStatement #${self[$id]}:${id}: executing`);
        cn.execSql(req);
      } catch (err) {
        reject(err);
      }
    });
  }

  executeObjects(onEach, onBind, release) {
    onEach = (Array.isArray(onEach)) ? onEach : [onEach];
    assert.arrayOfFunc(onEach, 'onEach');
    assert.optionalFunc(onBind, 'onBind');
    assert.optionalBool(release, 'release');

    onEach = onEach.reduce((acc, each) => {
      acc.push(xutil.transformColumnsToObject.bind(null, each));
      return acc;
    }, []);
    return this.executeRows(onEach, onBind, release);
  }

}

function create(connection, statement) {
  return new Promise((resolve, reject) => {
    try {
      resolve(new SqlStatement(connection, statement));
    } catch (err) {
      reject(err);
    }
  });
}

// Attach module level methods...
SqlStatement.create = create;

module.exports = SqlStatement;
