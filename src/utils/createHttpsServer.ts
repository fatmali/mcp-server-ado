import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { logger } from './logger.js';

/**
 * Creates either an HTTP or HTTPS server based on the protocol of the redirect URI
 * @param redirectUri The redirect URI from Spotify config
 * @param requestHandler The request handler function
 * @returns The created server or null if creation failed
 */
export function createServer(
  redirectUri: URL,
  requestHandler: (req: any, res: any) => void
): http.Server | https.Server | null {
  try {
    const isHttps = redirectUri.protocol === 'https:';
    
    if (isHttps) {
      // Load SSL certificates
      const certPath = path.resolve(process.cwd(), 'certs');
      
      try {
        const options = {
          key: fs.readFileSync(path.join(certPath, 'key.pem')),
          cert: fs.readFileSync(path.join(certPath, 'cert.pem'))
        };
        
        logger.info('Creating HTTPS server with SSL certificates');
        return https.createServer(options, requestHandler);
      } catch (error) {
        logger.error('Failed to load SSL certificates:', error);
        return null;
      }
    } else {
      logger.info('Creating HTTP server');
      return http.createServer(requestHandler);
    }
  } catch (error) {
    logger.error('Error creating server:', error);
    return null;
  }
}
