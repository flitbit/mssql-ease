/*eslint no-console: 0 */
'use strict';

var mssql = require('../'); // mssql-ease
var config = require('./config-from-env');

mssql.connect(config)
  .then(cn => {
    var rows = [];

    function onEach(row) {
      rows.push(row);
    }

    cn.statement(`SELECT *
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME LIKE @table_name`)
      .executeObjects(onEach, (binder, TYPES) => {
        binder.addParameter('table_name', TYPES.NVarChar, 'S%');
      }, true)
      .then(stats => {
        console.log(JSON.stringify(rows, null, '  '));
        console.log(JSON.stringify(stats, null, '  '));
      });
  })
  .catch(err => console.log(`Unexpected error: ${err}`))
  .then(() => mssql.drain());
