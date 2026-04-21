# Nabu Setup

This guide is written for agents.

If a human sends you the Nabu GitHub repo and says "set this up for me," this is the path.

Nabu is a self-hosted, markdown-native knowledge OS for humans and agents.
The app is disposable.
The knowledge is not.

That means your first job is not "get the app running."
Your first job is **put the knowledge on persistent storage and make the app point at it correctly**.

## What Nabu needs

Nabu needs exactly two runtime inputs:

- `KNOWLEDGE_PATH` — absolute path to the mounted knowledge directory
- `NABU_PASSWORD` — password required to access the app

Example:

```bash
KNOWLEDGE_PATH=/data/nabu/knowledge
NABU_PASSWORD="set-a-real-password-here"
```

## The non-negotiables

If you are the agent doing setup, do not screw these up:

1. **The filesystem is the source of truth**
   - Notes live on disk as markdown files.
   - Do not store the human's real notes inside the git checkout.

2. **`KNOWLEDGE_PATH` must be persistent**
   - If using containers, mount a persistent bind mount or persistent volume.
   - If using bare metal, point to a durable directory outside the repo.

3. **Back up the knowledge directory**
   - This is where the actual notes live.
   - The app can be rebuilt. The notes are the thing that matters.
   - Recommend periodic archive/export/backup jobs.

4. **Set a real password**
   - Never leave `NABU_PASSWORD` set to a placeholder value.
   - Use a long random secret.

5. **Do not make the repo directory the vault**
   - Bad: `/opt/nabu`
   - Good: `/data/nabu/knowledge` or `/srv/nabu/knowledge`

## Questions to resolve before installation

If you do not already know these answers, ask the human:

1. What domain or subdomain should Nabu live on?
   - Example: `nabu.example.com`
2. Are we deploying with Docker/container infra, or directly on the server with Node/Bun?
3. Where should persistent knowledge live?
   - Recommended: `/data/nabu/knowledge`
4. Is there already an existing markdown vault we should mount?
5. What password should protect the app?
6. Is TLS/HTTPS already handled by a reverse proxy/platform?
7. Do they want backups enabled now or later?

If the environment already makes the answer obvious, resolve it yourself and move on.
Do not ask pointless questions when the platform already dictates the right answer.

## Recommended deployment shape

For most self-hosted installs, use this shape:

- app checkout or image: ephemeral
- knowledge directory: persistent
- reverse proxy: handles HTTPS
- `KNOWLEDGE_PATH`: points at the persistent mounted directory

Recommended paths:

```text
/opt/nabu            # app checkout or deployment workspace
/data/nabu/knowledge # persistent markdown vault
/data/nabu/backups   # optional backup output
```

## Container deployment: the right way

If Nabu runs in a container, **mount the knowledge directory**.

That mount can be either:
- a bind mount to persistent server storage, or
- a named/persistent container volume

What matters is simple:

**the mounted path must survive container replacement**

because that is where the real knowledge lives.

### Docker Compose example with bind mount

Use the repo directly and build the image from source:

```yaml
services:
  nabu:
    build:
      context: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      KNOWLEDGE_PATH: /data/nabu/knowledge
      NABU_PASSWORD: ${NABU_PASSWORD}
    volumes:
      - /data/nabu/knowledge:/data/nabu/knowledge
```

This is good because:
- the host owns the real note storage
- container rebuilds do not wipe the vault
- backups are easy from the host path

### Docker Compose example with a named volume

```yaml
services:
  nabu:
    build:
      context: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      KNOWLEDGE_PATH: /data/nabu/knowledge
      NABU_PASSWORD: ${NABU_PASSWORD}
    volumes:
      - nabu_knowledge:/data/nabu/knowledge

volumes:
  nabu_knowledge:
```

This is acceptable if the platform manages volume persistence correctly.
A plain bind mount is often easier to reason about and back up.

### Docker build + run example

Build the image from the repo:

```bash
docker build -t nabu:local .
```

Then run it with a persistent mount:

```bash
docker run -d \
  --name nabu \
  --restart unless-stopped \
  -p 3000:3000 \
  -e KNOWLEDGE_PATH=/data/nabu/knowledge \
  -e NABU_PASSWORD="set-a-real-password-here" \
  -v /data/nabu/knowledge:/data/nabu/knowledge \
  nabu:local
```

