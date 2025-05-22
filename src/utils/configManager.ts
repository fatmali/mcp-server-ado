import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from './logger.js';
import { SpotifyConfig } from '../spotify.js';
import { log } from 'console';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the config file (look in multiple locations)
// First try the project root directory (for development)
const PROJECT_ROOT = path.resolve(dirname(dirname(__dirname)));
const CONFIG_LOCATIONS = [
  path.resolve(PROJECT_ROOT, 'spotify-config.json'),            // Project root
];

// Example config is always relative to the project root
const EXAMPLE_CONFIG_PATH = path.resolve(PROJECT_ROOT, 'spotify-config.example.json');

// Active config file path (will be set when findConfigFile is called)
let activeConfigPath: string | null = null;

/**
 * Find the first existing config file from the possible locations
 */
function findConfigFile(): string | null {
  for (const location of CONFIG_LOCATIONS) {
    if (fs.existsSync(location)) {
      logger.info(`Found Spotify config file at: ${location}`);
      activeConfigPath = location;
      return location;
    }
  }
  return null;
}

/**
 * Get the active configuration file path
 * If no file exists yet, returns the first possible location
 */
function getConfigFilePath(): string {
  if (activeConfigPath) {
    return activeConfigPath;
  }
  
  // Find existing config file
  const existingPath = findConfigFile();
  if (existingPath) {
    return existingPath;
  }
  
  // Default to the first location if no file exists
  activeConfigPath = CONFIG_LOCATIONS[0];
  return activeConfigPath;
}

/**
 * Load Spotify configuration from config file or environment variables
 */
