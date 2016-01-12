/*eslint no-console: 0 */
'use strict';

var mssql = require('../'); // mssql-ease
var config = require('./config-from-env');

function each(obj) {
  console.log(JSON.stringify(obj, null, '  '));
}

mssql.connect(config)
  .then(cn => {
    cn.queryObjects('SELECT * FROM INFORMATION_SCHEMA.TABLES', each, true)
      .then(stats => console.log(JSON.stringify(stats, null, '  ')));
  })
  .catch(err => console.log(`Unexpected error: ${err}`))
  .then(() => mssql.drain());
