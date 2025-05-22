import SpotifyWebApi from 'spotify-web-api-node';
import { logger } from './utils/logger.js';
import { CacheService } from './services/cacheService.js';
import { loadSpotifyConfig } from './utils/configManager.js';

export interface SpotifyConfig {
    clientId: string;
    clientSecret: string;
    redirectUri?: string;
    stateKey?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
}

export interface UserPreferences {
    genres?: string[];
    energyLevel?: number;
    instrumentalPreference?: number;
    excludedArtists?: string[];
}

export interface MusicTrack {
    name: string;
    artist: string;
    url: string;
    id: string;
    features?: {
        energy: number;
        valence: number;
        tempo: number;
        instrumentalness: number;
    };
}

export class SpotifyService {
    private spotifyApi: SpotifyWebApi;
    private isAuthorized: boolean = false;
    private cache: CacheService;
    private stateKey: string;
    private refreshToken?: string;
    private configFilePath: string;

    constructor(config: SpotifyConfig) {
        this.spotifyApi = new SpotifyWebApi({
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            redirectUri: config.redirectUri
        });
        this.cache = new CacheService(3600); // 1 hour cache TTL
        this.stateKey = config.stateKey || 'spotify_auth_state';
        this.configFilePath = process.cwd() + '/spotify-config.json';
        
        // Load tokens from config if available
        if (config.accessToken && config.refreshToken) {
            this.spotifyApi.setAccessToken(config.accessToken);
            this.spotifyApi.setRefreshToken(config.refreshToken);
            this.refreshToken = config.refreshToken;
            this.isAuthorized = true;
            
            // Also cache tokens for backup
            this.cache.set('spotify_refresh_token', config.refreshToken, 30 * 24 * 3600); // Cache for 30 days
            if (config.expiresAt) {
                this.cache.set('spotify_token_expires', config.expiresAt, 
                    Math.floor((config.expiresAt - Date.now()) / 1000));
            }
            
            logger.info('Loaded Spotify tokens from config file');
        } else {
            // Try to load a cached refresh token as fallback only
            this.refreshToken = this.cache.get<string>('spotify_refresh_token') || undefined;
            if (this.refreshToken) {
                this.spotifyApi.setRefreshToken(this.refreshToken);
                logger.info('Loaded cached refresh token for Spotify (config file tokens not available)');
            }
        }
    }

    /**
     * Get the current access token
     */
    getAccessToken(): string | undefined {
        return this.spotifyApi.getAccessToken();
    }

    /**
     * Get the current refresh token
     */
    getRefreshToken(): string | undefined {
        return this.refreshToken;
    }

    /**
     * Get the token expiry timestamp
     */
    async getTokenExpiryTime(): Promise<number | undefined> {
        // First check config file
        try {
            const { loadSpotifyConfig } = await import('./utils/configManager.js');
            const config = loadSpotifyConfig();
            if (config.expiresAt) {
                return config.expiresAt;
            }
        } catch (error) {
            logger.warn('Could not read token expiry from config file:', error);
        }
        
        // Fallback to cache
        return this.cache.get<number>('spotify_token_expires');
    }

    async checkAuthStatus(): Promise<{
        isAuthorized: boolean;
        authUrl?: string;
        serverAuthAvailable?: boolean;
        message?: string;
    }> {
        // First try to load fresh tokens from config file
        try {
            const config = loadSpotifyConfig();

            logger.info("============================================");
            logger.info("Spotify Config:"+ JSON.stringify(config, null, 2));
            logger.info("============================================");
            
            // If config file has valid tokens, update our current tokens
            if (config.accessToken && config.refreshToken) {
                if (!this.refreshToken || this.refreshToken !== config.refreshToken) {
                    this.spotifyApi.setAccessToken(config.accessToken);
                    this.spotifyApi.setRefreshToken(config.refreshToken);
                    this.refreshToken = config.refreshToken;
                    
                    // Update cache as well
                    this.cache.set('spotify_refresh_token', config.refreshToken, 30 * 24 * 3600);
                    if (config.expiresAt) {
                        this.cache.set('spotify_token_expires', config.expiresAt, 
                            Math.floor((config.expiresAt - Date.now()) / 1000));
                    }
                    logger.info('Updated tokens from config file');
                }
                
                // Check if token has expired
                if (config.expiresAt && Date.now() > config.expiresAt - 300000) {
                    // Token expired or about to expire, refresh it
                    try {
                        await this.refreshAccessToken();
                        return {
                            isAuthorized: true,
                            message: "Successfully refreshed Spotify access"
                        };
                    } catch (error) {
                        // Refresh failed, need new authorization
                        const { url } = this.getAuthorizationUrl();
                        const redirectUri = this.spotifyApi.getRedirectURI();
                        const serverAuthAvailable = !!(redirectUri && 
                            (redirectUri.includes('localhost') || redirectUri.includes('127.0.0.1')));
                        
                        return {
                            isAuthorized: false,
                            authUrl: url,
                            serverAuthAvailable,
                            message: "Spotify authorization expired. Please re-authorize."
                        };
                    }
                }
                
                // Token valid and not expired
                return {
                    isAuthorized: true
                };
            }
        } catch (error) {
            logger.warn('Error reading from config file:', error);
            // Continue with cache-based check as fallback
        }
        
        // Fallback to cache-based check if config file check failed
        const tokenExpiry = this.cache.get<number>('spotify_token_expires');
        
        if (!this.refreshToken) {
            // No refresh token, need initial authorization
            const { url } = this.getAuthorizationUrl();
            const redirectUri = this.spotifyApi.getRedirectURI();
            const serverAuthAvailable = !!(redirectUri && 
                (redirectUri.includes('localhost') || redirectUri.includes('127.0.0.1')));
            
            return {
                isAuthorized: false,
                authUrl: url,
                serverAuthAvailable,
                message: "Spotify authorization required. Please authorize to control music playback."
            };
        } else if (!tokenExpiry || Date.now() > tokenExpiry - 300000) {
            // Token expired or about to expire, try to refresh
            try {
                await this.refreshAccessToken();
                return {
                    isAuthorized: true,
                    message: "Successfully refreshed Spotify access"
                };
            } catch (error) {
                // Refresh failed, need new authorization
                const { url } = this.getAuthorizationUrl();
                const redirectUri = this.spotifyApi.getRedirectURI();
                const serverAuthAvailable = !!(redirectUri && 
                    (redirectUri.includes('localhost') || redirectUri.includes('127.0.0.1')));
                
                return {
                    isAuthorized: false,
                    authUrl: url,
                    serverAuthAvailable,
                    message: "Spotify authorization expired. Please re-authorize."
                };
            }
        }
        
        return {
            isAuthorized: true
        };
    }

