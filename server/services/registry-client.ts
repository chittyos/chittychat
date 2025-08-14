import { storage } from "../storage";
import type { InsertMcpTool } from "@shared/schema";

interface RegistryTool {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  capabilities: string[];
  author: string;
  repository_url?: string;
  documentation_url?: string;
  tags: string[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface RegistryMCP {
  id: string;
  name: string;
  description: string;
  version: string;
  protocol_version: string;
  capabilities: string[];
  endpoints: Record<string, any>;
  author: string;
  repository_url?: string;
  metadata: Record<string, any>;
}

export class RegistryClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.REGISTRY_URL || 'https://registry.chitty.cc';
    this.apiKey = process.env.REGISTRY_API_KEY || '';
  }

  async discoverTools(): Promise<RegistryTool[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tools`, {
        headers: {
          'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
          'X-Source': 'chittypm',
        },
      });

      if (!response.ok) {
        throw new Error(`Registry API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to discover tools from registry:', error);
      await this.updateIntegrationStatus('error', error instanceof Error ? error.message : 'Tool discovery failed');
      return [];
    }
  }

  async discoverMCPs(): Promise<RegistryMCP[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mcps`, {
        headers: {
          'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
          'X-Source': 'chittypm',
        },
      });

      if (!response.ok) {
        throw new Error(`Registry API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to discover MCPs from registry:', error);
      return [];
    }
  }

  async syncTools(): Promise<{ syncedTools: number }> {
    try {
      await this.updateIntegrationStatus('active', 'Starting registry sync');

      const [tools, mcps] = await Promise.all([
        this.discoverTools(),
        this.discoverMCPs(),
      ]);

      // Convert registry tools to MCP tools format
      const mcpTools: InsertMcpTool[] = [
        ...tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          version: tool.version,
          category: tool.category,
          capabilities: tool.capabilities,
          registryUrl: `${this.baseUrl}/tools/${tool.id}`,
          metadata: {
            ...tool.metadata,
            author: tool.author,
            repository_url: tool.repository_url,
            documentation_url: tool.documentation_url,
            tags: tool.tags,
            source: 'registry_tools',
            registry_id: tool.id,
          },
        })),
        ...mcps.map(mcp => ({
          name: mcp.name,
          description: mcp.description,
          version: mcp.version,
          category: 'MCP Protocol',
          capabilities: mcp.capabilities,
          registryUrl: `${this.baseUrl}/mcps/${mcp.id}`,
          metadata: {
            ...mcp.metadata,
            author: mcp.author,
            repository_url: mcp.repository_url,
            protocol_version: mcp.protocol_version,
            endpoints: mcp.endpoints,
            source: 'registry_mcps',
            registry_id: mcp.id,
          },
        })),
      ];

      // Sync tools to database
      await storage.syncMcpTools(mcpTools);

      await this.updateIntegrationStatus('active', `Sync completed: ${mcpTools.length} tools/MCPs discovered`);

      // Log activity
      await storage.createActivity({
        type: 'registry_sync',
        description: `Registry sync completed: ${tools.length} tools, ${mcps.length} MCPs`,
        metadata: {
          source: 'registry_sync',
          tools_count: tools.length,
          mcps_count: mcps.length,
        },
      });

      return { syncedTools: mcpTools.length };
    } catch (error) {
      await this.updateIntegrationStatus('error', error instanceof Error ? error.message : 'Registry sync failed');
      throw error;
    }
  }

  async searchTools(query: string, category?: string): Promise<RegistryTool[]> {
    try {
      const params = new URLSearchParams({ q: query });
      if (category) {
        params.append('category', category);
      }

      const response = await fetch(`${this.baseUrl}/api/tools/search?${params}`, {
        headers: {
          'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
          'X-Source': 'chittypm',
        },
      });

      if (!response.ok) {
        throw new Error(`Registry search error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to search registry:', error);
      return [];
    }
  }

  async getToolSuggestions(projectContext: string): Promise<RegistryTool[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tools/suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
          'X-Source': 'chittypm',
        },
        body: JSON.stringify({
          context: projectContext,
          limit: 10,
        }),
      });

      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get tool suggestions:', error);
      return [];
    }
  }

  async registerTool(tool: {
    name: string;
    description: string;
    version: string;
    category: string;
    capabilities: string[];
    repository_url?: string;
  }): Promise<void> {
    try {
      if (!this.apiKey) {
        throw new Error('Registry API key required for tool registration');
      }

      const response = await fetch(`${this.baseUrl}/api/tools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Source': 'chittypm',
        },
        body: JSON.stringify({
          ...tool,
          metadata: {
            source: 'chittypm',
            registered_at: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Tool registration failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to register tool:', error);
      throw error;
    }
  }

  private async updateIntegrationStatus(status: string, message?: string): Promise<void> {
    try {
      const integration = await storage.getIntegration('registry');
      if (integration) {
        await storage.updateIntegration(integration.id, {
          status,
          errorMessage: status === 'error' ? message : null,
          lastSync: new Date(),
        });
      } else {
        await storage.createIntegration({
          name: 'registry',
          type: 'registry',
          status,
          config: {
            baseUrl: this.baseUrl,
            hasApiKey: !!this.apiKey,
          },
          errorMessage: status === 'error' ? message : null,
        });
      }
    } catch (error) {
      console.error('Failed to update registry integration status:', error);
    }
  }
}

export const registryClient = new RegistryClient();
