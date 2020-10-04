const Pool = require("pg");

module.exports = class DB {
  constructor() {
    this.pool = new Pool({
      connectionString: DATABASE_URI,
      ssl: true,
    )};
  }

  async query(param) {
    const client = await this.pool.connect();
    const { row } = await client.query(param);
    client.release();
    return row;
  }
}
