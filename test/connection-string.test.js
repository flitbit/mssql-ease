require('./config-from-env');
const { ConnectionString } = require('../lib/connection-string');

test('ConnectionString.parse() throws when no args specified', async () => {
  try {
    const config = ConnectionString.parse();
    expect(config).toBeUndefined();
  } catch (err) {
    expect(err.message).toMatch('str (string) is required');
  }
});

test('ConnectionString.parse() throws on unrecognized url scheme', async () => {
  try {
    const config = ConnectionString.parse('mongo://localhost');
    expect(config).toBeUndefined();
  } catch (err) {
    expect(err.message).toMatch('Connection string (url) must begin with \'mssql:\'; received: \'mongo:\'');
  }
});