    /**
     * Refresh the access token using the refresh token
     */
    private async refreshAccessToken(): Promise<void> {
        try {
            const data = await this.spotifyApi.refreshAccessToken();
            this.spotifyApi.setAccessToken(data.body['access_token']);
            this.isAuthorized = true;
            
            // Calculate token expiry
            const expiresIn = data.body['expires_in'];
            const expiresAt = Date.now() + (expiresIn * 1000);
            
            // Save to config file first (primary storage)
            let configSaved = false;
            try {
                const { saveTokensToConfig } = await import('./utils/configManager.js');
                configSaved = saveTokensToConfig({
                    accessToken: data.body['access_token'],
                    refreshToken: this.refreshToken || '',
                    expiresAt: expiresAt
                });
                if (configSaved) {
                    logger.info('Saved refreshed Spotify tokens to config file');
                }
            } catch (saveError) {
                logger.warn('Could not save refreshed token to config file:', saveError);
            }
            
            // Cache the token expiry time as backup
            this.cache.set('spotify_token_expires', expiresAt, expiresIn);
            if (!configSaved) {
                // If config save failed, make sure at least the cache has the refresh token
                if (this.refreshToken) {
                    this.cache.set('spotify_refresh_token', this.refreshToken, 30 * 24 * 3600); // Cache for 30 days
                }
            }
            
            logger.info('Successfully refreshed Spotify access token');
        } catch (error) {
            logger.error('Error refreshing Spotify access token:', error);
            throw error;
        }
    }

    /**
     * Generate authorization URL for Spotify OAuth flow
     */
    getAuthorizationUrl(): { url: string, state: string } {
        if (!this.spotifyApi.getRedirectURI()) {
            throw new Error('Redirect URI is required for Authorization Code flow');
        }
        
        // Generate random state
        const state = this.generateRandomString(16);
        
        // Define the scopes needed for the application
        const scopes = [
            'user-read-playback-state', 
            'user-modify-playback-state', 
            'user-read-currently-playing',
            'streaming', 
            'playlist-read-private', 
            'playlist-modify-private',
            'playlist-modify-public',
            'user-read-private',
            'user-top-read'
        ];
        
        // Create the authorization URL
        const authorizeURL = this.spotifyApi.createAuthorizeURL(scopes, state);
        
        return { url: authorizeURL, state };
    }
    
    /**
     * Get current tokens for saving to config
     */
    async getTokens(): Promise<{ accessToken?: string; refreshToken?: string; expiresAt?: number }> {
        // Try to get expiry from config file first
        let expiresAt: number | undefined;
        try {
            const { loadSpotifyConfig } = await import('./utils/configManager.js');
            const config = loadSpotifyConfig();
            if (config.expiresAt) {
                expiresAt = config.expiresAt;
            }
        } catch (error) {
            // Fallback to cache
            expiresAt = this.cache.get<number>('spotify_token_expires');
        }
        
        return {
            accessToken: this.spotifyApi.getAccessToken() || undefined,
            refreshToken: this.refreshToken,
            expiresAt: expiresAt
        };
    }
    
    /**
     * Get current user profile information (for verification)
     */
    async getCurrentUserProfile(): Promise<any> {
        try {
            const response = await this.spotifyApi.getMe();
            return response.body;
        } catch (error) {
            logger.error('Error getting user profile:', error);
            throw error;
        }
    }

