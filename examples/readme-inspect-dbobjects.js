
const path = require('path');
const util = require('util');

const { Connections } = require('../'); // mssql-ease
const xutil = require('../lib/xutil');

require('../test/config-from-env');

(async () => {
  const pool = await Connections.create();
  try {
    const cn = await pool.connect(process.env.MSSQL_CONNECTION);
    try {
      const sqlFile = path.normalize(path.join(__dirname, '../lib/tsql/dbobjects.sql'));
      const data = [];
      const query = await xutil.loadFile(sqlFile, 'utf8');
      const stats = await cn.queryObjects(query, (obj) => {
        data.push(obj);
      });
      data.forEach(d => util.log(util.inspect(d, false, 9)));
      util.log(`row count: ${stats.rowCount}, time: ${stats.hrtime[0]}s ${stats.hrtime[1] / 1000000}ms`);
    } finally {
      await cn.release();
    }
  } catch (err) {
    util.log(util.inspect(err, false, 9));
  } finally {
    await pool.drain();
  }
})();
