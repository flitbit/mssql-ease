
const debug = require('debug')('mssql:statement');
const assert = require('assert-plus');
const tds = require('tedious');

const xutil = require('./xutil');

let idSeed = 0;
let statementCount = 0;

class SqlStatement {

  constructor(connection, statement) {
    assert.object(connection, 'connection');
    // in order to destructure internally...
    Object.defineProperties(this, {
      connection: {
        enumerable: true,
        value: connection
      },
      statement: {
        enumerable: true,
        value: statement
      },
      id: {
        enumerable: true,
        value: idSeed++
      }
    });
    debug(`SqlStatement #${this.id} created: ${this.statement}`);
  }

  async execute(onBind, release) {
    assert.optionalFunc(onBind, 'onBind');
    assert.optionalBool(release, 'release');
    let { connection: { connection: cn }, statement, id } = this;
    try {
      const statementId = statementCount++;
      const beg = process.hrtime();
      const output = Object.create(null);
      const capture = Object.create(null);
      capture.outputCount = 0;

      await new Promise((resolve, reject) => {
        let req = new tds.Request(statement, (err, rowCount) => {
          if (err) {
            debug(`Statement #${id}:${statementId} error: ${err}`);
            reject(err);
            return;
          }
          const hrtime = process.hrtime(beg);
          capture.stats = { rowCount, hrtime };
          debug(`StoredProcedure #${id}:${statementId} ${rowCount} rows in ${hrtime[0]}s ${hrtime[1] / 1000000}ms`);
          resolve();
        });
        req.on('returnValue', (parameterName, value, metadata) => {
          capture.outputCount++;
          output[parameterName] = { value, metadata };
        });

        if (typeof (onBind) === 'function') {
          debug(`StoredProcedure #${id}:${statementId} caller supplied bind`);
          onBind(req, tds.TYPES);
        }
        debug(`StoredProcedure #${id}:${statementId}: calling procedure`);
        cn.execSql(req);
      });
      // surface the results of background processing...
      return (capture.outputCount) ?
        Object.assign(capture.stats, { output }) :
        capture.stats;
    } finally {
      if (release) {
        await cn.relese();
      }
    }
  }

  executeRows(onEach, onBind, release) {
    onEach = (Array.isArray(onEach)) ? onEach : [onEach];
    assert.arrayOfFunc(onEach, 'onEach');
    assert.optionalFunc(onBind, 'onBind');
    assert.optionalBool(release, 'release');
    let self = this;
    let { connection: { connection: cn }, statement, id } = this;

    return new Promise((resolve, reject) => {
      let statementId = statementCount++;
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
        debug(`SqlStatement #${id}:${statementId} resultset: ${resultCount}.`);
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
          debug(`SqlStatement #${id}:${statementId} error: ${err}`);
          if (release) {
            cn.release()
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
          debug(`SqlStatement #${id}:${statementId} ${rowSum} rows in ${hrtime[0]}s ${hrtime[1] / 1000000}ms`);
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
        let req = new tds.Request(statement, onCompleted);
        debug(`SqlStatement #${id}:${statementId}: ${statement}`);
        req.on('returnValue', onReturnValue);
        req.on('row', onRow);
        req.on('error', reject);
        //req.on('done', done);
        //req.on('doneProc', done);
        req.on('requestCompleted', done);
        req.on('columnMetadata', onColumnMetadata);
        if (typeof (onBind) === 'function') {
          debug(`SqlStatement #${id}:${statementId} caller supplied bind`);
          onBind(req, tds.TYPES);
        }
        debug(`SqlStatement #${id}:${statementId}: executing`);
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