export function loadSpotifyConfig(): SpotifyConfig {
  const configFilePath = findConfigFile();
  
  if (!configFilePath) {
    logger.error(`Spotify configuration file not found. Tried: ${CONFIG_LOCATIONS.join(', ')}`);
    throw new Error(
      `Spotify configuration file not found. Please create one with clientId, clientSecret, and redirectUri.`,
    );
  }

  try {
    const fileContents = fs.readFileSync(configFilePath, 'utf8');
    
    // Check if file is empty or contains invalid content
    if (!fileContents || fileContents.trim() === '') {
      throw new Error(`Spotify configuration file is empty: ${configFilePath}`);
    }
    
    // Try to parse the JSON content
    const config = JSON.parse(fileContents);
    
    if (!config.clientId || !config.clientSecret || !config.redirectUri) {
      throw new Error(
        'Spotify configuration must include clientId, clientSecret, and redirectUri.',
      );
    }
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      // JSON parsing error - provide more details
      logger.error('JSON parsing error in Spotify config file:', error);
      
      // Try to read the raw file content to debug
      try {
        const rawContent = fs.readFileSync(configFilePath, 'utf8');
        logger.error('Raw file content:', rawContent.substring(0, 100) + '...');
      } catch (readError) {
        logger.error('Failed to read raw file content:', readError);
      }
    }
    
    throw new Error(
      `Failed to parse Spotify configuration: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Save tokens to config file
 */
export function saveTokensToConfig(tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}): boolean {
    try {
        // Validate tokens
        if (!tokens.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
            logger.error('Invalid tokens provided to saveTokensToConfig:', 
                JSON.stringify({
                    hasAccessToken: !!tokens.accessToken,
                    hasRefreshToken: !!tokens.refreshToken,
                    hasExpiresAt: !!tokens.expiresAt
                })
            );
            return false;
        }

        // First verify the config file integrity
        const isConfigValid = verifyConfigFileIntegrity();
        const configFilePath = getConfigFilePath();
        
        // If config file doesn't exist yet or is invalid, create it
        if (!isConfigValid) {
            if (fs.existsSync(EXAMPLE_CONFIG_PATH)) {
                fs.copyFileSync(EXAMPLE_CONFIG_PATH, configFilePath);
                logger.info(`Created config file from example at ${configFilePath}`);
            } else {
                const defaultConfig = {
                    clientId: process.env.SPOTIFY_CLIENT_ID || '',
                    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
                    redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:8888/callback'
                };
                fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 2));
                logger.info(`Created default config file at ${configFilePath}`);
            }
        } else {
            // If config is valid, create a backup
            backupConfigFile();
        }
        
        // Read current config
        const fileContent = fs.readFileSync(configFilePath, 'utf8');
        if (!fileContent || fileContent.trim() === '') {
            throw new Error(`Config file exists but is empty: ${configFilePath}`);
        }
        
        const configData = JSON.parse(fileContent);
        
        // Update with tokens
        configData.accessToken = tokens.accessToken;
        configData.refreshToken = tokens.refreshToken;
        configData.expiresAt = tokens.expiresAt;
        
        // Stringify with proper formatting
        const updatedConfigStr = JSON.stringify(configData, null, 2);
        
        // Write updated config using a safer method
        // First write to a temporary file
        const tempPath = `${configFilePath}.tmp`;
        fs.writeFileSync(tempPath, updatedConfigStr);
        
        // Then rename the temporary file to the actual config file
        fs.renameSync(tempPath, configFilePath);
        
        // Verify the file was written correctly
        const verifyContent = fs.readFileSync(configFilePath, 'utf8');
        if (!verifyContent || verifyContent.trim() === '') {
            throw new Error('Config file was not written properly');
        }
        
        logger.info(`Updated Spotify tokens in config file at ${configFilePath}`);
        return true;
    } catch (error) {
        logger.error('Error saving tokens to config file:', error);
        
        // Try to restore from backup if save failed
        try {
            const configFilePath = getConfigFilePath();
            const backupPath = `${configFilePath}.bak`;
            if (fs.existsSync(backupPath)) {
                fs.copyFileSync(backupPath, configFilePath);
                logger.info('Restored config file from backup after save error');
            }
        } catch (restoreError) {
            logger.error('Failed to restore config from backup:', restoreError);
        }
        
        return false;
    }
}

/**
 * Verifies the integrity of the Spotify config file
 * and attempts to fix it if it's corrupted
 */
export function verifyConfigFileIntegrity(): boolean {
    try {
        const configFilePath = findConfigFile();
        if (!configFilePath) {
            logger.warn('Config file does not exist in any of the searched locations');
            return false;
        }

        const fileContent = fs.readFileSync(configFilePath, 'utf8');
        if (!fileContent || fileContent.trim() === '') {
            logger.warn(`Config file is empty: ${configFilePath}, attempting to restore from example`);
            if (fs.existsSync(EXAMPLE_CONFIG_PATH)) {
                fs.copyFileSync(EXAMPLE_CONFIG_PATH, configFilePath);
                logger.info(`Restored config file from example at ${configFilePath}`);
                return true;
            }
            return false;
        }

        // Try to parse the JSON content to verify it's valid
        try {
            const config = JSON.parse(fileContent);
            // Check if required fields exist
            const hasRequiredFields = config.clientId && config.clientSecret && config.redirectUri;
            return hasRequiredFields;
        } catch (parseError) {
            logger.error(`Config file contains invalid JSON: ${configFilePath}, attempting to restore from backup or example`);
            
            // Try to restore from a backup if available
            const backupPath = `${configFilePath}.bak`;
            if (fs.existsSync(backupPath)) {
                fs.copyFileSync(backupPath, configFilePath);
                logger.info(`Restored config file from backup at ${configFilePath}`);
                return true;
            }
            
            // If no backup, try to use the example
            if (fs.existsSync(EXAMPLE_CONFIG_PATH)) {
                fs.copyFileSync(EXAMPLE_CONFIG_PATH, configFilePath);
                logger.info(`Restored config file from example at ${configFilePath}`);
                return true;
            }
            
            return false;
        }
    } catch (error) {
        logger.error('Error verifying config file integrity:', error);
        return false;
    }
}

/**
 * Creates a backup of the current config file
 */
export function backupConfigFile(): boolean {
    try {
        const configFilePath = findConfigFile();
        if (!configFilePath) {
            logger.warn('Cannot backup non-existent config file');
            return false;
        }

        const backupPath = `${configFilePath}.bak`;
        fs.copyFileSync(configFilePath, backupPath);
        logger.info(`Created backup of config file at ${backupPath}`);
        return true;
    } catch (error) {
        logger.error('Error creating config file backup:', error);
        return false;
    }
}
