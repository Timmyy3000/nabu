const principles = [
  'Markdown files are the source of truth.',
  'Humans and agents share the same knowledge space.',
  'Private content lives outside the app repository.',
  'The web UI is a lens over the filesystem, not a replacement for it.',
]

const plannedFeatures = [
  'Filesystem-backed note browsing',
  'Frontmatter tags and typed metadata',
  'Backlinks and graph traversal',
  'Password-protected deployment on Dokploy',
  'Agent-friendly APIs for traversal and retrieval',
]

export function HomePage() {
  return (
    <div className="stack-lg">
      <section className="hero-card">
        <p className="eyebrow">Open source from day one</p>
        <h2>Nabu is Obsidian-on-the-web for humans and agents.</h2>
        <p className="lede">
          It reads a markdown knowledge bank from disk, renders it in a clean web UI,
          and leaves the files portable, inspectable, and AI-readable.
        </p>
      </section>

      <section className="grid-two">
        <article className="panel">
          <h3>Core principles</h3>
          <ul>
            {principles.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h3>Planned v1</h3>
          <ul>
            {plannedFeatures.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="panel">
        <h3>Content model</h3>
        <p>
          Nabu will treat the filesystem as the canonical knowledge layer. Folders express
          categories, markdown files hold note bodies, and frontmatter captures tags and metadata.
        </p>
        <pre className="code-block">{`knowledge/
  ideas/
    ai/
      agent-memory.md
  projects/
    nabu/
      roadmap.md`}</pre>
      </section>
    </div>
  )
}
