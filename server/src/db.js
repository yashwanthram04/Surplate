import mongoose from 'mongoose';

/**
 * Connects to MongoDB. With MONGODB_URI set (e.g. the team's Atlas cluster) it uses that.
 * Without it, outside production, it boots a throwaway in-memory MongoDB so the app and
 * the E2E tests run with zero setup. Returns an async `close()`.
 */
export async function connectDb(uri = process.env.MONGODB_URI) {
  let memory = null;
  let usingMemory = false;
  if (!uri) {
    if (process.env.NODE_ENV === 'production') throw new Error('MONGODB_URI must be set in production.');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memory = await MongoMemoryServer.create();
    uri = memory.getUri('surplate');
    usingMemory = true;
    console.log('No MONGODB_URI set: using a temporary in-memory MongoDB (data is lost on restart).');
  }
  await mongoose.connect(uri);
  // Make sure the 2dsphere index exists before the first geo query.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  return {
    usingMemory,
    async close() {
      await mongoose.disconnect();
      await memory?.stop();
    },
  };
}
