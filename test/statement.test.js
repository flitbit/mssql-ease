require('./config-from-env');
const { Connections } = require('../');
const fs = require('fs');
const path = require('path');
const { log, inspect, promisify } = require('util');

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);

const laureates = require('./laureate.json');

const pools = new Connections();

async function connector(where) {
  return await pools.connect(where || process.env.MSSQL_CONNECTION);
}

async function readFilesInDir(dir) {
  const files = await readdir(dir);
  return Promise.all(files.reduce((acc, file) => {
    acc.push(readFile(path.join(dir, file)));
    return acc;
  }, []));
}

async function executeAllScriptsInDir(cn, dir) {
  const files = await readFilesInDir(dir);
  let i = -1;
  const len = files.length;
  while (++i < len) {
    await cn.statement(files[i].toString('utf8')).execute();
  }
}

async function safeExec(connect, action) {
  const cn = await connect();
  try {
    return await action(cn);
  } finally {
    await cn.release();
  }
}

async function createLaureates(cn) {
  let i = -1;
  const len = laureates.length;
  while (++i < len) {
    const data = laureates[i];
    try {
      await cn.statement(`INSERT INTO
      Laureates(id, firstName, surname, born, died, bornCountry, bornCity, diedCountry, diedCountryCode, diedCity, gender)
      values(@id, @firstName, @surname, @born, @died, @bornCountry, @bornCity, @diedCountry, @diedCountryCode, @diedCity, @gender);
      `).execute(
        (binder, TYPES) => {
          binder.addParameter('id', TYPES.Int, data.id);
          binder.addParameter('firstName', TYPES.NVarChar, data.firstname);
          binder.addParameter('surname', TYPES.NVarChar, data.surname);
          binder.addParameter('born', TYPES.NVarChar, data.born);
          binder.addParameter('died', TYPES.NVarChar, data.died);
          binder.addParameter('bornCountry', TYPES.NVarChar, data.bornCountry);
          binder.addParameter('bornCity', TYPES.NVarChar, data.bornCity);
          binder.addParameter('diedCountry', TYPES.NVarChar, data.diedCountry);
          binder.addParameter('diedCountryCode', TYPES.NVarChar, data.diedCountryCode);
          binder.addParameter('diedCity', TYPES.NVarChar, data.diedCity);
          binder.addParameter('gender', TYPES.NVarChar, data.gender);
        });
    } catch (err) {
      log(inspect(data));
      return Promise.reject(err);
    }
  }
  return undefined;
}

beforeAll(async (done) => {
  try {
    await safeExec(connector, cn =>
      executeAllScriptsInDir(cn, path.resolve(__dirname, './sql/before')));
    await safeExec(connector, createLaureates);
    done();
  } catch (err) {
    done(err);
  }
}, 30000);

afterAll(async done => {
  try {
    await safeExec(connector, cn => executeAllScriptsInDir(cn, path.resolve(__dirname, './sql/after')));
  } catch (err) {
    done(err);
  } finally {
    try {
      await pools.drain();
    } catch (err) {
      done(err);
    }
  }
  done();
}, 30000);

test('.connect(str) succeeds', async () => {
  const cns = new Connections();
  try {
    const cn = await cns.connect(process.env.MSSQL_CONNECTION);
    try {
      expect(cn).toBeDefined();
    } finally {
      await cn.release();
    }
  } finally {
    await cns.drain();
  }
});
