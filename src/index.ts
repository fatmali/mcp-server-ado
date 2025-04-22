import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { 
  fetchWorkItem,  
  AzureDevOpsConfig,
  createWorkItemLLMPrompt,
  createPullRequest,
  PullRequestPayload,
} from "./utils.js";
import dotenv from 'dotenv';

// Create MCP server with default configuration values
const server = new McpServer({
    name: "azure-devops-work-items",
    version: "0.1.0",
    capabilities: {
        resources: {},
        tools: {},
    }
});

// Load environment variables
dotenv.config();

function getConfig(): AzureDevOpsConfig {
  // Debug log the environment variables to help diagnose issues
  process.stderr.write(`DEBUG - Environment variables in getConfig():
  AZURE_DEVOPS_ORG: ${process.env.AZURE_DEVOPS_ORG || 'NOT SET'}
  AZURE_DEVOPS_PAT: ${process.env.AZURE_DEVOPS_PAT ? 'SET (hidden)' : 'NOT SET'}
  AZURE_DEVOPS_PROJECT: ${process.env.AZURE_DEVOPS_PROJECT || 'NOT SET'}
  NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}
  AZURE_DEVOPS_REPO: ${process.env.AZURE_DEVOPS_REPO || 'NOT SET'}
\n`);

  return {
    organization: process.env.AZURE_DEVOPS_ORG || '',
    patToken: process.env.AZURE_DEVOPS_PAT,
    project: process.env.AZURE_DEVOPS_PROJECT,
    areaPath: process.env.AZURE_DEVOPS_AREA_PATH,
    repository: process.env.AZURE_DEVOPS_REPO,
  };
}

server.tool("code-work-item", 
    "Retrieve an Azure DevOps work item by ID, interpret its description as an actionable task.",
    {
        workItemId: z.number().describe("ID of the work item to retrieve"),
    },
    async (args, extra) => {
        const { workItemId } = args;
        
        // Create config object from arguments or default values
        const config: AzureDevOpsConfig = getConfig();
        
        if (!config.patToken || !config.organization || !config.project) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Missing required parameters. Please provide patToken, organization, and project when calling this tool.",
                    }
                ]
            };
        }
        
        // Fetch work item from Azure DevOps
        const workItem = await fetchWorkItem(workItemId, config);
        
        if (!workItem) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No work item found with ID: ${workItemId}`,
                    }
                ]
            };
        }
                
        // Create formatted actionable prompt of the work item
        const prompt = createWorkItemLLMPrompt(workItem);
        
        // Return the response
        return {
            content: [
                {
                    type: "text",
                    text: prompt,
                }
            ]
        };
    }
);

server.tool("create-pull-request", 
    "Create a pull request in Azure DevOps repository",
    {
        title: z.string().describe("Title for the pull request"),
        description: z.string().optional().describe("Description for the pull request"),
        sourceBranch: z.string().describe("Source branch name (include refs/heads/ if needed)"),
        targetBranch: z.string().describe("Target branch name (include refs/heads/ if needed)").optional(),
    },
    async (args, extra) => {
        const { title, description, sourceBranch, targetBranch } = args;
        
        // Create config object from environment variables
        const config: AzureDevOpsConfig = getConfig();
        
        if (!config.patToken || !config.organization || !config.project) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Missing required configuration. Please ensure AZURE_DEVOPS_PAT, AZURE_DEVOPS_ORG, and AZURE_DEVOPS_PROJECT environment variables are set.",
                    }
                ]
            };
        }
        
        // Format branch names correctly if they don't include refs/heads/
        const sourceRef = sourceBranch.startsWith('refs/') ? sourceBranch : `refs/heads/${sourceBranch}`;
        const targetRef = targetBranch ? targetBranch.startsWith('refs/') ? targetBranch : `refs/heads/${targetBranch}` : "main";
        
        if (!config.repository) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Could not find repository with name: ${config.repository}`,
                    }
                ]
            };
        }
        
        // Prepare PR payload
        const prPayload: PullRequestPayload = {
            sourceRefName: sourceRef,
            targetRefName: targetRef,
            title: title,
            description: description || "",
        };
        
        // Create the pull request
        const pullRequest = await createPullRequest(prPayload, config.repository, config);
        
        if (!pullRequest) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Failed to create pull request. Check your input parameters and ensure you have sufficient permissions.",
                    }
                ]
            };
        }
        
        // Return success response with PR details
        return {
            content: [
                {
                    type: "text",
                    text: `
# Pull Request Created Successfully

- **PR ID:** ${pullRequest.pullRequestId}
- **Title:** ${pullRequest.title}
- **Status:** ${pullRequest.status}
- **Source Branch:** ${pullRequest.sourceRefName}
- **Target Branch:** ${pullRequest.targetRefName}
- **Creation Date:** ${pullRequest.creationDate}

You can view this pull request at: ${pullRequest.url}
                    `,
                }
            ]
        };
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Azure DevOps Work Items MCP Server running on stdio");
}
  
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});