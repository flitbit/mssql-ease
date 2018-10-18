const { log } = require('util');
const { Connections } = require('../'); // mssql-ease
require('../test/config-from-env');

(async () => {
  const depends = [];
  const dependents = [];

  function onDepends(obj) {
    depends.push(obj);
  }

  function onDependents(obj) {
    dependents.push(obj);
  }

  const pool = await Connections.create();
  try {
    const cn = await pool.connect(process.env.MSSQL_CONNECTION);
    try {
      const stats = await cn.procedure('sp_depends')
        .executeObjects(
          [onDepends, onDependents],
          (binder, TYPES) => binder.addParameter('objname', TYPES.NVarChar, 'User.FriendsOfFriendsView'),
          true);
      log(JSON.stringify(depends, null, '  '));
      log(JSON.stringify(dependents, null, '  '));
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
