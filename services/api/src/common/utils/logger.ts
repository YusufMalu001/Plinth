/* eslint-disable no-console */
import { config } from '../../config';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

interface LogPayload {
  timestamp: string;
  level: LogLevel;
  service: string;
  environment: string;
  message: string;
  requestId?: string;
  userId?: string;
  errorCode?: string;
  duration?: number;
  details?: unknown;
}

class Logger {
  private serviceName: string = 'synergy-api';

  private log(level: LogLevel, message: string, context?: { requestId?: string; userId?: string; errorCode?: string; duration?: number; details?: unknown }) {
    const payload: LogPayload = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      environment: config.env,
      message,
      ...context
    };

    if (config.env === 'development') {
      // Human-readable output for development
      const colorMap = {
        DEBUG: '\x1b[36m', // Cyan
        INFO: '\x1b[32m',  // Green
        WARN: '\x1b[33m',  // Yellow
        ERROR: '\x1b[31m', // Red
        FATAL: '\x1b[41m\x1b[37m' // White on Red
      };
      const reset = '\x1b[0m';
      const color = colorMap[level] || reset;
      const reqInfo = payload.requestId ? ` [Req: ${payload.requestId}]` : '';
      const durationInfo = payload.duration ? ` (${payload.duration}ms)` : '';

      console.log(
        `${payload.timestamp} ${color}[${level}]${reset} ${payload.message}${reqInfo}${durationInfo}`
      );
      if (payload.details) {
        console.dir(payload.details, { depth: null, colors: true });
      }
    } else {
      // JSON structured logs for production/staging/log collectors
      console.log(JSON.stringify(payload));
    }
  }

  public debug(message: string, context?: Parameters<Logger['log']>[2]) {
    if (config.env === 'development') {
      this.log('DEBUG', message, context);
    }
  }

  public info(message: string, context?: Parameters<Logger['log']>[2]) {
    this.log('INFO', message, context);
  }

  public warn(message: string, context?: Parameters<Logger['log']>[2]) {
    this.log('WARN', message, context);
  }

  public error(message: string, context?: Parameters<Logger['log']>[2]) {
    this.log('ERROR', message, context);
  }

  public fatal(message: string, context?: Parameters<Logger['log']>[2]) {
    this.log('FATAL', message, context);
  }
}

export const logger = new Logger();
