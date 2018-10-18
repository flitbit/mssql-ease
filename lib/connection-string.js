const assert = require('assert-plus');
const URL = require('url');
const querystring = require('querystring');
const { isIPv4 } = require('net');
const { ISOLATION_LEVEL, TDS_VERSION } = require('tedious');

const IsolationLevels = Object.keys(ISOLATION_LEVEL);
const TdsVersions = Object.keys(TDS_VERSION);

const NumericOptions = [
  'connectionTimeout',
  'requestTimeout',
  'cancelTimeout',
  'packetSize',
  'connectionRetryInterval',
];
const BooleanOptions = [
  'domain',
  'fallbackToDefaultDb',
  'enableAnsiNullDefault',
  'useUTC',
  'abortTransationOnError',
  'useColumnNames',
  'camelCaseColumns',
  'readOnlyIntent',
  'rowCollectionOnDone',
  'rowCollectionOnRequestCompletion',
  'enableAnsiNull',
  'enableAnsiPadding',
  'enableAnsiWarnings',
  'enableConcatNullYieldsNull',
  'enableCursorCloseOnCommit',
  'enableImplicitTransations',
  'enableNumericRoundAbort',
  'enableQuotedIdentifier',
  'encrypt'
];

function transformBooleanOption(op) {
  if (typeof op === 'string' && op.length === 0) {
    return true;
  }
  return op === 'true';
}

class ConnectionString {
  static parse(str) {
    assert.string(str, 'str');
    const url = URL.parse(str);
    if (!url.protocol || (url.protocol.toLowerCase() !== 'mssql:')) {
      throw new Error(`Connection string (url) must begin with 'mssql:'; received: '${url.protocol}'`);
    }
    const [userName, password] = url.auth.split(':');
    let qs = querystring.parse(url.query);
    const keys = Object.keys(qs);
    let i = -1;
    const len = keys.length;
    while (++i < len) {
      const key = keys[i];
      if (~NumericOptions.indexOf(key)) {
        qs[key] = parseInt(qs[key]);
      }
      if (~BooleanOptions.indexOf(key)) {
        qs[key] = transformBooleanOption(qs[key]);
      }
    }
    const instanceName = (url.pathname && url.pathname.length > 1) ?
      url.pathname.substring(1) : undefined;
    let port = (!instanceName) ? url.port || 1433 : undefined;
    if (typeof port === 'string') {
      port = parseInt(port);
    }

    return Object.assign(qs, {
      userName,
      password,
      server: url.hostname,
      port,
      instanceName,
    });
  }

