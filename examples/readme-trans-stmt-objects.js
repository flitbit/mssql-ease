/*eslint no-console: 0 */

var mssql = require('../'); // mssql-ease
var config = require('./config-from-env');

mssql.connect(config)
  .then(cn => {
    var rows = [];

    function onEach(row) {
      rows.push(row);
    }

    cn.beginTransaction({ implicitCommit: true })
      .then(() => cn.statement('sp_columns @table_name')
        .executeObjects(onEach, (binder, TYPES) => {
          binder.addParameter('table_name', TYPES.NVarChar, '%');
        }, true)
        .then(stats => {
          // console.log(JSON.stringify(rows, null, '  '));
          console.log(JSON.stringify(stats, null, '  '));
        }));
  })
  .catch(err => console.log(`Unexpected error: ${err.message}`))
  .then(() => mssql.drain());
