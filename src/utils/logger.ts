import winston from 'winston';

// Create a logger instance
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// Function to track performance metrics
export function trackMetric(name: string, value: number, properties?: Record<string, string>) {
    logger.info('Metric tracked', {
        metric: name,
        value,
        properties
    });
}
