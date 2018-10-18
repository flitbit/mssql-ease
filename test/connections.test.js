require('./config-from-env');
const { Connections } = require('../lib/connections');

test('.ctor() succeeds', async () => {
  const ctor = new Connections();
  expect(ctor).toBeDefined();
});

test('.connect(str) succeeds', async () => {
  const cns = new Connections();
  const cn = await cns.connect(process.env.MSSQL_CONNECTION);
  expect(cn).toBeDefined();
  await cn.release();
  await cns.drain();
});

test('.connect(str) successively connects before prior release', async () => {
  const cns = new Connections();
  try {
    const cn = await cns.connect(process.env.MSSQL_CONNECTION);
    try {
      const cn2 = await cns.connect(process.env.MSSQL_CONNECTION);
      try {
        expect(cn).not.toEqual(cn2);
      } finally {
        await cn2.release();
      }
    } finally {
      await cn.release();
    }
  } finally {
    await cns.drain();
  }
});



