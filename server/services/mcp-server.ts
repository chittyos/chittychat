import { storage } from "../storage";
import { type InsertTask, type InsertProject, type InsertActivity } from "@shared/schema";

export class MCPServer {
  async handleRequest(payload: any) {
    switch (payload.method) {
      case 'projects/list':
        return await this.listProjects(payload.params);
      case 'projects/create':
        return await this.createProject(payload.params.agentId, payload.params.project);
      case 'tasks/list':
        return await this.listTasks(payload.params);
      case 'tasks/create':
        return await this.createTask(payload.params.agentId, payload.params.task);
      case 'tasks/update':
        return await this.updateTask(payload.params.taskId, payload.params.updates, payload.params.agentId);
      case 'agents/register':
        return await this.registerAgent(payload.params);
      default:
        throw new Error(`Unknown MCP method: ${payload.method}`);
    }
  }

  async listProjects(params: { agentId?: string; isGlobal?: boolean }) {
    try {
      const projects = await storage.getProjects();
      
      // Filter based on global/local mode
      const filteredProjects = params.isGlobal !== false 
        ? projects.filter(p => p.isGlobal) 
        : projects;
      
      return {
        success: true,
        data: filteredProjects,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list projects',
      };
    }
  }

  async createProject(agentId: string, projectData: InsertProject) {
    try {
      // AI-enhanced project creation with auto-categorization
      const enhancedProject = await this.enhanceProject(projectData);
      const project = await storage.createProject(enhancedProject);
      
      // Log activity
      await storage.createActivity({
        type: 'project_created',
        description: `Project "${project.name}" was created by AI agent`,
        projectId: project.id,
        agentId,
      });
      
      return {
        success: true,
        data: project,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create project',
      };
    }
  }

  async listTasks(params: { projectId: string; agentId?: string }) {
    try {
      const tasks = await storage.getTasks(params.projectId);
      
      return {
        success: true,
        data: tasks,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list tasks',
      };
    }
  }

  async createTask(agentId: string, taskData: InsertTask) {
    try {
      const enhancedTask = await this.enhanceTask(taskData);
      const task = await storage.createTask({
        ...enhancedTask,
        assignedAgent: await this.getAgentName(agentId),
      });
      
      // Log activity
      await storage.createActivity({
        type: 'task_created',
        description: `Task "${task.title}" was created by AI agent`,
        projectId: task.projectId,
        taskId: task.id,
        agentId,
      });
      
      return {
        success: true,
        data: task,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task',
      };
    }
  }

  async updateTask(taskId: string, updates: Partial<any>, agentId: string) {
    try {
      const task = await storage.updateTask(taskId, updates);
      
      // Log activity
      const activityType = updates.status === 'completed' ? 'task_completed' : 'task_updated';
      await storage.createActivity({
        type: activityType,
        description: `Task "${task.title}" was ${updates.status === 'completed' ? 'completed' : 'updated'} by AI agent`,
        projectId: task.projectId,
        taskId: task.id,
        agentId,
      });
      
      return {
        success: true,
        data: task,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update task',
      };
    }
  }

  async registerAgent(params: { name: string; type: string; capabilities: string[] }) {
    try {
      const agent = await storage.createAgent({
        name: params.name,
        type: params.type,
        status: 'active',
        capabilities: params.capabilities,
      });
      
      return {
        success: true,
        data: agent,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to register agent',
      };
    }
  }

  async enhanceProject(projectData: InsertProject): Promise<InsertProject> {
    // AI-powered project enhancement
    const enhanced = { ...projectData };
    
    // Auto-categorization based on name and description
    if (!enhanced.category) {
      enhanced.category = this.categorizeProject(enhanced.name, enhanced.description);
    }
    
    // Auto-tagging
    if (!enhanced.tags || enhanced.tags.length === 0) {
      enhanced.tags = this.generateTags(enhanced.name, enhanced.description);
    }
    
    return enhanced;
  }

  async enhanceTask(taskData: InsertTask): Promise<InsertTask> {
    // AI-powered task enhancement
    const enhanced = { ...taskData };
    
    // Auto-categorization
    if (!enhanced.category) {
      enhanced.category = this.categorizeTask(enhanced.title, enhanced.description);
    }
    
    // Priority estimation based on keywords
    if (!enhanced.priority || enhanced.priority === 'medium') {
      enhanced.priority = this.estimatePriority(enhanced.title, enhanced.description);
    }
    
    // Auto-tagging
    if (!enhanced.tags || enhanced.tags.length === 0) {
      enhanced.tags = this.generateTaskTags(enhanced.title, enhanced.description);
    }
    
    return enhanced;
  }

  private categorizeProject(name: string, description?: string): string {
    const text = `${name} ${description || ''}`.toLowerCase();
    
    if (text.includes('api') || text.includes('backend') || text.includes('server')) {
      return 'Backend Development';
    }
    if (text.includes('ui') || text.includes('frontend') || text.includes('react')) {
      return 'Frontend Development';
    }
    if (text.includes('database') || text.includes('db') || text.includes('data')) {
      return 'Database';
    }
    if (text.includes('auth') || text.includes('security') || text.includes('chittyid')) {
      return 'Authentication';
    }
    if (text.includes('integration') || text.includes('mcp') || text.includes('tool')) {
      return 'Integration';
    }
    
    return 'General';
  }

  private categorizeTask(title: string, description?: string): string {
    const text = `${title} ${description || ''}`.toLowerCase();
    
    if (text.includes('implement') || text.includes('create') || text.includes('build')) {
      return 'Development';
    }
    if (text.includes('fix') || text.includes('bug') || text.includes('error')) {
      return 'Bug Fix';
    }
    if (text.includes('test') || text.includes('verify') || text.includes('validate')) {
      return 'Testing';
    }
    if (text.includes('deploy') || text.includes('release') || text.includes('publish')) {
      return 'Deployment';
    }
    if (text.includes('design') || text.includes('ui') || text.includes('ux')) {
      return 'Design';
    }
    
    return 'General';
  }

  private estimatePriority(title: string, description?: string): string {
    const text = `${title} ${description || ''}`.toLowerCase();
    
    if (text.includes('urgent') || text.includes('critical') || text.includes('asap')) {
      return 'urgent';
    }
    if (text.includes('important') || text.includes('high') || text.includes('priority')) {
      return 'high';
    }
    if (text.includes('minor') || text.includes('low') || text.includes('nice to have')) {
      return 'low';
    }
    
    return 'medium';
  }

  private generateTags(name: string, description?: string): string[] {
    const text = `${name} ${description || ''}`.toLowerCase();
    const tags: string[] = [];
    
    const keywords = [
      'api', 'frontend', 'backend', 'database', 'auth', 'mcp', 'integration',
      'react', 'typescript', 'websocket', 'chittyid', 'registry', 'tool'
    ];
    
    keywords.forEach(keyword => {
      if (text.includes(keyword)) {
        tags.push(keyword);
      }
    });
    
    return tags.slice(0, 5); // Limit to 5 tags
  }

  private generateTaskTags(title: string, description?: string): string[] {
    return this.generateTags(title, description);
  }

  private async getAgentName(agentId: string): Promise<string> {
    try {
      const agent = await storage.getAgent(agentId);
      return agent?.name || 'Unknown Agent';
    } catch {
      return 'Unknown Agent';
    }
  }
}

export const mcpServer = new MCPServer();
