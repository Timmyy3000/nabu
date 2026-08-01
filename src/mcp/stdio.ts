import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createNabuMcpServer } from '../lib/mcp/server'
import { createKnowledgeGatewayFromEnvironment, prepareMcpEnvironment, validateMcpEnvironment } from '../lib/mcp/gateway'

async function main(): Promise<void> {
  await prepareMcpEnvironment()
  const configuration = validateMcpEnvironment()
  const gateway = createKnowledgeGatewayFromEnvironment()

  process.stderr.write(`Nabu MCP server starting in ${configuration.mode} mode\n`)
  serveStdio(() => createNabuMcpServer(gateway), {
    legacy: 'serve',
    onerror: (error) => process.stderr.write(`Nabu MCP error: ${error.message}\n`),
  })
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Nabu MCP failed to start'
  process.stderr.write(`Nabu MCP startup failed: ${message}\n`)
  process.exitCode = 1
})
