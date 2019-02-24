const assert = require('assert-plus');
const URL = require('url');
const querystring = require('querystring');
const { isIPv4 } = require('net');
const { ISOLATION_LEVEL, TDS_VERSION } = require('tedious');
const ptr = require('json-ptr');

const IsolationLevels = Object.keys(ISOLATION_LEVEL);
const TdsVersions = Object.keys(TDS_VERSION);

const AuthenticationTypes = ['default', 'ntlm', 'azure-active-directory-password'];

// from http://tediousjs.github.io/tedious/api-connection.html#function_newConnection
const ConfigSettings = [
  ['server', '#/server', { type: 'string', required: true, description: 'Hostname to connect to.' }],
  ['authType', '#/authentication/type', { type: 'string', enum: AuthenticationTypes, default: 'default', description: 'Type of the authentication method, valid types are default, ntlm, azure-active-directory-password' }],
  ['userName', '#/authentication/options/userName', { type: 'string', description: 'User name to use for authentication.' }],
  ['password', '#/authentication/options/password', { type: 'string', description: 'Password to use for authentication.' }],
  ['domain', '#/authentication/options/domain', { type: 'string', description: 'Once you set domain for ntlm authentication type, driver will connect to SQL Server using domain login.' }],
  ['instanceName', '#/options/instanceName', { type: 'string', description: 'The instance name to connect to.The SQL Server Browser service must be running on the database server, and UDP port 1434 on the database server must be reachable. (no default ) Mutually exclusive with options.port.' }],
  ['port', '#/options/port', { type: 'integer', default: 1433, exclusiveOf: '#/options/instanceName', description: 'Port to connect to(default: 1433). Mutually exclusive with options.instanceName.' }],
  ['database', '#/options/database', { type: 'string', description: 'Database to connect to(default: dependent on server configuration).' }],
  ['fallbackToDefaultDb', '#/options/fallbackToDefaultDb', { type: 'boolean', default: false, description: 'By default , if the database requested by options.database cannot be accessed, the connection will fail with an error.However, if options.fallbackToDefaultDb is set to true, then the user\'s default database will be used instead (Default: false).' }],
  ['enableAnsiNullDefault', '#/options/enableAnsiNullDefault', { type: 'boolean', default: true, description: 'If true, SET ANSI_NULL_DFLT_ON ON will be set in the initial sql.This means new columns will be nullable by default.See the T - SQL documentation for more details. (Default: true).' }],
  ['connectTimeout', '#/options/connectTimeout', { type: 'integer', default: 15000, description: 'The number of milliseconds before the attempt to connect is considered failed(default: 15000).' }],
  ['requestTimeout', '#/options/requestTimeout', { type: 'integer', default: 15000, description: 'The number of milliseconds before a request is considered failed, or 0 for no timeout(default: 15000).' }],
  ['cancelTimeout', '#/options/cancelTimeout', { type: 'integer', default: 5000, description: 'The number of milliseconds before the cancel(abort) of a request is considered failed(default: 5000).' }],
  ['packetSize', '#/options/packetSize', { type: 'integer', description: 'The size of TDS packets(subject to negotiation with the server).Should be a power of 2.(default: 4096).' }],
  ['useUTC', '#/options/useUTC', { type: 'boolean', default: true, description: 'A boolean determining whether to pass time values in UTC or local time. (default: true).' }],
  ['abortTransactionOnError', '#/options/abortTransactionOnError', { type: 'boolean', description: 'A boolean determining whether to rollback a transaction automatically if any error is encountered during the given transaction\'s execution. This sets the value for SET XACT_ABORT during the initial SQL phase of a connection (documentation).' }],
  ['localAddress', '#/options/localAddress', { type: 'string', description: 'A string indicating which network interface(ip address) to use when connecting to SQL Server.' }],
  ['useColumnNames', '#/options/useColumnNames', { type: 'boolean', description: 'A boolean determining whether to return rows as arrays or key - value collections. (default: false).' }],
  ['camelCaseColumns', '#/options/camelCaseColumns', { type: 'boolean', description: 'A boolean, controlling whether the column names returned will have the first letter converted to lower case (true) or not.This value is ignored if you provide a columnNameReplacer. (default: false).' }],
  //  options.columnNameReplacer
  //  A function with parameters(columnName, index, columnMetaData) and returning a string.If provided, this will be called once per column per result - set.The returned value will be used instead of the SQL - provided column name on row and meta data objects.This allows you to dynamically convert between naming conventions. (default: null).
  ['debugPacket', '#/options/debug/packet', { type: 'boolean', description: 'A boolean, controlling whether debug events will be emitted with text describing packet details(default: false).' }],
  ['debugData', '#/options/debug/data', { type: 'boolean', description: 'A boolean, controlling whether debug events will be emitted with text describing packet data details(default: false).' }],
  ['debugPayload', '#/options/debug/payload', { type: 'boolean', description: 'A boolean, controlling whether debug events will be emitted with text describing packet payload details(default: false).' }],
  ['debugToken', '#/options/debug/token', { type: 'boolean', description: 'A boolean, controlling whether debug events will be emitted with text describing token stream tokens(default: false).' }],
  ['isolationLevel', '#/options/isolationLevel', { type: 'string', enum: IsolationLevels, description: 'The default isolation level that transactions will be run with.The isolation levels are available from require(\'tedious\').ISOLATION_LEVEL. [ READ_UNCOMMITTED, READ_COMMITTED, REPEATABLE_READ, SERIALIZABLE, SNAPSHOT ] (default: READ_COMMITTED).' }],
  ['connectionIsolationLevel', '#/options/connectionIsolationLevel', { type: 'string', enum: IsolationLevels, description: 'The default isolation level for new connections.All out - of - transaction queries are executed with this setting.The isolation levels are available from require(\'tedious\').ISOLATION_LEVEL. [ READ_UNCOMMITTED, READ_COMMITTED, REPEATABLE_READ, SERIALIZABLE, SNAPSHOT ] (default: READ_COMMITTED).' }],
  ['readOnlyIntent', '#/options/readOnlyIntent', { type: 'boolean', description: 'A boolean, determining whether the connection will request read only access from a SQL Server Availability Group.For more information, see here. (default: false).' }],
  ['encrypt', '#/options/encrypt', { type: 'boolean', default: false, description: 'A boolean determining whether or not the connection will be encrypted.Set to true if you\'re on Windows Azure. (default: false).' }],
  // options.cryptoCredentialsDetails
  // When encryption is used, an object may be supplied that will be used for the first argument when calling tls.createSecurePair(default: {}).
  ['rowCollectionOnDone', '#/options/rowCollectionOnDone', { type: 'boolean', description: 'A boolean, that when true will expose received rows in Requests\' done* events. See done, doneInProc and doneProc. (default: false) Caution: If many row are received, enabling this option could result in excessive memory usage.' }],
  ['rowCollectionOnRequestCompletion', '#/options/rowCollectionOnRequestCompletion', { type: 'boolean', description: 'A boolean, that when true will expose received rows in Requests\' completion callback. See new Request. (default: false) Caution: If many row are received, enabling this option could result in excessive memory usage.' }],
  ['tdsVersion', '#/options/tdsVersion', { type: 'string', enum: TdsVersions, description: 'The version of TDS to use.If server doesn\'t support specified version, negotiated version is used instead. The versions are available from require(\'tedious\').TDS_VERSION. [ 7_1, 7_2, 7_3_A, 7_3_B, 7_4 ] (default: 7_4).' }],
  ['connectionRetryInterval', '#/options/connectionRetryInterval', { type: 'integer', description: 'Number of milliseconds before retrying to establish connection, in case of transient failure. (default: 500)' }],
  ['dateFormat', '#/options/dateFormat', { type: 'string', description: 'A string representing position of month, day and year in temporal datatypes. (default: mdy)' }],

  ['enableAnsiNull', '#/options/enableAnsiNull', { type: 'boolean', description: 'A boolean, controls the way null values should be used during comparison operation. (default: true)' }],
  ['enableAnsiPadding', '#/options/enableAnsiPadding', { type: 'boolean', description: 'A boolean, controls if padding should be applied for values shorter than the size of defined column. (default: true)' }],
  ['enableAnsiWarnings', '#/options/enableAnsiWarnings', { type: 'boolean', description: 'If true, SQL Server will follow ISO standard behavior during various error conditions.For details, see documentation. (default: true)' }],
  ['enableConcatNullYieldsNull', '#/options/enableConcatNullYieldsNull', { type: 'boolean', description: 'A boolean, determines if concatenation with NULL should result in NULL or empty string value, more details in documentation. (default: true)' }],
  ['enableCursorCloseOnCommit', '#/options/enableCursorCloseOnCommit', { type: 'boolean', description: 'A boolean, controls whether cursor should be closed, if the transaction opening it gets committed or rolled back. (default: false)' }],
  ['enableImplicitTransactions', '#/options/enableImplicitTransactions', { type: 'boolean', description: 'A boolean, sets the connection to either implicit or autocommit transaction mode. (default: false)' }],
  ['enableNumericRoundabort', '#/options/enableNumericRoundabort', { type: 'boolean', description: 'If false, error is not generated during loss of precession. (default: false)' }],
  ['enableQuotedIdentifier', '#/options/enableQuotedIdentifier', { type: 'boolean', description: 'If true, characters enclosed in single quotes are treated as literals and those enclosed double quotes are treated as identifiers. (default: true)' }],
  ['appName', '#/options/appName', { type: 'string', default: 'mssql-ease', description: 'Application name used for identifying a specific application in profiling, logging or tracing tools of SQL Server. (default: mssql-ease).' }]
];

