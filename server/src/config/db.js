const mongoose = require('mongoose');

if (!process.env.MONGO_URI) {
  console.warn('[db] WARNING: MONGO_URI is not set in .env — falling back to localhost');
}

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chorus';

// Export the native MongoClient promise so connect-mongo can reuse this
// connection instead of opening a second one (which was crashing the server
// with a DNS error when Atlas SRV resolution was attempted twice).
const clientPromise = mongoose
  .connect(uri)
  .then((m) => {
    console.log('[db] MongoDB connected to:', uri.replace(/:([^:@]{3})[^:@]*@/, ':*****@'));
    return m.connection.getClient();
  });

async function connectDB() {
  try {
    await clientPromise;
  } catch (err) {
    console.error('[db] MongoDB connection FAILED:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
module.exports.clientPromise = clientPromise;