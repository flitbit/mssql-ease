
const { log } = require('util');
const { Connections } = require('../'); // mssql-ease

require('../test/config-from-env');

function onEach(row) {
  log(JSON.stringify(row, null, '  '));
}

(async () => {
  const pool = await Connections.create();
  try {
    const cn = await pool.connect(process.env.MSSQL_CONNECTION);
    try {
      const stats = await cn.statement(`SELECT *
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME LIKE @table_name`)
        .executeObjects(onEach, (binder, TYPES) => {
          binder.addParameter('table_name', TYPES.NVarChar, 'S%');
        });
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