const TrueStrings = [
  'true', // true/f
  't', // t/f
  'yes', // yes/no
  'y', // y/n
  'on', // on/off
  '1' // 0/1
];

function coerceBooleanOption(value, defa) {
  if (typeof value === 'undefined') {
    return defa;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string' && value.length === 0) {
    // treat it like a flag
    return true;
  }
  return TrueStrings.indexOf(value.toLowerCase()) >= 0;
}

function coerceStringOption(value, defa) {
  if (typeof value === 'undefined' || (
    typeof value === 'string' && value.length === 0
  )) {
    return defa;
  }
  return '' + value;
}

function coerceIntegerOption(value, defa) {
  if (typeof value === 'undefined') {
    return defa;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.length) {
    return parseInt(value);
  }
  return defa;
}

const Coercions = {
  boolean: coerceBooleanOption,
  integer: coerceIntegerOption,
  string: coerceStringOption,
};

class ConnectionString {

  static parse(str) {
    assert.string(str, 'str');
    const url = URL.parse(str);
    if (!url.protocol || (url.protocol.toLowerCase() !== 'mssql:')) {
      throw new Error(`Connection string (url) must begin with 'mssql:'; received: '${url.protocol}'`);
    }
    const [userName, password] = url.auth.split(':');
    let qs = querystring.parse(url.query);
    qs.server = url.hostname.split(':')[0];
    qs.userName = userName;
    qs.password = password;
    const res = Object.create(null);
    let i = -1;
    const len = ConfigSettings.length;
    while (++i < len) {
      const [name, pointer, spec] = ConfigSettings[i];
      const { type, required, enum: allowedValues, default: defa, exclusiveOf, description } = spec;
      const coerce = Coercions[type];
      const value = coerce(qs[name], defa);
      if (exclusiveOf) {
        const other = ptr.get(res, exclusiveOf);
        if (typeof other !== 'undefined') {
          continue;
        }
      }
      if (typeof value === 'undefined') {
        if (required) {
          throw new Error(`${name} (${type}) is required. ${description}`);
        }
        continue;
      }
      if (allowedValues && !~allowedValues.indexOf(value)) {
        throw new Error(`${name} (${type}) must be one of ${allowedValues.join(', ')}; received: ${value}`);
      }
      ptr.set(res, pointer, value, true);
    }

    return res;
  }

