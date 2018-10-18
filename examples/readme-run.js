
const { log } = require('util');
const { tds, Connections } = require('../'); // mssql-ease

require('../test/config-from-env');

async function action(cn) {
  await new Promise((resolve, reject) => {
    let request = new tds.Request('SELECT * FROM INFORMATION_SCHEMA.TABLES', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
    let count = -1;
    request.on('row', columns => {
      if (++count < 10) {
        columns.forEach(col => log(`${col.metadata.colName}: ${col.value}
`));
      }
    });
    // the inner connection is a tedious connection...
    cn.execSql(request);
  });
}

(async () => {
  const pool = await Connections.create();
  try {
    const cn = await pool.connect(process.env.MSSQL_CONNECTION);
    try {
      const stats = await cn.run(action);
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
