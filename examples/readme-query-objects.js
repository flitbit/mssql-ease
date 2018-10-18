
const { log } = require('util');
const { Connections } = require('../'); // mssql-ease

require('../test/config-from-env');

function each(obj) {
  log(JSON.stringify(obj, null, '  '));
}

(async () => {

  const pool = await Connections.create();
  try {
    const cn = await pool.connect(process.env.MSSQL_CONNECTION);
    try {
      const stats = await cn.queryObjects('SELECT * FROM INFORMATION_SCHEMA.TABLES', each);
      log(JSON.stringify(stats, null, '  '));
    } finally {
      await cn.release();
    }
  } catch (err) {
    log(`An unexpected error occurred: ${err.stack || err}`);
  } finally {
    await pool.drain();
  }
})();
