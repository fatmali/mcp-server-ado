import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fetchWorkItem, AzureDevOpsConfig, createWorkItemLLMPrompt } from "./utils.js";
import {
  SpotifyService,
  SpotifyConfig,
  UserPreferences,
} from "./spotify.js";
import dotenv from "dotenv";
import { logger } from "./utils/logger.js";
import { loadSpotifyConfig } from "./utils/configManager.js";
import { WorkItemAnalyzer } from "./services/workItemAnalyzer.js";

// Create MCP server with default configuration values
const server = new McpServer({
  name: "bugbeats-mcp",
  version: "0.1.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Load environment variables
dotenv.config();

function getConfig(): { azure: AzureDevOpsConfig; spotify: SpotifyConfig } {
  // Azure config from environment variables
  const azure = {
    organization: process.env.AZURE_DEVOPS_ORG || "",
    patToken: process.env.AZURE_DEVOPS_PAT,
    project: process.env.AZURE_DEVOPS_PROJECT,
    areaPath: process.env.AZURE_DEVOPS_AREA_PATH,
    repository: process.env.AZURE_DEVOPS_REPO,
  };

  // Load Spotify config from config file (or fallback to env vars)
  const spotify = loadSpotifyConfig();

  return { azure, spotify };
}

// Initialize Spotify service
let spotifyService: SpotifyService | null = null;
// Initialize WorkItemAnalyzer
const workItemAnalyzer = new WorkItemAnalyzer();

server.tool("play-music", "Play music with optional mood, artist, and track parameters", {
    trackTitle: z.string().describe("Title of the track to search"),
    trackArtist: z.string().optional().describe("Artist of the track to search"),
    numberOfTracks: z.number().optional().describe("Number of tracks to play (default: 1)"),
    mood: z.string().optional().describe("Desired mood for the music (energetic, productive, tense, urgent, focused, calm)"),
    energyLevel: z.number().optional().describe("Desired energy level (0.0-1.0)"),
    instrumentalPreference: z.number().optional().describe("Preference for instrumental music (0.0-1.0)"),
}, async (args, extra) => {
    const { trackTitle, trackArtist, numberOfTracks = 1, mood, energyLevel, instrumentalPreference } = args;
    const config = getConfig();
    if (!config.spotify.clientId || !config.spotify.clientSecret) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: "Spotify is not configured. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your .env file.",
                },
            ],
        };
    }
    // Initialize Spotify service if not already done
    if (!spotifyService) {
        spotifyService = new SpotifyService(config.spotify);
    }
    if (!spotifyService) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: "Spotify is not configured. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your .env file.",
                },
            ],
        };
    }
    // First check authorization status
    const authStatus = await spotifyService.checkAuthStatus();
    if (!authStatus.isAuthorized) {
        logger.error(
            "Spotify authorization required, run npm run spotify-auth to authorize."
        ); 
    }
    
    // Determine if specific music preferences should be applied
    // Create user preferences object with explicitly provided parameters
    const userPreferences: UserPreferences = {};
    
    // Apply explicitly provided parameters if available
    if (typeof energyLevel === 'number' && energyLevel >= 0 && energyLevel <= 1) {
        userPreferences.energyLevel = energyLevel;
    }
    
    if (typeof instrumentalPreference === 'number' && instrumentalPreference >= 0 && instrumentalPreference <= 1) {
        userPreferences.instrumentalPreference = instrumentalPreference;
    }
    
    // If mood is provided, set appropriate energy and instrumental preferences
    if (mood) {
        switch(mood.toLowerCase()) {
            case 'energetic':
                userPreferences.energyLevel = userPreferences.energyLevel ?? 0.8;
                break;
            case 'productive':
                userPreferences.energyLevel = userPreferences.energyLevel ?? 0.6;
                break;
            case 'tense':
            case 'urgent':
                userPreferences.energyLevel = userPreferences.energyLevel ?? 0.7;
                break;
            case 'focused':
                userPreferences.energyLevel = userPreferences.energyLevel ?? 0.5;
                userPreferences.instrumentalPreference = userPreferences.instrumentalPreference ?? 0.7;
                break;
            case 'calm':
                userPreferences.energyLevel = userPreferences.energyLevel ?? 0.3;
                userPreferences.instrumentalPreference = userPreferences.instrumentalPreference ?? 0.6;
                break;
        }
    }
    
    // If no explicit parameters, look for keywords in the track title
    if (Object.keys(userPreferences).length === 0) {
        const lowerTitle = trackTitle.toLowerCase();
        if (lowerTitle.includes('study') || lowerTitle.includes('focus') || lowerTitle.includes('concentration')) {
            userPreferences.instrumentalPreference = 0.8; // Prefer instrumental for focus
            userPreferences.energyLevel = 0.4; // Lower energy for concentration
        } else if (lowerTitle.includes('workout') || lowerTitle.includes('energy') || lowerTitle.includes('pump')) {
            userPreferences.energyLevel = 0.9; // High energy
        } else if (lowerTitle.includes('relax') || lowerTitle.includes('calm') || lowerTitle.includes('sleep')) {
            userPreferences.energyLevel = 0.2; // Very low energy
            userPreferences.instrumentalPreference = 0.7; // Prefer instrumental
        }
    }
    const content: { type: "text"; text: string }[] = [
        {
            type: "text" as const,
            text: `Searching for track "${trackTitle}" by ${trackArtist || "any artist"}...\n`,
        }
    ]
    try {
        // Search for the track
        const searchQuery = `${trackTitle} ${trackArtist || ""}`;
        const searchResults = await spotifyService.searchTracks(searchQuery, userPreferences);

        if (searchResults.length === 0) {
            content.push({
                type: "text" as const,
                text: `No results found for "${searchQuery}".`,
            });
            return { content };
        }

        // Show the search results
        content.push({
            type: "text" as const,
            text: `Found ${searchResults.length} results.\n`,
        });

        // Get the tracks to play (limited by number requested or available results)
        const tracksToPlay = searchResults.slice(0, Math.min(numberOfTracks, searchResults.length));
        const trackIds = tracksToPlay.map(track => track.id);
        
        // Play the selected tracks
        const playResult = await spotifyService.playTracks(trackIds);
        if (playResult.success) {
            content.push({
                type: "text" as const,
                text: `Playing ${tracksToPlay.length} tracks:`,
            });
            
            // List the tracks that will play
            tracksToPlay.forEach((track, index) => {
                content.push({
                    type: "text" as const,
                    text: `${index + 1}. "${track.name}" by ${track.artist}`,
                });
            });
        } else {
            content.push({
                type: "text" as const,
                text: `Error playing tracks: ${playResult.message}`,
            });
        }

    } catch (error) {
        content.push({
            type: "text" as const,
            text: `Error searching for track: ${
                error instanceof Error
                    ? error.message
                    : typeof error === "object"
                    ? JSON.stringify(error)
                    : "Unknown error"
            }`,
        });
    }
    return { content };
});

