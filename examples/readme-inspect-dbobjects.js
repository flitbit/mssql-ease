/*eslint no-console: 0 */

var path = require('path');
var util = require('util');

var mssql = require('../'); // mssql-ease
var xutil = require('../lib/xutil');

var config = require('./config-from-env');

mssql.create({
  minPooledConnections: 2,
  maxPooledConnections: 100,
  idleTimeoutMillis: 5000
}, true)
.then(pool => {
  pool.connect(config)
    .then(cn => {
      let sqlFile = path.normalize(path.join(__dirname, '../lib/tsql/dbobjects.sql'));
      let data = [];
      return xutil.loadFile(sqlFile, 'utf8')
        .then(query =>
          cn.queryObjects(query, (obj) => {
            data.push(obj);
          })
          .then(stats => {
            cn.release();
            data.forEach(d => util.log(util.inspect(d, false, 9)));
            util.log(`row count: ${stats.rowCount}, time: ${stats.hrtime[0]}s ${stats.hrtime[1] / 1000000}ms`);
          }));
    })
    .catch(err => util.log(util.inspect(err, false, 9)))
    .then(() => pool.drain());
});
