
module.exports = {
  server: process.env.DEFAULT_DB_HOST,
  port: process.env.DEFAULT_DB_PORT,
  database: process.env.DEFAULT_DB_DBNAME,
  userName: process.env.DEFAULT_DB_USER,
  password: process.env.DEFAULT_DB_PASSWORD,
  options: {
    appName: 'mssql-ease-examples',
    log: console.log // eslint-disable-line no-console
  }
};
