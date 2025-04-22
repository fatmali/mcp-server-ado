# Azure DevOps Work Items MCP Server

A Model Context Protocol (MCP) server that integrates with Azure DevOps. This tool enables AI assistants to interact with Azure DevOps work items and create pull requests, providing a bridge between your AI workflows and Azure DevOps project management.

## Features

- **Work Item Retrieval**: Fetch detailed information about Azure DevOps work items by ID
- **Work Item Processing**: Convert work item descriptions into actionable tasks for AI assistants
- **Pull Request Creation**: Create pull requests directly from the MCP server
- **Environment-Based Configuration**: Easy setup using environment variables

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Azure DevOps organization and project
- Personal Access Token (PAT) with appropriate permissions

## Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd mcp-server-ado
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory with the following variables:

```
AZURE_DEVOPS_ORG=your-organization
AZURE_DEVOPS_PAT=your-personal-access-token
AZURE_DEVOPS_PROJECT=your-project-name
AZURE_DEVOPS_REPO=your-repository-name
AZURE_DEVOPS_AREA_PATH=optional-area-path
```

### 4. Build the project

```bash
npm run build
```

### 5. Run the server

```bash
npm start
```

## Development

### Project Structure

- `src/index.ts`: Main entry point and MCP server configuration
- `src/utils.ts`: Utility functions for Azure DevOps integration
- `build/`: Compiled JavaScript files
- `.env`: Environment configuration (create this file yourself)

### Available Scripts

- `npm run build`: Compiles TypeScript files to JavaScript
- `npm start`: Runs the compiled application
- `npm test`: Runs tests (currently not implemented)

### Adding New Tools

To add a new tool to the MCP server, follow this pattern in `src/index.ts`:

```typescript
server.tool("tool-name", 
    "Tool description",
    {
        param1: z.string().describe("Parameter description"),
        // Add more parameters as needed
    },
    async (args, extra) => {
        // Implement tool functionality
        return {
            content: [
                {
                    type: "text",
                    text: "Response text",
                }
            ]
        };
    }
);
```

## API Reference

### code-work-item

Retrieves an Azure DevOps work item by ID and formats it for AI processing.

**Parameters:**
- `workItemId`: The numeric ID of the work item to retrieve

### create-pull-request

Creates a pull request in your Azure DevOps repository.

**Parameters:**
- `title`: Title for the pull request
- `description` (optional): Description for the pull request
- `sourceBranch`: Source branch name
- `targetBranch` (optional): Target branch name (defaults to "main")

## Troubleshooting

- **Authentication Issues**: Ensure your PAT has the correct permissions
- **Missing Environment Variables**: Check that all required environment variables are set
- **API Errors**: Review the console error output for specific API error messages

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.