/*eslint no-console: 0 */
'use strict';

var mssql = require('../'); // mssql-ease
var config = require('./config-from-env');

mssql.connect(config)
  .then(cn => {

    function onEach(row) {
      console.log(JSON.stringify(row, null, '  '));
    }

    cn.statement('sp_columns @table_name')
      .executeRows(onEach, (binder, TYPES) => {
        binder.addParameter('table_name', TYPES.VarChar, '%');
      }, true)
    .then(stats => console.log(JSON.stringify(stats, null, '  ')));
  })
  .catch(err => console.log(`Unexpected error: ${err.message}`))
  .then(() => mssql.drain());
