<<<<<<< HEAD
=======
/*eslint no-console: 0 */
>>>>>>> master

const { log } = require('util');
const { Connections } = require('../'); // mssql-ease

require('../test/config-from-env');

let count = -1;
function onEach(row) {
  if (++count < 10) {
    log(JSON.stringify(row, null, '  '));
  }
}

<<<<<<< HEAD
(async () => {
  const pool = await Connections.create();
  try {
    const cn = await pool.connect(process.env.MSSQL_CONNECTION);
    try {
      await cn.beginTransaction({ implicitCommit: true });
      const stmt = await cn.statement('sp_columns @table_name');
      const stats = await stmt.executeObjects(onEach, (binder, TYPES) => {
        binder.addParameter('table_name', TYPES.NVarChar, 'S%');
      }, true);
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
=======
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
>>>>>>> master
