import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

export const connectMongo = async () => {
  await mongoose.connect(env.MONGODB_URI, { autoIndex: !env.isProd });
  logger.info('MongoDB connected');
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', { err: err.message }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
};

export const disconnectMongo = () => mongoose.disconnect();
