import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/agent/$secret')({
  headers: () => ({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  }),
  head: () => ({
    meta: [
      { name: 'referrer', content: 'no-referrer' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AgentConnectionHandoffRoute,
})

export function AgentConnectionHandoffPage() {
  return (
    <section className="route-page route-page-center agent-handoff-page">
      <article className="agent-handoff-surface">
        <div className="wordmark agent-handoff-wordmark" aria-label="𒀭 nabu">
          <span className="wedge">𒀭</span>
          <span className="wordmark-text">nabu</span>
        </div>
        <p className="section-label">agent handoff</p>
        <h1>Connect this agent to Nabu</h1>
        <p className="agent-handoff-lede">This page is a safe handoff surface. Opening the link does not redeem it or create a credential.</p>

        <div className="agent-handoff-callout" role="status">
          <strong>Redemption is an explicit POST action.</strong>
          <span>The one-time connection link expires quickly and can be used only once.</span>
        </div>

        <section className="agent-handoff-section" aria-labelledby="agent-handoff-next-step">
          <p className="section-label">for agents</p>
          <h2 id="agent-handoff-next-step">Next steps</h2>
          <ol className="agent-handoff-steps">
            <li>Send the full connection URL to <code>POST /api/agent/connections/redeem</code>.</li>
            <li>Put the URL in the JSON field <code>connectionUrl</code>.</li>
            <li>Save the returned durable credential securely. It is returned only once.</li>
          </ol>
        </section>

        <p className="agent-handoff-footnote">If the link has expired or was already redeemed, ask the owner to generate a new connection link.</p>
        <a href="/agents.md" className="text-button">read the agent contract</a>
      </article>
    </section>
  )
}

function AgentConnectionHandoffRoute() {
  return <AgentConnectionHandoffPage />
}
