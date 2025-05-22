# MCP Server with Azure DevOps and Spotify Integration

This project provides integration between Azure DevOps work items and Spotify music recommendations.

## Spotify Authentication

Spotify API now requires HTTPS for redirect URIs, even for local development. To set up Spotify authentication:

1. Generate self-signed SSL certificates:
   ```bash
   npm run gen:certs
   ```

2. Configure your Spotify App:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new application
   - In the app settings, add the following redirect URI:
     ```
     https://localhost:8888/callback
     ```
   - Copy your client ID and client secret

3. Set up your configuration:
   - Edit `spotify-config.json` with your client ID, client secret, and redirect URI
   - The redirect URI must use HTTPS (e.g., `https://localhost:8888/callback`)

4. Run the authentication command:
   ```bash
   npm run auth:spotify
   ```
   
   Or run the complete setup process in one command:
   ```bash
   npm run setup:spotify
   ```

5. Visit the URL shown in the terminal to authorize the application
   - Accept the browser warning about self-signed certificates
   - Authorize the application in Spotify
   - You'll be redirected back to your local server to complete the authentication

## SSL Certificate Notes

The generated SSL certificates are self-signed and for local development only. When accessing the callback URL in your browser, you'll need to accept the security warning as the certificate is not trusted by your system.

## Troubleshooting

- If you see `INVALID_CLIENT: Insecure redirect URI` error, make sure your redirect URI uses HTTPS.
- If you have certificate errors, regenerate the certificates using the script.
- Make sure the redirect URI in your Spotify Developer Dashboard exactly matches the one in your config file.