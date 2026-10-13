export class ToolRegistry {
  constructor() { this.tools = new Map(); }
  register(tool) {
    if (!tool?.name || typeof tool.execute !== 'function') throw new Error('Tool requires name and execute().');
    this.tools.set(tool.name, { description: '', input: {}, permissions: [], ...tool });
    return this;
  }
  has(name) { return this.tools.has(name); }
  describe() { return [...this.tools.values()].map(({ name, description, input, permissions }) => ({ name, description, input, permissions })); }
  async execute(name, input = {}, ctx = {}) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown NOVA tool: ${name}`);
    const started = Date.now();
    const output = await tool.execute(input, ctx);
    return { tool: name, output, durationMs: Date.now() - started };
  }
}
