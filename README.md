# Azure DevOps MCP Server

A Model Context Protocol (MCP) server for integrating with Azure DevOps, providing functionality to retrieve work items and create pull requests programmatically.

## Features

- **Work Item Retrieval**: Fetch work items from Azure DevOps by ID
- **Pull Request Creation**: Create pull requests in Azure DevOps repositories
- **MCP Integration**: Implements the Model Context Protocol for seamless integration with AI assistants

## Prerequisites

- Node.js (v16 or higher)
- Azure DevOps account
- Personal Access Token (PAT) with appropriate permissions

## Installation

1. Clone this repository:
   ```bash
   git clone <repository-url>
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

The server requires the following environment variables:

- `AZURE_DEVOPS_ORG`: Your Azure DevOps organization name
- `AZURE_DEVOPS_PAT`: Your Personal Access Token with appropriate permissions
- `AZURE_DEVOPS_PROJECT`: Your Azure DevOps project name
- `AZURE_DEVOPS_REPO`: Your Azure DevOps repository name
- `AZURE_DEVOPS_AREA_PATH` (optional): The area path for work items

You can set these variables in a `.env` file in the project root:

```
AZURE_DEVOPS_ORG=your-organization
AZURE_DEVOPS_PAT=your-pat-token
AZURE_DEVOPS_PROJECT=your-project
AZURE_DEVOPS_REPO=your-repository
AZURE_DEVOPS_AREA_PATH=your-area-path
```

## Usage

Start the MCP server:

```bash
npm start
```

### Available Tools

The server provides the following MCP tools:

#### `code-work-item`

Retrieves an Azure DevOps work item by ID:

```json
{
  "workItemId": 123
}
```

#### `create-pull-request`

Creates a pull request in your Azure DevOps repository:

```json
{
  "title": "Your PR title",
  "description": "PR description",
  "sourceBranch": "feature/branch-name",
  "targetBranch": "main"
}
```

## Development

1. Make changes to the TypeScript files in the `src` directory
2. Build the project:
   ```bash
   npm run build
   ```
3. Run the server:
   ```bash
   npm start
   ```

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.