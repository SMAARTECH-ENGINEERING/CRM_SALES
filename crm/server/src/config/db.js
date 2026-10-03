import mongoose from 'mongoose';
import env from './env.js';
import logger from './logger.js';

mongoose.set('strictQuery', true);

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));

export async function connectDB() {
  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 10000,
    // Unique indexes (e.g. user email) are integrity rules, so they are built everywhere.
    autoIndex: true,
  });
  const { host, port, name } = mongoose.connection;
  logger.info(`MongoDB connected: ${host}:${port}/${name}`);
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