### What not to do

Do **not** do this:

```yaml
volumes: []
```

or this:

```bash
KNOWLEDGE_PATH=/app/content
```

when `/app/content` is just container filesystem with no persistent mount behind it.

That is how people lose data and then act surprised.

## Source deployment on a server

If you are deploying from source on a Linux box:

```bash
git clone https://github.com/Timmyy3000/nabu.git /opt/nabu
cd /opt/nabu
npm install
npm run build
```

Then run with environment variables:

```bash
export KNOWLEDGE_PATH=/data/nabu/knowledge
export NABU_PASSWORD="set-a-real-password-here"
node .output/server/index.mjs
```

Create the knowledge directory if needed:

```bash
mkdir -p /data/nabu/knowledge
```

## Dokploy / source-build platforms

Nabu already builds fine on source-build platforms.
If the platform supports environment variables and persistent mounts, that is enough.

On Dokploy-like platforms, make sure you configure:

- `KNOWLEDGE_PATH=/data/nabu/knowledge`
- `NABU_PASSWORD=<set-a-real-password-here>`
- a persistent mount for `/data/nabu/knowledge`

If the platform builds from repo source, point it at this repo directly.
If the platform expects a Docker image, build and publish the included `Dockerfile` first.

The important bit is not the platform UI.
The important bit is that the runtime path inside the app matches the mounted persistent path.

## Local development setup

For local dev:

```bash
git clone https://github.com/Timmyy3000/nabu.git
cd nabu
cp .env.example .env
# edit .env before starting the app
npm install
```

Then set real values in `.env`:

```bash
KNOWLEDGE_PATH=/absolute/path/to/local/knowledge
NABU_PASSWORD=set-a-real-password-here
```

Then start the app:

```bash
npm run dev
```
You can also use Bun:

```bash
bun install
bun run dev
```

## Existing vault migration

If the human already has markdown notes:

1. Put the vault on persistent storage
2. Point `KNOWLEDGE_PATH` at that directory
3. Make sure file permissions allow the app to read it
4. If Nabu will write notes/folders, make sure the app user can write there too

Good example:

```bash
/data/nabu/knowledge
```

If migrating from Obsidian or a plain markdown repo, do **not** copy the notes into the Nabu app repo.
Mount or place them as a separate vault directory.

## Reverse proxy and HTTPS

If exposed publicly, put Nabu behind HTTPS.

Typical reverse proxy targets:
- Nginx
- Caddy
- Traefik
- Dokploy-managed ingress

Nabu itself just needs the app reachable.
The exact proxy is not sacred.
What matters:
- HTTPS enabled
- app forwarded correctly
- long random password set

## Backups

Back up the knowledge directory, not just the app.

Minimum sane backup target:

```text
/data/nabu/knowledge
```

Recommended backup habits:
- daily snapshot or archive
- occasional off-server copy
- test restore at least once

Example simple archive job:

```bash
tar -czf /data/nabu/backups/nabu-knowledge-$(date +%F).tar.gz /data/nabu/knowledge
```

If the human cares about their notes, this is not optional forever.

## Verification checklist after install

Before calling setup complete, verify all of this:

- app loads
- login works with `NABU_PASSWORD`
- a note in `KNOWLEDGE_PATH` appears in the UI
- creating or editing a note writes back to the mounted knowledge directory
- container/server restart does not lose notes
- mounted path is actually persistent
- `/agents.md` is reachable after auth

## Agent handoff checklist

If you are the agent finishing setup, leave the human with:

- live URL
- where the knowledge is stored
- how to change the password
- how to back up the vault
- whether writes are enabled and tested
- whether the deployment is source-based or container-based

## One-paragraph instruction a human can send to an agent

```text
Set up Nabu for me from this repo: https://github.com/Timmyy3000/nabu
Use a persistent knowledge directory outside the repo, mount it correctly if using containers, set a real NABU_PASSWORD, and verify that notes survive restarts. If anything about domain, hosting style, or storage location is unclear, ask me only the minimum necessary questions.
```

## Short version

If you remember only one thing, remember this:

**Nabu is easy to redeploy. The vault is not. Mount persistent storage correctly or you are doing a fake setup.**
