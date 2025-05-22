#!/bin/bash

# Script to set up self-signed SSL certificates for Spotify API callback

# Define directory
CERT_DIR="./certs"
mkdir -p $CERT_DIR

# Navigate to the directory
cd $CERT_DIR

# Generate self-signed certificate
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"

echo "Self-signed certificates generated successfully in $CERT_DIR"
echo "These certificates are for local development only."
echo "You can now run 'npm run auth:spotify' to authenticate with Spotify."
