# MCP Server for Azure DevOps

A Model Context Protocol (MCP) server that provides tools for interacting with Azure DevOps work items and pull requests. This server enables AI assistants to retrieve work item details and create pull requests in Azure DevOps repositories.

## Features

- **Work Item Retrieval**: Fetch work item details from Azure DevOps by ID
- **Pull Request Creation**: Create pull requests in Azure DevOps repositories
- **MCP Integration**: Built with the Model Context Protocol SDK for seamless integration with AI assistants

## Requirements

- Node.js (v18 or higher)
- TypeScript
- Azure DevOps organization with proper access permissions
- Personal Access Token (PAT) with appropriate permissions

## Installation

1. Clone this repository:
   ```
   git clone <repository-url>
   cd mcp-server-ado
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   AZURE_DEVOPS_ORG=your-organization
   AZURE_DEVOPS_PAT=your-pat-token
   AZURE_DEVOPS_PROJECT=your-project
   AZURE_DEVOPS_REPO=your-repository
   AZURE_DEVOPS_AREA_PATH=optional-area-path
   ```

## Development

1. Build the project:
   ```
   npm run build
   ```

2. Start the server:
   ```
   npm start
   ```

3. For development with auto-reloading, you can use nodemon (install with `npm install -g nodemon`):
   ```
   nodemon --watch src --ext ts --exec "npm run build && npm start"
   ```

## Usage

### As a CLI Tool

Once installed, you can use the tool directly from the command line:

```
ado-workitems
```

### As an MCP Server

This server implements two MCP tools:

1. **code-work-item**: Retrieves an Azure DevOps work item by ID
   - Required parameters:
     - `workItemId`: The ID of the work item to retrieve

2. **create-pull-request**: Creates a pull request in an Azure DevOps repository
   - Required parameters:
     - `title`: Title for the pull request
     - `sourceBranch`: Source branch name
   - Optional parameters:
     - `description`: Description for the pull request
     - `targetBranch`: Target branch name (defaults to "main")
     - `reviewerIds`: Array of reviewer IDs

## Architecture

The server is built using:
- TypeScript for type safety and modern JavaScript features
- Model Context Protocol SDK for standardized communication with AI assistants
- Node.js for the runtime environment
- Zod for request validation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC License