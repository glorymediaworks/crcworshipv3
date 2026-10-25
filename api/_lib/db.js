const { MongoClient } = require('mongodb');
let client;
async function getDb() {
  if (!process.env.MONGODB_URI) throw Object.assign(new Error('MONGODB_URI is not set'), { status: 500 });
  if (!client) client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 });
  await client.connect();
  return client.db(process.env.MONGODB_DB || 'crcworship');
}
module.exports = { getDb };