    /**
     * Search for tracks based on work item information and user preferences
     */
    async searchTracks(query: string, preferences?: UserPreferences): Promise<MusicTrack[]> {
        try {
            // Check authentication first
            const authStatus = await this.checkAuthStatus();
            if (!authStatus.isAuthorized) {
                throw new Error('Spotify authorization required');
            }

            // Basic tracks search with query
            const searchResult = await this.spotifyApi.searchTracks(query, { limit: 10 });
            
            if (!searchResult.body.tracks?.items.length) {
                return [];
            }

            // Map to our simplified track format
            return searchResult.body.tracks.items.map(track => ({
                name: track.name,
                artist: track.artists[0].name,
                url: track.external_urls.spotify,
                id: track.id
            }));
        } catch (error) {
            logger.error('Error searching for tracks:', error);
            throw error;
        }
    }

    /**
     * Get recommendations based on work item information
     */
    async getRecommendations(seedTracks: string[], preferences?: UserPreferences): Promise<MusicTrack[]> {
        try {
            // Check authentication first
            const authStatus = await this.checkAuthStatus();
            if (!authStatus.isAuthorized) {
                throw new Error('Spotify authorization required');
            }

            const options: any = {
                limit: 10,
                seed_tracks: seedTracks.slice(0, 5) // Spotify allows max 5 seed tracks
            };

            // Apply any user preferences if provided
            if (preferences) {
                if (preferences.genres && preferences.genres.length > 0) {
                    options.seed_genres = preferences.genres.slice(0, 5);
                }
                if (typeof preferences.energyLevel === 'number') {
                    options.target_energy = preferences.energyLevel;
                }
                if (typeof preferences.instrumentalPreference === 'number') {
                    options.target_instrumentalness = preferences.instrumentalPreference;
                }
            }

            const recommendationsResult = await this.spotifyApi.getRecommendations();
            
            return recommendationsResult.body.tracks.map(track => ({
                name: track.name,
                artist: track.artists[0].name,
                url: track.external_urls.spotify,
                id: track.id
            }));
        } catch (error) {
            logger.error('Error getting recommendations:', error);
            throw error;
        }
    }

    /**
     * Create a playlist with selected tracks
     */
    async createPlaylist(name: string, description: string, trackIds: string[]): Promise<{ 
        success: boolean, 
        playlistUrl?: string,
        message: string 
    }> {
        try {
            // Check authentication first
            const authStatus = await this.checkAuthStatus();
            if (!authStatus.isAuthorized) {
                return { 
                    success: false, 
                    message: 'Spotify authorization required to create playlists' 
                };
            }

            // First we need the user ID
            const me = await this.spotifyApi.getMe();
            const userId = me.body.id;

            // Create the playlist
            const playlistResult = await this.spotifyApi.createPlaylist(name, { 
                description: description,
                public: false
            });

            // Add tracks to the playlist
            const trackUris = trackIds.map(id => `spotify:track:${id}`);
            await this.spotifyApi.addTracksToPlaylist(playlistResult.body.id, trackUris);

            return {
                success: true,
                playlistUrl: playlistResult.body.external_urls.spotify,
                message: `Created playlist "${name}" with ${trackIds.length} tracks`
            };
        } catch (error) {
            logger.error('Error creating playlist:', error);
            return {
                success: false,
                message: `Error creating playlist: ${error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : 'Unknown error'}`
            };
        }
    }

