require('./config-from-env');
const { TdsConnector } = require('../lib/tds-connector');
const { log } = require('util');

test('.ctor() throws when no args specified', async () => {
  try {
    const ctor = new TdsConnector();
    expect(ctor).toBeUndefined();
  } catch (err) {
    expect(err.message).toMatch('config (string | object) is required');
  }
});

test('.ctor(str) succeeds on url', async () => {
  const ctor = new TdsConnector(process.env.MSSQL_CONNECTION);
  expect(ctor).toBeDefined();
});

test('.create() succeeds without args', async () => {
  const ctor = new TdsConnector(process.env.MSSQL_CONNECTION);
  expect(ctor).toBeDefined();
  log(ctor.config);
  const cn = await ctor.create();
  expect(cn).toBeDefined();
  await ctor.destroy(cn);
});


