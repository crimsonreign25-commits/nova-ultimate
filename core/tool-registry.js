export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    if (!tool?.name || typeof tool.execute !== 'function') {
      throw new Error('Tool requires name and execute().');
    }
    const requiresApproval = Boolean(tool.requiresApproval || tool.permissions?.some(p => ['destructive', 'external-write', 'financial'].includes(p)));
    const timeoutMs = Number(tool.timeoutMs) || 30000;
    this.tools.set(tool.name, {
      description: '',
      inputSchema: tool.inputSchema || tool.input || {},
      permissions: [],
      requiresApproval,
      timeoutMs,
      ...tool
    });
    return this;
  }

  has(name) {
    return this.tools.has(name);
  }

  describe() {
    return [...this.tools.values()].map(({ name, description, inputSchema, input, permissions, requiresApproval, timeoutMs }) => ({
      name,
      description,
      inputSchema: inputSchema || input,
      permissions,
      requiresApproval,
      timeoutMs
    }));
  }

  validateInput(tool, input) {
    const schema = tool.inputSchema || tool.input || {};
    if (!schema || typeof schema !== 'object') return true;
    for (const [key, expectedType] of Object.entries(schema)) {
      if (typeof expectedType === 'string' && expectedType.endsWith('?')) {
        // Optional field
        const baseType = expectedType.slice(0, -1);
        if (input[key] !== undefined && typeof input[key] !== baseType) {
          throw new Error(`Invalid input type for ${key}: expected ${baseType}, got ${typeof input[key]}`);
        }
      } else if (typeof expectedType === 'string') {
        if (input[key] === undefined) {
          throw new Error(`Missing required parameter '${key}' for tool '${tool.name}'`);
        }
        if (typeof input[key] !== expectedType) {
          throw new Error(`Invalid input type for ${key}: expected ${expectedType}, got ${typeof input[key]}`);
        }
      }
    }
    return true;
  }

  async execute(name, input = {}, ctx = {}) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown NOVA tool: ${name}`);

    if (ctx.signal?.aborted) {
      throw Object.assign(new Error(`Tool execution cancelled for ${name}`), { code: 'CANCELLED' });
    }

    if (tool.requiresApproval && !ctx.approved) {
      throw Object.assign(new Error(`Tool '${name}' requires explicit user approval before execution.`), {
        code: 'APPROVAL_REQUIRED',
        tool: name,
        requiresApproval: true
      });
    }

    this.validateInput(tool, input);

    const timeoutMs = ctx.timeoutMs || tool.timeoutMs || 30000;
    const started = Date.now();

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(Object.assign(new Error(`Tool execution timed out after ${timeoutMs}ms for ${name}`), { code: 'TIMEOUT' }));
      }, timeoutMs);
    });

    try {
      const resultPromise = Promise.resolve(tool.execute(input, ctx));
      const output = await Promise.race([resultPromise, timeoutPromise]);
      clearTimeout(timer);
      return {
        tool: name,
        output,
        durationMs: Date.now() - started,
        validated: true,
        approved: Boolean(ctx.approved)
      };
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
  }
}
