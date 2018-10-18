
const { log } = require('util');
const { Connections } = require('../'); // mssql-ease

require('../test/config-from-env');

(async () => {
  let rows = 0;
  function onEach(row) {
    if (++rows < 100) {
      log(JSON.stringify(row, null, '  '));
    }
  }

  const pool = await Connections.create();
  try {
    const cn = await pool.connect(process.env.MSSQL_CONNECTION);
    try {
      const stats = await cn.procedure('sp_columns')
        .executeRows(
          onEach, (binder, TYPES) => binder.addParameter('table_name', TYPES.NVarChar, '%'),
          true);
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