  constructor(options) {
    assert.ok(~['object', 'string'].indexOf(typeof options) && options !== null,
      'options (string | object) is required');
    if (typeof options === 'string') {
      options = ConnectionString.parse(options);
    }
    assert.optionalBool(options.domain, 'options.domain');
    assert.optionalString(options.userName, 'options.userName');
    assert.optionalString(options.password, 'options.password');

    if (options.domain) {
      assert.ok(!(options.password || options.userName),
        'domain login and userName:password are mutually exclusive; provide one or the other but not both');
    }
    assert.optionalString(options.instanceName, 'options.instanceName');
    if (options.instanceName) {
      assert.ok(typeof options.port === 'undefined',
        'instanceName and port are mutually exclusive; provide one or the other but not both');
    } else {
      delete options.instanceName;
      assert.optionalNumber(options.port, 'options.port');
    }
    assert.optionalBool(options.fallbackToDefaultDb, 'options.fallbackToDefaultDb');
    assert.optionalBool(options.enableAnsiNullDefault, 'options.enableAnsiNullDefault');
    assert.optionalNumber(options.connectTimeout, 'options.connectTimeout');
    assert.optionalNumber(options.requestTimeout, 'options.requestTimeout');
    assert.optionalNumber(options.cancelTimeout, 'options.cancelTimeout');
    assert.optionalNumber(options.packetSize, 'options.packetSize');
    if (options.packatSize) {
      assert.ok(options.packatSize && (options.packetSize & (options.packetSize - 1)) === 0,
        `options.packetSize (number) must be a power of 2; received: ${options.packetSize}`);
    }
    assert.optionalBool(options.useUTC, 'options.useUTC');
    assert.optionalBool(options.abortTransactionOnError, 'options.abortTransactionOnError');
    assert.optionalString(options.localAddress, 'options.localAddress');
    if (options.localAddress) {
      assert.ok(isIPv4(options.localAddress),
        `options.localAddress (string) must be an IPv4 address; received: ${options.localAddress}`);
    }
    assert.optionalBool(options.useColumnNames, 'options.useColumnNames');
    assert.optionalBool(options.camelCaseColumns, 'options.camelCaseColumns');
    assert.optionalFunc(options.columnNameReplacer, 'options.columnNameReplacer');
    assert.optionalObject(options.debug, 'options.debug');
    const dbg = options.debug || { data: false, payload: false, token: false };
    assert.optionalBool(dbg.data, 'options.debug.data');
    assert.optionalBool(dbg.payload, 'options.debug.payload');
    assert.optionalBool(dbg.token, 'options.debug.token');
    assert.optionalString(options.isolationLevel, 'options.isolationLevel');
    if (options.isolationLevel) {
      assert.ok(~IsolationLevels.indexOf(options.isolationLevel),
        `options.isolationLevel (string) must be one of ${IsolationLevels.join(', ')}; received: ${options.isolationLevel}`);
    }
    assert.optionalString(options.connectionIsolationLevel, 'options.connectionIsolationLevel');
    if (options.connectionIsolationLevel) {
      assert.ok(~IsolationLevels.indexOf(options.connectionIsolationLevel),
        `options.connectionIsolationLevel (string) must be one of ${IsolationLevels.join(', ')}; received: ${options.connectionIsolationLevel}`);
    }
    assert.optionalBool(options.readOnlyIntent, 'options.readOnlyIntent');
    assert.optionalBool(options.encrypt, 'options.encrypt');
    assert.optionalObject(options.cryptoCredentialsDetails, 'options.cryptoCredentialsDetails');
    assert.optionalBool(options.rowCollectionOnDone, 'options.rowCollectionOnDone');
    assert.optionalBool(options.rowCollectionOnRequestCompletion, 'options.rowCollectionOnRequestCompletion');
    assert.optionalString(options.tdsVersion, 'options.tdsVersion');
    if (options.tdsVersion) {
      assert.ok(~TdsVersions.indexOf(options.tdsVersion),
        `options.tdsVersion (string) must be one of ${TdsVersions.join(', ')}; received: ${options.tdsVersion}`);
    }
    assert.optionalNumber(options.connectionRetryInterval, 'options.connectionRetryInterval');
    assert.optionalString(options.dateFormat, 'options.dateFormat');
    assert.optionalBool(options.enableAnsiNull, 'options.enableAnsiNull');
    assert.optionalBool(options.enableAnsiPadding, 'options.enableAnsiPadding');
    assert.optionalBool(options.enableAnsiWarnings, 'options.enableAnsiWarnings');
    assert.optionalBool(options.enableConcatNullYieldsNull, 'options.enableConcatNullYieldsNull');
    assert.optionalBool(options.enableCursorCloseOnCommit, 'options.enableCursorCloseOnCommit');
    assert.optionalBool(options.enableImplicitTransactions, 'options.enableImplicitTransactions');
    assert.optionalBool(options.enableNumericRoundabort, 'options.enableNumericRoundabort');
    assert.optionalBool(options.enableQuotedIdentifier, 'options.enableQuotedIdentifier');
    assert.optionalString(options.appName, 'options.appName');
    Object.assign(this, options, {
      encrypt: options.encrypt || false
    });
  }

}

module.exports = ConnectionString.ConnectionString = ConnectionString;
