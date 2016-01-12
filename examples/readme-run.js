/*eslint no-console: 0 */
'use strict';

var mssql = require('../'); // mssql-ease
var config = require('./config-from-env');

mssql.connect(config)
  .then(connection => {
    // connection has some worthwhile convenience methods...
    connection.run(
        cn => new Promise((resolve, reject) => {
          // the inner connection is a tedious connection...
          let request = new mssql.tds.Request('SELECT * FROM INFORMATION_SCHEMA.TABLES', (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
          request.on('row', columns => {
            columns.forEach(col => console.log(`${col.metadata.colName}: ${col.value}`));
            console.log();
          });
          cn.execSql(request);
        }))
      .catch(err => console.log(`Unexpected error: ${err}.`))
      .then(() => connection.release());
  })
  .catch(err => console.log(`Unexpected error: ${err}.`))
  .then(() => mssql.drain());
