import { apiRequest } from "./queryClient";

interface MCPRequest {
  method: string;
  params?: any;
}

interface MCPResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export class MCPClient {
  private static instance: MCPClient;
  private requestId: number = 0;

  static getInstance(): MCPClient {
    if (!MCPClient.instance) {
      MCPClient.instance = new MCPClient();
    }
    return MCPClient.instance;
  }

  private generateRequestId(): string {
    return `mcp_${++this.requestId}_${Date.now()}`;
  }

  async listProjects(agentId?: string, isGlobal: boolean = true): Promise<MCPResponse> {
    try {
      const response = await apiRequest('POST', '/api/mcp/projects/list', {
        agentId,
        isGlobal,
      });
      
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list projects',
      };
    }
  }

  async createProject(agentId: string, projectData: {
    name: string;
    description?: string;
    isGlobal?: boolean;
    category?: string;
  }): Promise<MCPResponse> {
    try {
      const response = await apiRequest('POST', '/api/mcp/projects', {
        agentId,
        projectData,
      });
      
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create project',
      };
    }
  }

  async listTasks(projectId: string, agentId?: string): Promise<MCPResponse> {
    try {
      const response = await apiRequest('POST', '/api/mcp/tasks/list', {
        projectId,
        agentId,
      });
      
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list tasks',
      };
    }
  }

  async createTask(agentId: string, taskData: {
    projectId: string;
    title: string;
    description?: string;
    priority?: string;
  }): Promise<MCPResponse> {
    try {
      const response = await apiRequest('POST', '/api/mcp/tasks', {
        agentId,
        taskData,
      });
      
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task',
      };
    }
  }

  async updateTask(taskId: string, updates: any, agentId: string): Promise<MCPResponse> {
    try {
      const response = await apiRequest('POST', '/api/mcp/tasks/update', {
        taskId,
        updates,
        agentId,
      });
      
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update task',
      };
    }
  }

  async registerAgent(agentData: {
    name: string;
    type: string;
    capabilities?: string[];
  }): Promise<MCPResponse> {
    try {
      const response = await apiRequest('POST', '/api/mcp/agents/register', agentData);
      
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to register agent',
      };
    }
  }

  async discoverTools(): Promise<MCPResponse> {
    try {
      const response = await apiRequest('GET', '/api/mcp/discovery');
      const tools = await response.json();
      
      return {
        success: true,
        data: tools,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to discover tools',
      };
    }
  }

  async searchTools(query: string, category?: string): Promise<MCPResponse> {
    try {
      const params = new URLSearchParams({ q: query });
      if (category) {
        params.append('category', category);
      }
      
      const response = await apiRequest('GET', `/api/mcp/tools/search?${params}`);
      const tools = await response.json();
      
      return {
        success: true,
        data: tools,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search tools',
      };
    }
  }

  async getToolSuggestions(projectContext: string): Promise<MCPResponse> {
    try {
      const response = await apiRequest('POST', '/api/mcp/tools/suggestions', {
        context: projectContext,
      });
      const suggestions = await response.json();
      
      return {
        success: true,
        data: suggestions,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tool suggestions',
      };
    }
  }

  // Workflow enforcement methods
  async validateProjectCreation(projectData: any): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!projectData.name?.trim()) {
      errors.push('Project name is required');
    }
    
    if (projectData.name && projectData.name.length < 3) {
      errors.push('Project name must be at least 3 characters');
    }
    
    if (projectData.name && projectData.name.length > 100) {
      errors.push('Project name must be less than 100 characters');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async validateTaskCreation(taskData: any): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!taskData.title?.trim()) {
      errors.push('Task title is required');
    }
    
    if (!taskData.projectId) {
      errors.push('Project ID is required');
    }
    
    if (taskData.title && taskData.title.length < 3) {
      errors.push('Task title must be at least 3 characters');
    }
    
    if (taskData.title && taskData.title.length > 200) {
      errors.push('Task title must be less than 200 characters');
    }
    
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (taskData.priority && !validPriorities.includes(taskData.priority)) {
      errors.push('Invalid priority level');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Helper method for agents to get their assigned tasks
  async getAgentTasks(agentName: string): Promise<MCPResponse> {
    try {
      const response = await apiRequest('GET', `/api/agents/${encodeURIComponent(agentName)}/tasks`);
      const tasks = await response.json();
      
      return {
        success: true,
        data: tasks,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get agent tasks',
      };
    }
  }
}

// Export singleton instance
export const mcpClient = MCPClient.getInstance();

// Export helper functions for common MCP operations
export const mcpOperations = {
  // Quick project creation with validation
  async quickCreateProject(agentId: string, name: string, description?: string) {
    const validation = await mcpClient.validateProjectCreation({ name, description });
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }
    
    return await mcpClient.createProject(agentId, { name, description });
  },

  // Quick task creation with validation
  async quickCreateTask(agentId: string, projectId: string, title: string, priority: string = 'medium') {
    const validation = await mcpClient.validateTaskCreation({ title, projectId, priority });
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }
    
    return await mcpClient.createTask(agentId, { projectId, title, priority });
  },

  // Mark task as complete
  async completeTask(taskId: string, agentId: string) {
    return await mcpClient.updateTask(taskId, { status: 'completed' }, agentId);
  },

  // Get project overview
  async getProjectOverview(projectId: string, agentId: string) {
    const tasksResult = await mcpClient.listTasks(projectId, agentId);
    
    if (!tasksResult.success) {
      return tasksResult;
    }
    
    const tasks = tasksResult.data || [];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task: any) => task.status === 'completed').length;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    return {
      success: true,
      data: {
        totalTasks,
        completedTasks,
        progress,
        tasks,
      },
    };
  },
};
