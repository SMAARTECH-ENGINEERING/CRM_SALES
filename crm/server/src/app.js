import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import env from './config/env.js';
import logger from './config/logger.js';
import { HTTP_STATUS, MESSAGES } from './constants/index.js';
import audit from './middleware/audit.js';
import errorHandler from './middleware/errorHandler.js';
import notFound from './middleware/notFound.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import routes from './routes/index.js';
import ApiError from './utils/ApiError.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.trustProxy);

app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(
  cors({
    // Requests without an Origin header (Postman, curl, server-to-server) are allowed.
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new ApiError(HTTP_STATUS.FORBIDDEN, MESSAGES.CORS_BLOCKED));
    },
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// The audit trail sits in front of every route: see middleware/audit.js.
app.use(env.apiPrefix, apiLimiter, audit, routes);

app.use(notFound);
app.use(errorHandler);

export default app;
