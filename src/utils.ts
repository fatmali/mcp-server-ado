import { GitPullRequest } from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { SpotifyConfig } from './spotify.js';

export const USER_AGENT = "ado-workitems-mcp-server/1.0";

// Interface for Azure DevOps configuration
export interface AzureDevOpsConfig {
  patToken?: string;
  organization?: string;
  project?: string;
  areaPath?: string;
  repository?: string;
}

// Interface for Azure DevOps Work Item
export interface WorkItem {
  id: number;
  rev: number;
  fields: {
    "System.Title": string;
    "System.Description"?: string;
    "System.State"?: string;
    "System.WorkItemType"?: string;
    "System.CreatedDate"?: string;
    "System.ChangedDate"?: string;
    "System.AssignedTo"?: {
      displayName: string;
      uniqueName: string;
    };
    "System.AreaPath"?: string;
    [key: string]: any;
  };
  url: string;
}

// Interface for Pull Request creation payload
export interface PullRequestPayload {
  sourceRefName: string;
  targetRefName: string;
  title: string;
  description?: string;
  reviewers?: Array<{
    id: string;
  }>;
}

// Interface for Spotify configuration
export interface ResponseWithMusic {
    workItem: string;
    suggestedTracks: Array<{
        name: string;
        artist: string;
        url: string;
    }>;
}

// Function to make authenticated requests to Azure DevOps API
export async function makeAzureDevOpsRequest<T>(
  endpoint: string,
  config: AzureDevOpsConfig,
  apiVersion: string = "7.1-preview.3",
  payload?: string
): Promise<T | null> {
  const { patToken, organization, project } = config;
  
  // Create Basic auth token from PAT
  const authToken = Buffer.from(`:${patToken}`).toString('base64');
  
  const headers: HeadersInit = {
    "User-Agent": USER_AGENT,
    "Authorization": `Basic ${authToken}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };

  try {
    // Build the URL with the appropriate organization and project
    const baseUrl = `https://dev.azure.com/${organization}/${project}/_apis`;
    const url = `${baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}api-version=${apiVersion}`;
    
    const response = await fetch(url, { headers, body: payload, method: payload ? 'POST' : 'GET' });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making Azure DevOps request:", error);
    return null;
  }
}

// Function to fetch a work item by ID
export async function fetchWorkItem(
  workItemId: number,
  config: AzureDevOpsConfig
): Promise<WorkItem | null> {
  const response = await makeAzureDevOpsRequest<{ id: number, fields: any }>(
    `/wit/workitems/${workItemId}`,
    config
  );
  
  return response as WorkItem | null;
}

// Function to create a formatted summary of a work item
export function createWorkItemLLMPrompt(workItem: WorkItem | null): string {
  if (!workItem) {
    return "No work item found with the specified ID.";
  }

  const title = workItem.fields["System.Title"];
  const description = workItem.fields["System.Description"] || "No description provided.";
  const type = workItem.fields["System.WorkItemType"] || "Not specified";
  const state = workItem.fields["System.State"] || "Not specified";
  const id = workItem.id;

  return `
You are an AI developer assistant.

A work item has been retrieved from Azure DevOps. Your task is to read the description and take appropriate action, which may involve writing code, fixing issues, or completing the task described.

### Work Item Metadata
- **ID:** ${id}
- **Title:** ${title}
- **Type:** ${type}
- **State:** ${state}

### Task Description
${description}

### Instructions
1. Understand what the task requires based on the description.
2. Generate the appropriate code, fix, or response.
3. If the task is ambiguous, explain what’s unclear and what additional info is needed.
`;
}

// Function to create a pull request
export async function createPullRequest(
  payload: PullRequestPayload,
  repositoryId: string,
  config: AzureDevOpsConfig
): Promise<GitPullRequest | null> {
  // Git API version differs from Work Item API
  const apiVersion = '7.1-preview.2';
  
  try {
    const response = await makeAzureDevOpsRequest<GitPullRequest>(
      `/git/repositories/${repositoryId}/pullrequests`,
      config,
      apiVersion,
      JSON.stringify(payload)
    );
    
    return response;
  } catch (error) {
    console.error("Error creating pull request:", error);
    return null;
  }
}