    /**
     * Control playback on user's active device
     */
    async playTracks(trackIds: string[]): Promise<{ 
        success: boolean, 
        message: string 
    }> {
        try {
            logger.info('Starting playTracks with track IDs:', JSON.stringify(trackIds));
            logger.info('Track IDs array type check:', {
                isArray: Array.isArray(trackIds),
                length: trackIds.length,
                isEmpty: trackIds.length === 0,
                firstItem: trackIds.length > 0 ? trackIds[0] : 'none'
            });
            
            // Enhanced validation for track IDs
            if (!Array.isArray(trackIds) || trackIds.length === 0) {
                logger.warn('Empty or non-array trackIds provided to playTracks');
                return {
                    success: false,
                    message: 'No valid track IDs provided for playback'
                };
            }
            
            // Filter out invalid track IDs (empty strings, null, undefined, non-strings)
            const validTrackIds = trackIds.filter(id => typeof id === 'string' && id.trim() !== '');
            
            if (validTrackIds.length === 0) {
                logger.warn('No valid track IDs found in provided array:', JSON.stringify(trackIds));
                return {
                    success: false,
                    message: 'No valid track IDs provided for playback'
                };
            }
            
            // Log the valid track IDs we'll be using
            logger.info('Valid track IDs for playback:', JSON.stringify(validTrackIds));
            // Check authentication first
            const authStatus = await this.checkAuthStatus();
            logger.info('Auth status check result:', JSON.stringify(authStatus));
            
            if (!authStatus.isAuthorized) {
                logger.warn('Spotify not authorized for playback');
                return { 
                    success: false, 
                    message: 'Spotify authorization required to control playback' 
                };
            }

            // First check for active devices
            logger.info('Checking for available Spotify devices...');
            const devices = await this.spotifyApi.getMyDevices();
            logger.info('Available devices:', JSON.stringify(devices.body.devices.map(d => ({
                id: d.id,
                name: d.name,
                type: d.type,
                is_active: d.is_active,
                is_restricted: d.is_restricted,
                volume_percent: d.volume_percent
            }))));
            
            if (!devices.body.devices.length) {
                logger.warn('No Spotify devices found');
                return {
                    success: false,
                    message: "No active Spotify devices found. Please open Spotify on any device."
                };
            }
            
            // Get the first active device or the first available device
            const device = devices.body.devices.find(d => d.is_active) || devices.body.devices[0];
            logger.info('Selected device:', device ? JSON.stringify({
                id: device.id,
                name: device.name,
                type: device.type,
                is_active: device.is_active
            }) : 'No device found');
            
            if (!device || !device.id) {
                logger.warn('No valid Spotify device found');
                return {
                    success: false,
                    message: "Could not find a valid Spotify device"
                };
            }
            
            // Start playing the tracks
            const trackUris = validTrackIds.map(id => `spotify:track:${id}`);
            logger.info('Track URIs for playback:', JSON.stringify(trackUris));
            
            if (trackUris.length === 0) {
                logger.warn('No valid track URIs to play after filtering');
                return {
                    success: false,
                    message: "No valid tracks to play"
                };
            }
            
            logger.info('Starting playback with track URIs:', JSON.stringify(trackUris));
            logger.info('Using device ID:', device.id);
            
            try {
                const playResult = await this.spotifyApi.play({
                    device_id: device.id,
                    uris: trackUris
                });
                logger.info('Play API response status:', playResult.statusCode);
                logger.info('Play API response headers:', JSON.stringify(playResult.headers));
                
                // Check for any non-200 status that might indicate issues
                if (playResult.statusCode !== 200 && playResult.statusCode !== 204) {
                    logger.warn(`Unexpected status code: ${playResult.statusCode}`);
                }
            } catch (playError) {
                logger.error('Error during play API call:', playError);
                throw playError; // Re-throw to be caught by the outer catch
            }
            
            // Get current playback after starting to verify it worked
            try {
                const currentPlayback = await this.spotifyApi.getMyCurrentPlaybackState();
                logger.info('Current playback after starting:', 
                    currentPlayback.body.is_playing ? 'Playing' : 'Not playing',
                    currentPlayback.body.item ? `Track: ${(currentPlayback.body.item as any).name}` : 'No track info'
                );
            } catch (playbackError) {
                logger.warn('Could not verify playback status:', playbackError);
                // Don't fail the whole operation for this
            }
            
            logger.info('Playback successfully initiated');
            return {
                success: true,
                message: `Now playing ${validTrackIds.length} tracks on ${device.name}`
            };
        } catch (error) {
            logger.error('Error controlling playback:', error);
            // Log additional details about the error
            if (error instanceof Error) {
                logger.error('Error name:', error.name);
                logger.error('Error message:', error.message);
                logger.error('Error stack:', error.stack);
                
                // If it's a Spotify API error, it might have additional details
                const spotifyError = error as any;
                if (spotifyError.statusCode) {
                    logger.error('Spotify API status code:', spotifyError.statusCode);
                }
                if (spotifyError.body) {
                    logger.error('Spotify API error body:', JSON.stringify(spotifyError.body));
                }
            }
            
            return {
                success: false,
                message: `Error controlling playback: ${error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : 'Unknown error'}`
            };
        }
    }

