# Azure DevOps MCP Server

A Model Context Protocol (MCP) server that integrates with Azure DevOps, providing tools to retrieve work items and create pull requests through a standardized interface.

## Features

- **Work Item Retrieval**: Fetch work items from Azure DevOps by ID and convert them into actionable task descriptions
- **Pull Request Creation**: Create pull requests in Azure DevOps repositories directly through the MCP interface
- **Environment Configuration**: Easily configure Azure DevOps connections using environment variables

## Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Azure DevOps account with appropriate permissions
- Personal Access Token (PAT) with necessary scopes for Azure DevOps API access

## Installation

1. Clone the repository:
   ```bash
   git clone <your-repository-url>
   cd mcp-server-ado
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Configuration

Create a `.env` file in the project root with the following environment variables:

```
AZURE_DEVOPS_ORG=your-organization
AZURE_DEVOPS_PAT=your-personal-access-token
AZURE_DEVOPS_PROJECT=your-project
AZURE_DEVOPS_REPO=your-repository-id
AZURE_DEVOPS_AREA_PATH=optional-area-path
```

## Usage

### Running the MCP Server

Start the server:

```bash
npm start
```

The server runs on stdio, making it compatible with MCP clients that communicate through standard input/output.

### Available Tools

#### 1. Code Work Item

Retrieves an Azure DevOps work item by ID and formats it as an actionable task.

**Parameters:**
- `workItemId`: ID of the work item to retrieve (number)

**Example:**
```json
{
  "workItemId": 123
}
```

#### 2. Create Pull Request

Creates a pull request in an Azure DevOps repository.

**Parameters:**
- `title`: Title for the pull request (required)
- `description`: Description for the pull request (optional)
- `sourceBranch`: Source branch name (required)
- `targetBranch`: Target branch name (optional, defaults to "main")
- `reviewerIds`: Array of reviewer IDs (optional)

**Example:**
```json
{
  "title": "Feature implementation",
  "description": "Implements feature X as described in work item #123",
  "sourceBranch": "feature/x-implementation",
  "targetBranch": "develop",
  "reviewerIds": ["user-guid-1", "user-guid-2"]
}
```

## Development

### Project Structure

```
.
├── src/
│   ├── index.ts        # Main application entry point
│   └── utils.ts        # Utility functions for Azure DevOps API
├── build/              # Compiled JavaScript output
├── package.json        # Project dependencies and scripts
└── tsconfig.json       # TypeScript configuration
```

### Adding New Features

1. Define new interfaces in `utils.ts` if necessary
2. Implement API interaction functions in `utils.ts`
3. Create a new MCP tool in `index.ts` using the `server.tool()` method
4. Build and test your changes

### Building for Production

```bash
npm run build
```

This will compile TypeScript to JavaScript in the `build` directory.

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.