  constructor(config) {
    assert.ok(~['object', 'string'].indexOf(typeof config) && config !== null,
      'config (string | object) is required');
    if (typeof config === 'string') {
      config = ConnectionString.parse(config);
    }
    assert.string(config.server, 'config.server');
    assert.optionalObject(config.authentication, 'config.authentication');
    if (config.authentication) {
      if (config.authentication.type) {
        assert.ok(~AuthenticationTypes.indexOf(config.authentication.type),
          `config.authentication.type (string) must be one of ${AuthenticationTypes.join(', ')}; received: ${config.authentication.type}`);
      }
      assert.optionalString(config.domain, 'config.domain');
      assert.optionalString(config.userName, 'config.userName');
      assert.optionalString(config.password, 'config.password');
      if (config.domain) {
        assert.ok(!(config.password || config.userName),
          'domain login and userName:password are mutually exclusive; provide one or the other but not both');
      }
    }

    assert.optionalObject(config.options, 'config.options');
    if (config.options) {
      assert.optionalString(config.options.instanceName, 'config.options.instanceName');
      if (config.options.instanceName) {
        assert.ok(typeof config.options.port === 'undefined',
          'instanceName and port are mutually exclusive; provide one or the other but not both');
      } else {
        delete config.options.instanceName;
        assert.optionalNumber(config.options.port, 'config.options.port');
      }
      assert.optionalBool(config.options.fallbackToDefaultDb, 'config.options.fallbackToDefaultDb');
      assert.optionalBool(config.options.enableAnsiNullDefault, 'config.options.enableAnsiNullDefault');
      assert.optionalNumber(config.options.connectTimeout, 'config.options.connectTimeout');
      assert.optionalNumber(config.options.requestTimeout, 'config.options.requestTimeout');
      assert.optionalNumber(config.options.cancelTimeout, 'config.options.cancelTimeout');
      assert.optionalNumber(config.options.packetSize, 'config.options.packetSize');
      if (config.options.packetSize) {
        assert.ok(config.options.packetSize && (config.options.packetSize & (config.options.packetSize - 1)) === 0,
          `config.options.packetSize (number) must be a power of 2; received: ${config.options.packetSize}`);
      }
      assert.optionalBool(config.options.useUTC, 'config.options.useUTC');
      assert.optionalBool(config.options.abortTransactionOnError, 'config.options.abortTransactionOnError');
      assert.optionalString(config.options.localAddress, 'config.options.localAddress');
      if (config.options.localAddress) {
        assert.ok(isIPv4(config.options.localAddress),
          `config.options.localAddress (string) must be an IPv4 address; received: ${config.options.localAddress}`);
      }
      assert.optionalBool(config.options.useColumnNames, 'config.options.useColumnNames');
      assert.optionalBool(config.options.camelCaseColumns, 'config.options.camelCaseColumns');
      assert.optionalFunc(config.options.columnNameReplacer, 'config.options.columnNameReplacer');
      assert.optionalObject(config.options.debug, 'config.options.debug');
      if (config.options.debug) {
        assert.optionalBool(config.options.debug.packet, 'config.options.debug.packet');
        assert.optionalBool(config.options.debug.data, 'config.options.debug.data');
        assert.optionalBool(config.options.debug.payload, 'config.options.debug.payload');
        assert.optionalBool(config.options.debug.token, 'config.options.debug.token');
      }
      assert.optionalString(config.options.isolationLevel, 'config.options.isolationLevel');
      if (config.options.isolationLevel) {
        assert.ok(~IsolationLevels.indexOf(config.options.isolationLevel),
          `config.options.isolationLevel (string) must be one of ${IsolationLevels.join(', ')}; received: ${config.options.isolationLevel}`);
      }
      assert.optionalString(config.options.connectionIsolationLevel, 'config.options.connectionIsolationLevel');
      if (config.options.connectionIsolationLevel) {
        assert.ok(~IsolationLevels.indexOf(config.options.connectionIsolationLevel),
          `config.options.connectionIsolationLevel (string) must be one of ${IsolationLevels.join(', ')}; received: ${config.options.connectionIsolationLevel}`);
      }
      assert.optionalBool(config.options.readOnlyIntent, 'config.options.readOnlyIntent');
      assert.optionalBool(config.options.encrypt, 'config.options.encrypt');
      assert.optionalObject(config.options.cryptoCredentialsDetails, 'config.options.cryptoCredentialsDetails');
      assert.optionalBool(config.options.rowCollectionOnDone, 'config.options.rowCollectionOnDone');
      assert.optionalBool(config.options.rowCollectionOnRequestCompletion, 'config.options.rowCollectionOnRequestCompletion');
      assert.optionalString(config.options.tdsVersion, 'config.options.tdsVersion');
      if (config.options.tdsVersion) {
        assert.ok(~TdsVersions.indexOf(config.options.tdsVersion),
          `config.options.tdsVersion (string) must be one of ${TdsVersions.join(', ')}; received: ${config.options.tdsVersion}`);
      }
      assert.optionalNumber(config.options.connectionRetryInterval, 'config.options.connectionRetryInterval');
      assert.optionalString(config.options.dateFormat, 'config.options.dateFormat');
      assert.optionalBool(config.options.enableAnsiNull, 'config.options.enableAnsiNull');
      assert.optionalBool(config.options.enableAnsiPadding, 'config.options.enableAnsiPadding');
      assert.optionalBool(config.options.enableAnsiWarnings, 'config.options.enableAnsiWarnings');
      assert.optionalBool(config.options.enableConcatNullYieldsNull, 'config.options.enableConcatNullYieldsNull');
      assert.optionalBool(config.options.enableCursorCloseOnCommit, 'config.options.enableCursorCloseOnCommit');
      assert.optionalBool(config.options.enableImplicitTransactions, 'config.options.enableImplicitTransactions');
      assert.optionalBool(config.options.enableNumericRoundabort, 'config.options.enableNumericRoundabort');
      assert.optionalBool(config.options.enableQuotedIdentifier, 'config.options.enableQuotedIdentifier');
      assert.optionalString(config.options.appName, 'config.options.appName');
    }
    Object.assign(this, config);
  }

}

module.exports = ConnectionString.ConnectionString = ConnectionString;