    /**
     * Exchange authorization code for access and refresh tokens
     * @param code The authorization code returned from Spotify
     * @returns Promise with access token and refresh token
     */
    private async exchangeCodeForToken(code: string): Promise<{ access_token: string; refresh_token: string }> {
        const tokenUrl = 'https://accounts.spotify.com/api/token';
        const clientId = this.spotifyApi.getClientId();
        const clientSecret = this.spotifyApi.getClientSecret();
        const redirectUri = this.spotifyApi.getRedirectURI();
        
        // Encode client ID and secret for Basic authentication
        const base64Encode = (str: string): string => {
            return Buffer.from(str).toString('base64');
        };
        const authHeader = `Basic ${base64Encode(`${clientId}:${clientSecret}`)}`;

        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', redirectUri || '');

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Failed to exchange code for token: ${errorData}`);
        }

        const data = await response.json();
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
        };
    }

    /**
     * Server-side Spotify authorization that starts an HTTP server to handle the OAuth callback
     * @returns Promise that resolves when authorization is complete
     */
    async serverAuthorize(): Promise<{ success: boolean; message: string }> {
        if (!this.spotifyApi.getRedirectURI()) {
            throw new Error('Redirect URI is required for Authorization Code flow');
        }

        try {
            // Get the authorization URL
            const { url, state } = this.getAuthorizationUrl();
            const redirectUri = new URL(this.spotifyApi.getRedirectURI() || '');
            
            // Ensure we're using localhost for the server
            if (redirectUri.hostname !== 'localhost' && redirectUri.hostname !== '127.0.0.1') {
                return {
                    success: false,
                    message: 'Redirect URI must use localhost for automatic token exchange'
                };
            }

            const port = redirectUri.port || '80';
            const callbackPath = redirectUri.pathname || '/callback';

            // Create a promise that will resolve when the auth flow is complete
            return new Promise<{ success: boolean; message: string }>(async (resolve, reject) => {
                // Import the server creator utility
                const { createServer } = await import('./utils/createHttpsServer.js');
                
                // Create the server
                const server = createServer(redirectUri, async (req: any, res: any) => {
                    if (!req.url) {
                        res.end('No URL provided');
                        return;
                    }
                    
                    // Make sure we use the correct protocol in the URL constructor
                    const isHttps = redirectUri.protocol === 'https:';
                    const reqUrl = new URL(req.url, `http${isHttps ? 's' : ''}://localhost:${port}`);

                    if (reqUrl.pathname === callbackPath) {
                        const code = reqUrl.searchParams.get('code');
                        const returnedState = reqUrl.searchParams.get('state');
                        const error = reqUrl.searchParams.get('error');

                        res.writeHead(200, { 'Content-Type': 'text/html' });

                        if (error) {
                            logger.error(`Authorization error: ${error}`);
                            res.end(
                                '<html><body><h1>Authentication Failed</h1><p>Please close this window and try again.</p></body></html>'
                            );
                            if (server) server.close();
                            resolve({
                                success: false,
                                message: `Authorization failed: ${error}`
                            });
                            return;
                        }

                        if (returnedState !== state) {
                            logger.error('State mismatch error');
                            res.end(
                                '<html><body><h1>Authentication Failed</h1><p>State verification failed. Please close this window and try again.</p></body></html>'
                            );
                            if (server) server.close();
                            resolve({
                                success: false,
                                message: 'State mismatch'
                            });
                            return;
                        }

                        if (!code) {
                            logger.error('No authorization code received');
                            res.end(
                                '<html><body><h1>Authentication Failed</h1><p>No authorization code received. Please close this window and try again.</p></body></html>'
                            );
                            if (server) server.close();
                            resolve({
                                success: false,
                                message: 'No authorization code received'
                            });
                            return;
                        }

                        try {
                            // Exchange the authorization code for tokens using fetch
                            const tokens = await this.exchangeCodeForToken(code);
                            
                            // Set the access token and refresh token
                            this.spotifyApi.setAccessToken(tokens.access_token);
                            this.spotifyApi.setRefreshToken(tokens.refresh_token);
                            this.refreshToken = tokens.refresh_token;
                            this.isAuthorized = true;
                            
                            // Calculate token expiry (standard expiry for Spotify is 1 hour)
                            const expiresIn = 3600;
                            const expiresAt = Date.now() + (expiresIn * 1000);
                            
                            // Save tokens to config file (primary storage)
                            let configSaved = false;
                            try {
                                const { saveTokensToConfig } = await import('./utils/configManager.js');
                                configSaved = saveTokensToConfig({
                                    accessToken: tokens.access_token,
                                    refreshToken: tokens.refresh_token,
                                    expiresAt: expiresAt
                                });
                                if (configSaved) {
                                    logger.info('Saved Spotify tokens to configuration file');
                                }
                            } catch (saveError) {
                                logger.warn('Could not save tokens to config file:', saveError);
                            }
                            
                            // Also cache the tokens as backup
                            this.cache.set('spotify_refresh_token', tokens.refresh_token, 30 * 24 * 3600); // Cache for 30 days
                            this.cache.set('spotify_token_expires', expiresAt, expiresIn);
                            
                            logger.info('Successfully authorized with Spotify using authorization code flow');
                            
                            res.end(
                                '<html><body><h1>Authentication Successful!</h1><p>You can now close this window and return to the application.</p></body></html>'
                            );
                            if (server) server.close();
                            resolve({
                                success: true,
                                message: 'Authentication successful'
                            });
                        } catch (error) {
                            logger.error('Token exchange error:', error);
                            res.end(
                                '<html><body><h1>Authentication Failed</h1><p>Failed to exchange authorization code for tokens. Please close this window and try again.</p></body></html>'
                            );
                            if (server) server.close();
                            resolve({
                                success: false,
                                message: `Token exchange error: ${error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : 'Unknown error'}`
                            });
                        }
                    } else {
                        res.writeHead(404);
                        res.end();
                    }
                });
                
                if (!server) {
                    resolve({
                        success: false,
                        message: "Failed to create server for authentication. Check SSL certificates if using HTTPS."
                    });
                    return;
                }

                server.listen(Number.parseInt(port), '127.0.0.1', () => {
                    logger.info(`Listening for Spotify authentication callback on port ${port}`);
                    logger.info('Please visit this URL to authorize:');
                    logger.info(url);
                });

                server.on('error', (error) => {
                    logger.error(`Server error: ${error.message}`);
                    resolve({
                        success: false,
                        message: `Server error: ${error.message}`
                    });
                });
            });
        } catch (error) {
            logger.error('Error starting server authorization:', error);
            return {
                success: false,
                message: `Error starting server authorization: ${error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : 'Unknown error'}`
            };
        }
    }

    /**
     * Generate random string for state parameter
     */
    private generateRandomString(length: number): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let text = '';
        
        for (let i = 0; i < length; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        
        return text;
    }

    /**
     * Get the current user's top tracks
     */
    async getUserTopTracks(timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term', limit: number = 20): Promise<MusicTrack[]> {
        try {
            // Check authentication first
            const authStatus = await this.checkAuthStatus();
            if (!authStatus.isAuthorized) {
                throw new Error('Spotify authorization required');
            }

            const response = await this.spotifyApi.getMyTopTracks({
                time_range: timeRange,
                limit: limit
            });

            return response.body.items.map(track => ({
                name: track.name,
                artist: track.artists[0].name,
                url: track.external_urls.spotify,
                id: track.id
            }));
        } catch (error) {
            logger.error('Error getting user top tracks:', error);
            throw error;
        }
    }

    /**
     * Get the top genres from a user's top tracks/artists
     */
    async getUserTopGenres(timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term'): Promise<string[]> {
        try {
            // Check authentication first
            const authStatus = await this.checkAuthStatus();
            if (!authStatus.isAuthorized) {
                throw new Error('Spotify authorization required');
            }

            // Get user's top artists to extract genres
            logger.info(`Getting user top artists with time range: ${timeRange}`);
            const response = await this.spotifyApi.getMyTopArtists({
                time_range: timeRange,
                limit: 20
            });

            // Check if we have valid artist data
            if (!response.body.items || response.body.items.length === 0) {
                logger.warn('No top artists found for user');
                return ['pop', 'rock', 'electronic']; // Safe fallback
            }

            // Extract all genres from top artists
            const allGenres: string[] = [];
            response.body.items.forEach(artist => {
                if (artist.genres && artist.genres.length > 0) {
                    allGenres.push(...artist.genres);
                }
            });
            
            // If no genres were found at all, return safe defaults
            if (allGenres.length === 0) {
                logger.warn('No genres found in user top artists');
                return ['pop', 'rock', 'electronic'];
            }

            // Count genre occurrences
            const genreCounts: Record<string, number> = {};
            allGenres.forEach(genre => {
                genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            });

            // Sort genres by frequency and return top 5
            const topGenres = Object.entries(genreCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(entry => entry[0]);
                
            logger.info(`Retrieved ${topGenres.length} top genres: ${topGenres.join(', ')}`);
            return topGenres;
        } catch (error) {
            logger.error('Error getting user top genres:', error);
            // Return safe fallback genres instead of throwing
            return ['pop', 'rock', 'electronic', 'classical', 'jazz'];
        }
    }

    /**
     * Determine the best music for a work item based on user's top tracks and work item content
     * This is a simplified method that just returns top tracks to avoid errors
     */
    async determineBestMusic(workItemTitle: string, workItemDescription: string): Promise<{
        tracks: MusicTrack[],
        recommendation: string
    }> {
        try {
            // Check authentication first
            const authStatus = await this.checkAuthStatus();
            if (!authStatus.isAuthorized) {
                throw new Error('Spotify authorization required');
            }

            // Simply get user's top tracks - most reliable approach
            const topTracks = await this.getUserTopTracks('medium_term', 10);
            
            return {
                tracks: topTracks,
                recommendation: "Selected music based on your listening preferences"
            };
        } catch (error) {
            logger.error('Error determining best music:', error);
            throw new Error(`Failed to select music: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Choose music based on work item description using LLM-style analysis
     * This method provides a more reliable alternative to determineBestMusic
     */
    async chooseMusicByContent(workItemTitle: string, workItemDescription: string): Promise<{
        tracks: MusicTrack[],
        recommendation: string
    }> {
        try {
            // Check authentication first
            const authStatus = await this.checkAuthStatus();
            if (!authStatus.isAuthorized) {
                throw new Error('Spotify authorization required');
            }

            // Get user's top genres - this helps personalize recommendations
            let topGenres: string[] = [];
            try {
                topGenres = await this.getUserTopGenres();
                logger.info('Retrieved user top genres:', topGenres);
                
                // If no genres were returned, use fallback genres
                if (topGenres.length === 0) {
                    logger.warn('No user top genres returned, using fallback genres');
                    topGenres = ['rock', 'pop', 'electronic', 'classical', 'jazz'];
                }
            } catch (error) {
                logger.warn('Could not fetch user top genres, using fallback genres:', error);
                // Fallback genres if we can't get user preferences
                topGenres = ['rock', 'pop', 'electronic', 'classical', 'jazz'];
            }
            
            // Extract keywords from the work item
            const keywords = this.extractKeywords(workItemTitle, workItemDescription);
            
            // Analyze the work item content to determine the type of work
            const workType = this.analyzeWorkType(workItemTitle, workItemDescription);
            
            // Determine appropriate music characteristics based on work type
            const musicParams = this.getMusicParametersForWorkType(workType);
            
            // Build search criteria
            const searchQuery = keywords.slice(0, 3).join(' '); // Use top 3 keywords
            
            // Get recommendations
            const options: any = {
                limit: 10,
                seed_genres: topGenres.slice(0, 3) // Use up to 3 genres
            };
            
            // Apply music parameters
            if (musicParams.energy !== undefined) {
                options.target_energy = musicParams.energy;
            }
            if (musicParams.tempo !== undefined) {
                options.target_tempo = musicParams.tempo;
            }
            if (musicParams.instrumentalness !== undefined) {
                options.target_instrumentalness = musicParams.instrumentalness;
            }
            
            // First try with keywords and genres
            let recommendationsResult;
            try {
                logger.info('Getting recommendations with options:', JSON.stringify(options));
                recommendationsResult = await this.spotifyApi.getRecommendations(options);
                
                // Check if we got valid recommendations
                if (!recommendationsResult.body.tracks || recommendationsResult.body.tracks.length === 0) {
                    logger.warn('No tracks returned from recommendations API, trying fallback');
                    throw new Error('No tracks returned');
                }
            } catch (error) {
                logger.warn('Error getting recommendations with genres, falling back:', error);
                // Fallback: try a simpler recommendation with fewer parameters
                try {
                    const fallbackOptions = {
                        limit: 10,
                        seed_genres: ['pop', 'rock'] // Very safe fallback
                    };
                    logger.info('Trying fallback recommendations with:', JSON.stringify(fallbackOptions));
                    recommendationsResult = await this.spotifyApi.getRecommendations(fallbackOptions);
                } catch (fallbackError) {
                    logger.error('Fallback recommendations also failed:', fallbackError);
                    throw new Error('Failed to get music recommendations');
                }
            }
            
            // Convert to our track format
            if (!recommendationsResult.body.tracks || recommendationsResult.body.tracks.length === 0) {
                logger.warn('No tracks in recommendations result, providing backup playlist');
                // If we still don't have tracks, create a fallback message
                return {
                    tracks: [],
                    recommendation: "I couldn't find music specifically for your work item. Please try again later or try a different approach."
                };
            }
            
            const tracks = recommendationsResult.body.tracks.map(track => ({
                name: track.name,
                artist: track.artists[0].name,
                url: track.external_urls.spotify,
                id: track.id
            }));
            
            logger.info(`Successfully mapped ${tracks.length} tracks from recommendations`);
            logger.info('First few track IDs:', tracks.slice(0, 3).map(t => t.id).join(', '));
            
            // Generate a recommendation explanation based on work type
            const recommendation = this.generateContentBasedRecommendation(
                workType,
                tracks,
                topGenres,
                keywords
            );
            
            return {
                tracks,
                recommendation
            };
        } catch (error) {
            // Handle errors more gracefully - return a fallback playlist
            logger.error('Error choosing music by content, using fallback playlist:', error);
            
            // Attempt to get generic recommendations with popular genres
            try {
                const fallbackOptions = {
                    limit: 10,
                    seed_genres: ['pop', 'rock']
                };
                logger.info('Attempting ultimate fallback with options:', JSON.stringify(fallbackOptions));
                
                const fallbackResult = await this.spotifyApi.getRecommendations(fallbackOptions);
                
                // Ensure we have tracks before mapping
                if (!fallbackResult.body.tracks || fallbackResult.body.tracks.length === 0) {
                    logger.warn('Ultimate fallback returned no tracks');
                    return {
                        tracks: [],
                        recommendation: "I couldn't find any music at the moment. Please try again later."
                    };
                }
                
                const fallbackTracks = fallbackResult.body.tracks.map(track => ({
                    name: track.name,
                    artist: track.artists[0].name,
                    url: track.external_urls.spotify,
                    id: track.id
                }));
                
                logger.info(`Successfully created fallback playlist with ${fallbackTracks.length} tracks`);
                
                return {
                    tracks: fallbackTracks,
                    recommendation: "I've selected some generally productive music since I couldn't analyze your work item specifically."
                };
            } catch (fallbackError) {
                // If even the fallback fails, log the error and return empty result with message
                logger.error('Ultimate fallback recommendation failed:', fallbackError);
                return {
                    tracks: [],
                    recommendation: "I couldn't find any music at the moment. Please try again later or check your Spotify connection."
                };
            }
        }
    }
    
    /**
     * Extract simple keywords from a work item title and description
     * This is a very simple implementation to avoid complexity
     */
    private extractKeywords(title: string, description: string): string[] {
        // Combine title and description
        const text = `${title} ${description}`.toLowerCase();
        
        // Split by non-alphanumeric characters
        const words = text.split(/[^a-z0-9]+/);
        
        // Filter out common words and short words
        const stopWords = ['the', 'and', 'or', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of', 'is', 'are', 'was', 'were'];
        const keywords = words.filter(word => 
            word.length > 2 && !stopWords.includes(word)
        );
        
        // Return unique keywords
        return [...new Set(keywords)];
    }
    
    /**
     * Analyze work item to determine the type of work required
     */
    private analyzeWorkType(title: string, description: string): string {
        const combined = (title + ' ' + description).toLowerCase();
        
        // Identify different work types
        if (combined.includes('bug') || combined.includes('fix') || combined.includes('issue') || 
            combined.includes('error') || combined.includes('problem')) {
            return 'bug-fixing';
        }
        
        if (combined.includes('design') || combined.includes('sketch') || combined.includes('wireframe') ||
            combined.includes('mockup') || combined.includes('layout')) {
            return 'design';
        }
        
        if (combined.includes('research') || combined.includes('explore') || combined.includes('investigate') ||
            combined.includes('analyze') || combined.includes('study')) {
            return 'research';
        }
        
        if (combined.includes('meeting') || combined.includes('discuss') || combined.includes('collaboration') ||
            combined.includes('review') || combined.includes('planning')) {
            return 'collaboration';
        }
        
        if (combined.includes('code') || combined.includes('implement') || combined.includes('develop') ||
            combined.includes('program') || combined.includes('feature')) {
            return 'coding';
        }
        
        if (combined.includes('test') || combined.includes('qa') || combined.includes('quality') ||
            combined.includes('verification') || combined.includes('validation')) {
            return 'testing';
        }
        
        if (combined.includes('document') || combined.includes('write') || combined.includes('report') ||
            combined.includes('spec') || combined.includes('specification')) {
            return 'writing';
        }
        
        // Default to general development
        return 'general-development';
    }
    
    /**
     * Get appropriate music parameters based on work type
     */
    private getMusicParametersForWorkType(workType: string): {
        energy?: number;
        tempo?: number;
        instrumentalness?: number;
    } {
        switch (workType) {
            case 'bug-fixing':
                // Focused music with medium energy
                return {
                    energy: 0.6,
                    tempo: 100,
                    instrumentalness: 0.7
                };
            
            case 'design':
                // Creative, inspiring music
                return {
                    energy: 0.5,
                    tempo: 85,
                    instrumentalness: 0.4
                };
                
            case 'research':
                // Calm, contemplative music
                return {
                    energy: 0.3,
                    tempo: 75,
                    instrumentalness: 0.8
                };
                
            case 'collaboration':
                // Energetic, upbeat music
                return {
                    energy: 0.7,
                    tempo: 120,
                    instrumentalness: 0.3
                };
                
            case 'coding':
                // Steady, focused music
                return {
                    energy: 0.5,
                    tempo: 90,
                    instrumentalness: 0.6
                };
                
            case 'testing':
                // Methodical, structured music
                return {
                    energy: 0.4,
                    tempo: 85,
                    instrumentalness: 0.5
                };
                
            case 'writing':
                // Gentle, non-distracting music
                return {
                    energy: 0.3,
                    tempo: 80,
                    instrumentalness: 0.7
                };
                
            case 'general-development':
            default:
                // Balanced music
                return {
                    energy: 0.5,
                    tempo: 95,
                    instrumentalness: 0.5
                };
        }
    }
    
    /**
     * Generate a human-readable recommendation based on content analysis
     */
    private generateContentBasedRecommendation(
        workType: string,
        tracks: MusicTrack[],
        genres: string[],
        keywords: string[]
    ): string {
        let explanation = "";
        
        // Personalize based on work type
        switch (workType) {
            case 'bug-fixing':
                explanation = "I've selected focused, structured music to help you concentrate on fixing this bug. ";
                break;
                
            case 'design':
                explanation = "I've chosen creative, inspiring tracks to enhance your design process. ";
                break;
                
            case 'research':
                explanation = "I've picked calm, contemplative music that's perfect for deep research and analysis. ";
                break;
                
            case 'collaboration':
                explanation = "I've selected energetic, upbeat music to maintain a positive atmosphere for collaboration. ";
                break;
                
            case 'coding':
                explanation = "I've chosen steady, focused tracks that are ideal for coding sessions. ";
                break;
                
            case 'testing':
                explanation = "I've selected methodical music to help with your testing and quality assurance work. ";
                break;
                
            case 'writing':
                explanation = "I've picked gentle, non-distracting music that's perfect for documentation and writing. ";
                break;
                
            case 'general-development':
            default:
                explanation = "I've selected balanced tracks that should complement your development work. ";
                break;
        }
        
        // Add genre information if available
        if (genres.length > 0) {
            explanation += `The music draws from your preferred genres like ${genres.slice(0, 3).join(', ')}. `;
        }
        
        // Mention work context if keywords available
        if (keywords.length > 0) {
            explanation += `I considered aspects of your work like ${keywords.slice(0, 3).join(', ')}. `;
        }
        
        // Add artist information
        if (tracks.length > 0) {
            explanation += `The playlist includes artists such as ${tracks.slice(0, 3).map(t => t.artist).join(', ')}.`;
        }
        
        return explanation;
    }
}
