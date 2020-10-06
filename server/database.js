const { Client } = require("pg");

module.exports = class DB {
  constructor(uri) {
    this.client = new Client({
      connectionString: uri,
      ssl: {
        rejectUnauthorized: false
      }
    });

    this.client.connect();
  }

  async query(param) {
    const { rows } = await this.client.query(param);
    return rows;
  }

  exit() {
    this.client.end();
  }
}

// const { Pool } = require("pg");

// module.exports = class DB {
//   constructor(uri) {
//     this.pool = new Pool({
//       connectionString: uri,
//       ssl: true,
//     });
//   }

//   async query(param) {
//     const client = await this.pool.connect();
//     const res = await client.query(param);
//     client.release();
//     return res;
//   }
// }
