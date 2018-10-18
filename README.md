# mssql-ease

Promise style _ease-of-use_ module for working with Microsoft SQL Server from Node.js.

`mssql-ease` builds on [`tedious`](http://tediousjs.github.io/tedious/index.html) in order to make it easy to work with Microsoft SQL Server databases in Node.js 4+ (ES6). It adds reliable connection pooling via [`generic-pool`](https://github.com/coopernurse/node-pool/tree/72b31a434c7b05ad879b2ace9830a9aa9fbba002), and implements a few light-weight wrapper classes that implement the _promise style_ and make working with SQL Server easy.

> NOTE: This module requires the ES6 features of Node.js, which means either 8+. It is only tested in 8+.

## Breaking Changes

### v2.0.0 2018-10-18

* Updated to latest tedious and generic-pool libraries.
* Added `ConnectionString` class and connection string parsing.
* Changed exports, the main entrypoint is the `Connections` class.

## Install

```bash
npm install --save mssql-ease
```

## Quick Start

```javascript
const { Connections } = require('mssql-ease');
const { log } = require('util');

const connections = await Connections.create();
try {
  const cn = await connections.connect('mssql://sa:s00per-secr3t@127.0.0.1:1433?database=master&encrypt=true');
  try {
    const stats = await cn.queryRows('SELECT * FROM INFORMATION_SCHEMA.COLUMNS', row => {
      log(JSON.stringify(row, null, '  '));
    });
    log(JSON.stringify(stats, null, '  '));
  } finally {
    await cn.release();
  }
} catch (err) {
  log(`An unexpected error occurred: ${err.stack || err}`);
} finally {
  await connections.drain();
}

```

The `Connections` class is actually a wrapper for an isolated pool of connections. Each unique connection results in a new connection pool underneath.

### Ad-hoc Queries

```javascript
const cn = await connections.connect('mssql://sa:s00per-secr3t@127.0.0.1:1433?database=master&encrypt=true');
try {

  // .queryObjects(sql, onEach, release): stats
  cn.queryObjects(
    'SELECT * FROM INFORMATION_SCHEMA.TABLES',
    // called for each row; prints as JSON
    (obj) => console.log(JSON.stringify(obj, null, '  '))
    );

} finally {
  await cn.release();
}
```

### Prepared Statements

```javascript
const cn = await connections.connect('mssql://sa:s00per-secr3t@127.0.0.1:1433?database=master&encrypt=true');
try {
  const rows = [];

  // .statement(stmt)
  const stats = cn.statement('sp_columns @table_name')
    // .executeObjects(onEach, binder, release)
    .executeObjects(
      // push each row to our collection...
      rows.push.bind(rows),
      // binder(statement, TYPES) is called to bind parameters in the statement
      (binder, TYPES) => binder.addParameter('table_name', TYPES.NVarChar, '%')
      );
  console.log(JSON.stringify(rows, null, '  '));
  console.log(JSON.stringify(stats, null, '  '));

} finally {
  await cn.release();
}
```

### Stored Procedures

```javascript
const cn = await connections.connect('mssql://sa:s00per-secr3t@127.0.0.1:1433?database=master&encrypt=true');
try {
  const rows = [];

  // .procedure(sprocName)
  const stats = cn.procedure('sp_columns')
    // .executeRows(onEach, binder, release)
    .executeRows(
      // push each row to our collection...
      rows.push.bind(rows),
      // binder(statement, TYPES) is called to bind parameters
      (binder, TYPES) => binder.addParameter('table_name', TYPES.NVarChar, '%')
      );
  console.log(JSON.stringify(rows, null, '  '));
  console.log(JSON.stringify(stats, null, '  '));

} finally {
  await cn.release();
}
```

### API

#### Connections Class

The `Connections` class manages one or more connection pools.

This is the main entrypoint into the module's capability. You can either construct your own instance or rely on the module as a singleton.

##### Static Properties

* `defaultOptions`: an object with the minimal, default connection pool options { evictionRunIntervalMillis: 30000, max: 10 }
* `create(config, useAsSingleton)`: creates a new instance, optionally using the instance as the module's singleton.
* `connect(connectionStr)`: creates a new connection, using the module's singleton.
* `drain()`: drains all connections from all of the singleton's pools.

##### Properties

* `connect(connectionStr)`: creates or borrows a connection.
* `drain()`: drains all connections from all of the pools managed by the instance.

###### #constructor(options)

```javascript
const { Connections } = require('mssql-ease');
const connections = new Connections(Connections.defaultOptions);
```

##### .connect(connectionStr)

Connects to the database described by the specified `connectionStr`, returning a `Promise` that is resolved when the connection is connected and available.

* `connectionStr`: either a connection string URL or a `ConnectionString` object.

> NOTE: A new connection pool is created for each unique `connectionStr` used, which may lead to memory pressure if you use a _config-per-user_ strategy. We recommend you use as few unique connection strings as you can get away with &mdash; well-designed db roles and a _config-per-role_  approach can provide good connection pool performance and good access control.

```javascript
const master = await connections.connect('mssql://sa:s00per-secr3t@127.0.0.1:1433?database=master&encrypt=true');
// or
const other = await connections.connect(new ConnectionString('mssql://sa:s00per-secr3t@127.0.0.1:1433?database=other&encrypt=true'));
```

#### .drain()

Drains the connection pools, closing all connections, returning a `Promise` that is resolved when all connections have closed.

```javascript
await connections.drain();
console.log('The connection pools have been drained!');
```

#### Connection Class

The `Connection` class encapsulates a connection pool connection and provides convenience methods for interacting with the underlying database and ensuring the connection gets released back to the pool.

_members:_
* `.procedure(dbobject)`
* `.statement(stmt)`
* `.queryObjects(query, onEach, release)`
* `.queryRows(query, onEach, release)`
* `.run(runnables, release)`
* `.beginTransaction(options)`
* `.commitTransaction()`
* `.rollbackTransaction()`

##### .procedure(dbobject)

Creates a `StoredProcedure` instance used to execute the stored procedure on the connection..

_arguements:_
* `dbobject` : _string, required_ &ndash; The name of the stored procedure.

_returns:_
* A `StoredProcedure` instance bound to the connection and the specified `dbobject`.

_example:_
```javascript
var sproc = connection.procedure('sp_columns')
```

The [`StoredProcedure` Class section below](#user-content-storedprocedure-class) documents how to work with stored procedures.

##### .statement(stmt)

Creates a `SqlStatement` instance. SQL statements enable parameterized queries.

_arguements:_
* `stmt` : _string, required_ &ndash; The SQL statement.

_returns:_
* A `SqlStatement` instance bound to the connection and the specified `stmt`.

_example:_
```javascript
var columnQuery = connection.statement(`SELECT *
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME LIKE @table_name`);
```

The [`SqlStatement` Class section below](#user-content-sqlstatement-class) documents how to work with SQL statements.

##### .queryObjects(query, onEach, release)

Executes the specified `query`, calling `onEach` for each returned row, optionally releasing the connection to the pool when completed.

This query method transforms each row into an object before calling the specified `onEach` function.

_arguements:_
* `query` : _string, required_ &ndash; The SQL query.
* `onEach` : _function, required_ &ndash; A callback invoked as each row is received.
* `release` : _boolean, optional_ &ndash; Indicates whether the connection should be returned to the pool when completed.

_returns:_
* An ES6 Promise object resolved with a `stats` object upon completion or rejected upon error.

_example:_
```javascript
var query = connection.queryObjects(
  'SELECT * FROM INFORMATION_SCHEMA.TABLES',
  obj => console.log(JSON.stringify(stats, null, '  ')),
  true)

query
  .then(stats => console.log(JSON.stringify(stats, null, '  ')))
  .catch(err => console.log(`Unexpected error: ${err}`))
```

##### .queryRows(query, onEach, release)

Executes the specified `query`, calling `onEach` for each returned row, optionally releasing the connection to the pool when completed.

This query method returns the raw columns array for each row to the specified `onEach` function.

_arguements:_
* `query` : _string, required_ &ndash; The SQL query.
* `onEach` : _function, required_ &ndash; A callback invoked as each row is received.
* `release` : _boolean, optional_ &ndash; Indicates whether the connection should be returned to the pool when completed.

_returns:_
* An ES6 Promise object resolved with a `stats` object upon completion or rejected upon error.

_example:_
```javascript
var query = connection.queryRows(
  'SELECT * FROM INFORMATION_SCHEMA.TABLES',
  obj => console.log(JSON.stringify(stats, null, '  ')),
  true)

query
  .then(stats => console.log(JSON.stringify(stats, null, '  ')))
  .catch(err => console.log(`Unexpected error: ${err}`))
```

##### .run(runnables, release)

Calls one or more specified `runnables` in series, optionally releasing the connection to the pool when completed.

_arguements:_
* `runnables` : _array, required_ &ndash; Array of either functions or objects. Objects must expose a function property named `run`.
* `release` : _boolean, optional_ &ndash; Indicates whether the connection should be returned to the pool when completed.

_returns:_
* An ES6 Promise object resolved upon completion or rejected upon error.

_example:_
```javascript
connection.run(
    cn => new Promise((resolve, reject) => {
      // the inner connection is a tedious connection...
      let request = new mssql.tds.Request('SELECT * FROM INFORMATION_SCHEMA.TABLES',
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      request.on('row',
        columns => {
          columns.forEach(col => console.log(`${col.metadata.colName}: ${col.value}`));
          console.log();
        });
      cn.execSql(request);
    }))
  .catch(err => console.log(`Unexpected error: ${err}.`))
```

##### .beginTransaction(options)

Instructs the server to delineate a new transaction using the specified `options`.

_arguments:_
* `options` : _object, optional_ &ndash; Options for the transaction:
  * `name` : _string, optional_ &ndash; The transaction's name. See [MSDN](https://msdn.microsoft.com/en-us/library/ms188929.aspx) for naming restrictions.
  * `isolationLevel` : _number, optional_ &ndash; One of the [isolation levels defined by `tedious`](http://pekim.github.io/tedious/api-connection.html#function_beginTransaction). These levels are re-exported as `require('mssql-ease').tds.ISOLATION_LEVELS`.
  * `implicitCommit` : _boolean, optional_ &ndash; Indicates whether the transaction should be implicitly committed if an explicit commit or rollback is not performed before the connection is returned to the pool. The default behavior is to perform an implicit rollback.

_returns:_
* An ES6 Promise object resolved upon completion or rejected upon error.

##### .commitTransaction()

Instructs the server that the outer-most transaction should commit.

_returns:_
* An ES6 Promise object resolved upon completion or rejected upon error.

##### .rollbackTransaction()

Instructs the server that the outer-most transaction should rollback.

_returns:_
* An ES6 Promise object resolved upon completion or rejected upon error.

#### SqlStatement Class

The `SqlStatement` class encapsulates a SQL statement and provides convenience methods for executing the statement against the connection.

##### .executeObject(onEach, onBind, release)
##### .executeRow(onEach, onBind, release)

These methods have the same signature and take similar arguements. Both execute the SQL statement, first calling the specified `onBind` function to bind any parameters, then calling `onEach` for each returned row, optionally releasing the connection to the pool when completed.

`executeObject` transforms each row into an object before calling the specified `onEach` function(s).

`executeRow` calls the specified `onEach` function(s) for each row with the raw `columns` object provided by the underlying `tedious` module.

_arguments:_
* `onEach` : callback function(s), or an array of such &ndash; the specified callbacks are called for reach row in a returned _resultset_, beginning with the first supplied callback, advancing to the next for each new _resultset_.
* `onBind` : callback function with signature `onBind(binder, TYPES)` &ndash; the specified callback is called once for parameter binding, prior to executing the SQL statement.
  * `binder` &ndash; an object supporting parameter binding via two methods:
    * [`.addParameter(name, type, value, options)`](http://pekim.github.io/tedious/api-request.html#function_addParameter)
    * [`.addOutputParameter(name, type, value, options)`](http://pekim.github.io/tedious/api-request.html#function_addOutputParameter)
  * `TYPES` &ndash; an object defining data types used for binding.
* `release` : _boolean, optional_ &ndash; Indicates whether the connection should be returned to the pool when completed.

_returns:_
* An ES6 Promise object resolved with a `stats` object upon completion or rejected upon error.

The `stats` object contains a few useful facts related to the statement's execution:
* `returnStatus` &ndash; if the statement executed stored procedure, the stored procedure's return status; otherwise not present.
* `stats` &ndash; an object containing minimal statistics
  * `hrtime` &ndash; the high-resolution duration of the call
  * `resultCount` &ndash; the number of _resultsets_ returned during the call
  * `rowCounts` &ndash; an array containing the number of rows returned in each _resultset_

`resultCount` and `rowCounts` always reflect the entirety of rows returned by the server. It is a good idea to eyeball these during development to ensure your code is making the right assumptions about what the server returns.

`hrtime` includes the time it takes your callbacks to handle the returned rows &mdash; make sure to short-curcuit callbacks when recording response times and overhead. Likewise, it can be very useful to profile callbacks independently as well as in-line.

_example (single resultset):_
```javascript
var rows = [];

function onEach(row) {
  rows.push(row);
}

cn.statement(`SELECT *
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME LIKE @table_name`)
  .executeObjects(
    // onEach can be a single function when expecting one resultset
    onEach,
    // only columns starting with 'S'
    (binder, TYPES) => binder.addParameter('table_name', TYPES.NVarChar, 'S%'),
    // Release connection after completed
    true)
  .then(stats => {
    console.log(JSON.stringify(rows, null, '  '));
    console.log(JSON.stringify(stats, null, '  '));
    });
```
_example (multiple resultsets):_
```javascript
var depends = [];
var dependents = [];

function onDepends(obj) {
  depends.push(obj);
}

function onDependents(obj) {
  dependents.push(obj);
}

// See https://msdn.microsoft.com/en-us/library/ms189487.aspx
// Returns two resultsets: depends, and dependents.
connection.statement('sp_depends @objname')
  .executeObjects(
    // Put the onEach callbacks in the order that the resultsets are returned:
    [onDepends, onDependents],
    // Obviously, change to an dbobject in your own database that both
    //   depends on another dbobject and has dependents.
    (binder, TYPES) => binder.addParameter('objname', TYPES.NVarChar, 'Users.FriendsOfFriendsView'),
    // Release connection after completed
    true)
  .then(stats => {
    console.log(JSON.stringify(depends, null, '  '));
    console.log(JSON.stringify(dependents, null, '  '));
    console.log(JSON.stringify(stats, null, '  '));
    });
```

#### StoredProcedure Class

The `StoredProcedure` class encapsulates a stored procedure and provides convenience methods for executing the procedure against the connection.

##### .executeObject(onEach, onBind, release)
##### .executeRow(onEach, onBind, release)

These methods have the same signature and take similar arguements. Both execute the stored procedure, first calling the specified `onBind` function to bind any parameters, then calling `onEach` for each returned row, optionally releasing the connection to the pool when completed.

`executeObject` transforms each row into an object before calling the specified `onEach` function(s).

`executeRow` calls the specified `onEach` function(s) for each row with the raw `columns` object provided by the underlying `tedious` module.

_arguments:_
* `onEach` : callback function(s), or an array of such &ndash; the specified callbacks are called for reach row in a returned _resultset_, beginning with the first supplied callback, advancing to the next for each new _resultset_.
* `onBind` : callback function with signature `onBind(binder, TYPES)` &ndash; the specified callback is called once for parameter binding, prior to executing the stored procedure.
  * `binder` &ndash; an object supporting parameter binding via two methods:
    * [`.addParameter(name, type, value, options)`](http://pekim.github.io/tedious/api-request.html#function_addParameter)
    * [`.addOutputParameter(name, type, value, options)`](http://pekim.github.io/tedious/api-request.html#function_addOutputParameter)
  * `TYPES` &ndash; an object defining data types used for binding.
* `release` : _boolean, optional_ &ndash; Indicates whether the connection should be returned to the pool when completed.

_returns:_
* An ES6 Promise object resolved with a `stats` object upon completion or rejected upon error.

The `stats` object contains a few useful facts related to the procedure's execution:
* `returnStatus` &ndash; the stored procedure's return status.
* `stats` &ndash; an object containing minimal statistics
  * `hrtime` &ndash; the high-resolution duration of the call
  * `resultCount` &ndash; the number of _resultsets_ returned during the call
  * `rowCounts` &ndash; an array containing the number of rows returned in each _resultset_

`resultCount` and `rowCounts` always reflect the entirety of rows returned by the server. It is a good idea to eyeball these during development to ensure your code is making the right assumptions about what the server returns.

`hrtime` includes the time it takes your callbacks to handle the returned rows &mdash; make sure to short-curcuit callbacks when recording response times and overhead. Likewise, it can be very useful to profile callbacks independently as well as in-line.

_example (single resultset):_
```javascript
var rows = [];

function onEach(row) {
  rows.push(row);
}

// See https://msdn.microsoft.com/en-us/library/ms176077.aspx
cn.procedure('sp_columns')
  .executeRows(
    // onEach can be a single function when expecting one resultset
    onEach,
    // all columns in all tables (wildcard %)
    onEach, (binder, TYPES) => binder.addParameter('table_name', TYPES.NVarChar, '%'),
    // Release connection after completed
    true)
  .then(stats => {
    console.log(JSON.stringify(rows, null, '  '));
    console.log(JSON.stringify(stats, null, '  '));
    });
```
_example (multiple resultsets):_
```javascript
var depends = [];
var dependents = [];

function onDepends(obj) {
  depends.push(obj);
}

function onDependents(obj) {
  dependents.push(obj);
}

// See https://msdn.microsoft.com/en-us/library/ms189487.aspx
// Returns two resultsets: depends, and dependents.
connection.procedure('sp_depends')
  .executeObjects(
    // Put the onEach callbacks in the order that the resultsets are returned:
    [onDepends, onDependents],
    // Obviously, change to an dbobject in your own database that both
    //   depends on another dbobject and has dependents.
    (binder, TYPES) => binder.addParameter('objname', TYPES.NVarChar, 'Users.FriendsOfFriendsView'),
    // Release connection after completed
    true)
  .then(stats => {
    console.log(JSON.stringify(depends, null, '  '));
    console.log(JSON.stringify(dependents, null, '  '));
    console.log(JSON.stringify(stats, null, '  '));
    });
```

## TODO

* Needs more documentation and exmaples.
* More testing with transactions
* Test with blobs; currently a question mark even though its supported in the underlying `tedious`.
* Figure out how to enlist in and manipulate distributed transactions

## History

**2016-01-12** Initial v0.9.0, consider it a pretty complete alpha.

## License

MIT