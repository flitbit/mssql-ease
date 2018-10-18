
const { log } = require('util');
const { Connections } = require('../'); // mssql-ease

require('../test/config-from-env');

let count = -1;
function onEach(row) {
  if (++count < 10) {
    log(JSON.stringify(row, null, '  '));
  }
}

(async () => {

  const pool = await Connections.create();
  try {
    const cn = await pool.connect(process.env.MSSQL_CONNECTION);
    try {
      const stats = await cn.queryRows('SELECT * FROM INFORMATION_SCHEMA.COLUMNS', onEach);
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