server.tool("get-in-the-flow", "Given a work item id, curate and play music for the user to get in flow using work item title and description", {
    workItemId: z.number().describe("ID of the work item to curate music for"),
    specificMood: z.string().optional().describe("Override the mood analysis with a specific mood (energetic, productive, tense, urgent, focused, calm)"),
    genre: z.string().optional().describe("Music genre to search for (e.g., rock, classical, jazz, electronic, kenyan)"),
    trackTitle: z.string().optional().describe("Specific track title to search for"),
    artistName: z.string().optional().describe("Specific artist to search for"),
    numberOfTracks: z.number().optional().describe("Number of tracks to play (default: 5)"),
}, async (args, extra) => {
    const { workItemId, specificMood, genre, trackTitle, artistName, numberOfTracks = 5 } = args;
    const config = getConfig();
    if (!config.azure.patToken) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: "Azure DevOps is not configured. Please set AZURE_DEVOPS_PAT in your .env file.",
                },
            ],
        };
    }
    // Initialize Azure DevOps service
    try {
        // Fetch the work item
        const workItem = await fetchWorkItem(workItemId, config.azure);
        if (!workItem) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `No work item found with ID ${workItemId}.`,
                    },
                ],
            };
        }

        // Get work item information
        const workItemTitle = workItem.fields["System.Title"] || "";
        const workItemDescription = workItem.fields["System.Description"] || "";
        const workItemType = workItem.fields["System.WorkItemType"] || "";
        
        // Use specified mood if provided, otherwise analyze the work item
        let mood: string, energyLevel: number, focus: number, creativity: number;
        
        if (specificMood) {
            // Use the explicitly provided mood
            mood = specificMood.toLowerCase();
            // Set reasonable defaults based on the specified mood
            switch(mood) {
                case 'energetic':
                    energyLevel = 0.8;
                    focus = 0.5;
                    creativity = 0.6;
                    break;
                case 'productive':
                    energyLevel = 0.6;
                    focus = 0.7;
                    creativity = 0.5;
                    break;
                case 'tense':
                case 'urgent':
                    energyLevel = 0.7;
                    focus = 0.8;
                    creativity = 0.3;
                    break;
                case 'focused':
                    energyLevel = 0.5;
                    focus = 0.9;
                    creativity = 0.4;
                    break;
                case 'calm':
                    energyLevel = 0.3;
                    focus = 0.6;
                    creativity = 0.7;
                    break;
                default:
                    // For unrecognized moods, perform analysis anyway
                    ({ mood, energyLevel, focus, creativity } = await workItemAnalyzer.analyzeMood(
                        `${workItemTitle} ${workItemDescription}`
                    ));
            }
        } else {
            // Perform normal analysis
            ({ mood, energyLevel, focus, creativity } = await workItemAnalyzer.analyzeMood(
                `${workItemTitle} ${workItemDescription}`
            ));
        }
        
        // Create a more intelligent search query based on analysis
        let moodBasedGenre = "focus";
        if (mood === "energetic") moodBasedGenre = "upbeat";
        else if (mood === "productive") moodBasedGenre = "motivational";
        else if (mood === "tense" || mood === "urgent") moodBasedGenre = "intense";
        else if (mood === "calm") moodBasedGenre = "ambient";
        
        // For highly creative tasks, prefer instrumental music
        const instrumentalPreference = creativity > 0.7 ? 0.8 : 0.3;
        
        // Generate search query based on parameters or analysis
        let searchQuery: string;
        
        if (trackTitle && artistName) {
            // If both track and artist are specified, use them directly
            searchQuery = `${trackTitle} ${artistName}`;
        } else if (trackTitle) {
            // If only track is specified
            searchQuery = trackTitle;
        } else if (artistName) {
            // If only artist is specified
            searchQuery = `${artistName} ${moodBasedGenre}`;
        } else if (genre) {
            // If a specific genre is provided
            searchQuery = `${genre} ${focus > 0.7 ? "concentration" : "productivity"} music`;
        } else {
            // Use mood-based search
            searchQuery = `${moodBasedGenre} ${focus > 0.7 ? "concentration" : "productivity"} music`;
        }
        
        logger.info(`Work item analysis: Mood=${mood}, Energy=${energyLevel.toFixed(2)}, Focus=${focus.toFixed(2)}, Creativity=${creativity.toFixed(2)}`);
        logger.info(`Generated search query: "${searchQuery}"`);
        
        // Define user preferences based on work item analysis
        const musicPreferences: UserPreferences = {
            energyLevel: energyLevel, 
            instrumentalPreference: instrumentalPreference
        };
        
        // Add genre preferences
        const selectedGenre = genre || moodBasedGenre;
        const genres = [selectedGenre, "focus", "productivity"].filter(Boolean);
        if (genres.length > 0) {
            musicPreferences.genres = genres;
        }
        
        // Use Spotify service to search and play music
        if (!spotifyService) {
            spotifyService = new SpotifyService(config.spotify);
        }
        if (!spotifyService) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: "Spotify is not configured. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your .env file.",
                    },
                ],
            };
        }
        
        // First check authorization status
        const authStatus = await spotifyService.checkAuthStatus();
        if (!authStatus.isAuthorized) {
            logger.error(
                "Spotify authorization required, run npm run spotify-auth to authorize."
            ); 
        }
        
        // Search for tracks based on our intelligent query
        const searchResults = await spotifyService.searchTracks(searchQuery, musicPreferences);

        if (searchResults.length === 0) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `No results found for "${searchQuery}".`,
                    },
                ],
            };
        }

        // Play multiple tracks (based on numberOfTracks parameter)
        const tracksToPlay = searchResults.slice(0, Math.min(numberOfTracks, searchResults.length));
        const trackIds = tracksToPlay.map(track => track.id);
        
        const playResult = await spotifyService.playTracks(trackIds);
        if (playResult.success) {
            const trackList = tracksToPlay.map((track, index) => 
                `${index + 1}. "${track.name}" by ${track.artist}`
            ).join('\n');
            
            // Build the message based on what was specified
            let contextMessage: string;
            if (specificMood) {
                contextMessage = `I'm playing music with a ${specificMood} mood as requested.`;
            } else {
                contextMessage = `Based on your work item "${workItem.fields["System.Title"]}" (${workItemType}), I detected a ${mood} mood.`;
            }
            
            // Add genre information if specified
            if (genre) {
                contextMessage += ` I've selected ${genre} music as requested.`;
            }
            
            // Add track/artist information if specified
            if (trackTitle) {
                const artistInfo = artistName ? ` by ${artistName}` : '';
                contextMessage += ` I specifically looked for "${trackTitle}"${artistInfo}.`;
            } else if (artistName) {
                contextMessage += ` I specifically looked for music by ${artistName}.`;
            }
            
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `${contextMessage}\n\nPlaying ${tracksToPlay.length} tracks to help you get in the flow:\n\n${trackList}`,
                    },
                ],
            };
        } else {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error playing tracks: ${playResult.message}`,
                    },
                ],
            };
        }
    } catch (error) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: `Error fetching work item: ${
                        error instanceof Error
                            ? error.message
                            : typeof error === "object"
                            ? JSON.stringify(error)
                            : "Unknown error"
                    }`,
                },
            ],
        };
    }
});

server.tool("code-work-item", "Retrieve an Azure DevOps work item by ID, interpret its description as an actionable task.", {
    workItemId: z.number().describe("ID of the work item to retrieve"),
}, async (args, extra) => {
    const { workItemId } = args;
    const config = getConfig();
    if (!config.azure.patToken) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: "Azure DevOps is not configured. Please set AZURE_DEVOPS_PAT in your .env file.",
                },
            ],
        };
    }
    try {
        // Fetch the work item
        const workItem = await fetchWorkItem(workItemId, config.azure);
        if (!workItem) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `No work item found with ID ${workItemId}.`,
                    },
                ],
            };
        }
        
        // Use WorkItemAnalyzer to interpret the description
        const prompt = createWorkItemLLMPrompt(workItem)
        
        return {
            content: [
                {
                    type: "text" as const,
                    text: prompt,
                },
            ],
        };
    } catch (error) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: `Error fetching work item: ${
                        error instanceof Error
                            ? error.message
                            : typeof error === "object"
                            ? JSON.stringify(error)
                            : "Unknown error"
                    }`,
                },
            ],
        };
    }
})

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Azure DevOps Work Items MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
