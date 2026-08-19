import readline from 'node:readline';
import type { McpToolCall } from '@vibeos/shared';
import { OperatingSystemRuntime } from './runtime.js';
import { CodexAgentAdapter } from './codex-agent.js';

const runtime = new OperatingSystemRuntime(new CodexAgentAdapter(), { send() {} });
const reply = (id: string | number, result: unknown) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
const fail = (id: string | number, message: string) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32602, message } })}\n`);
const tools = [{ name: 'vibeos_dispatch', description: 'Dispatch a user intent into VibeOS.', inputSchema: { type: 'object', required: ['intent'], properties: { intent: { type: 'object' } } } }, { name: 'vibeos_snapshot', description: 'Read VibeOS state.', inputSchema: { type: 'object', properties: {} } }];

readline.createInterface({ input: process.stdin }).on('line', async line => {
  try {
    const request = JSON.parse(line) as { id: string | number; method: string; params?: Record<string, unknown> };
    if (request.method === 'initialize') return reply(request.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'vibeos', version: '0.1.0' } });
    if (request.method === 'notifications/initialized') return;
    if (request.method === 'tools/list') return reply(request.id, { tools });
    if (request.method !== 'tools/call') return fail(request.id, 'Unknown method');
    const call = request as McpToolCall;
    if (call.params.name === 'vibeos_snapshot') return reply(request.id, { content: [{ type: 'text', text: JSON.stringify(runtime.snapshot()) }] });
    if (call.params.name === 'vibeos_dispatch') return reply(request.id, { content: [{ type: 'text', text: JSON.stringify(await runtime.dispatch(call.params.arguments?.intent as never)) }] });
    return fail(request.id, `Unknown tool: ${call.params.name}`);
  } catch (cause) { process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`); }
});
