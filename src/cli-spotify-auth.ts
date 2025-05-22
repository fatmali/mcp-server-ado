#!/usr/bin/env node
import { authorizeSpotify } from './utils/authorizeSpotify.js';
import { loadSpotifyConfig } from './utils/configManager.js';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    logger.info('🎵 Starting Spotify server-side authorization...');
    
    try {
        // Check configuration
        const config = loadSpotifyConfig();
        
        if (!config.clientId || !config.clientSecret) {
            logger.error('❌ Missing required Spotify credentials.');
            logger.error('Please set the following environment variables:');
            logger.error('  - SPOTIFY_CLIENT_ID');
            logger.error('  - SPOTIFY_CLIENT_SECRET');
            logger.error('  - SPOTIFY_REDIRECT_URI (defaults to https://localhost:8888/callback)');
            process.exit(1);
        }
        
        // Run the authorization flow
        await authorizeSpotify();
        
        logger.info('✅ Spotify authorization completed successfully!');
        logger.info('You can now use the Spotify integration in your MCP server.');
    } catch (error) {
        logger.error('❌ Authorization failed:', error);
        process.exit(1);
    }
}

main();
