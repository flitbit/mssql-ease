/*eslint no-console: 0 */
'use strict';

var mssql = require('../'); // mssql-ease

var config = require('./config-from-env');

mssql.connect(config)
  .then(cn => {
    var depends = [];
    var dependents = [];

    function onDepends(obj) {
      depends.push(obj);
    }

    function onDependents(obj) {
      dependents.push(obj);
    }

    cn.procedure('sp_depends')
      .executeObjects(
        [onDepends, onDependents],
        (binder, TYPES) => binder.addParameter('objname', TYPES.NVarChar, 'User.FriendsOfFriendsView'),
        true)
      .then(stats => {
        console.log(JSON.stringify(depends, null, '  '));
        console.log(JSON.stringify(dependents, null, '  '));
        console.log(JSON.stringify(stats, null, '  '));
      });
  })
  .catch(err => console.log(`Unexpected error: ${err.message}`))
  .then(() => mssql.drain());
