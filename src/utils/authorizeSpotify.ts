import { SpotifyService, SpotifyConfig } from '../spotify.js';
import { logger } from './logger.js';
import { loadSpotifyConfig, saveTokensToConfig } from './configManager.js';

/**
 * Authorize Spotify using server-side flow
 * This function initializes a Spotify service and starts the server authorization flow
 */
export async function authorizeSpotify(): Promise<void> {
    const config = loadSpotifyConfig();

    if (!config.clientId || !config.clientSecret || !config.redirectUri) {
        logger.error('Missing Spotify configuration. Please check your spotify-config.json file or environment variables.');
        process.exit(1);
    }

    const redirectUri = new URL(config.redirectUri);
    if (redirectUri.hostname !== 'localhost' && redirectUri.hostname !== '127.0.0.1') {
        logger.error('Error: Redirect URI must use localhost for automatic token exchange');
        logger.error('Please update your configuration with a localhost redirect URI');
        logger.error('Example: https://localhost:8888/callback');
        process.exit(1);
    }

    const spotifyService = new SpotifyService(config);
    
    try {
        logger.info('Starting Spotify authorization flow...');
        const result = await spotifyService.serverAuthorize();
        
        if (result.success) {
            logger.info('Spotify authorization successful!');
            
            // Save tokens to config file
            const accessToken = spotifyService.getAccessToken();
            const refreshToken = spotifyService.getRefreshToken();
            const expiresAt = await spotifyService.getTokenExpiryTime();
            
            if (accessToken && refreshToken && expiresAt) {
                saveTokensToConfig({
                    accessToken,
                    refreshToken,
                    expiresAt
                });
                logger.info('Spotify tokens saved to configuration file');
            } else {
                logger.warn('Could not save tokens to config - missing token information');
            }
        } else {
            logger.error(`Spotify authorization failed: ${result.message}`);
            process.exit(1);
        }
    } catch (error) {
        logger.error('Error during Spotify authorization:', error);
        process.exit(1);
    }
}
