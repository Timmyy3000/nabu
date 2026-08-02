import nabuSkillMarkdown from '../lib/agent/nabu-skill.md?raw'

export const NABU_AGENT_SKILL_SOURCE =
  'https://github.com/Timmyy3000/skills/blob/6c0e2379ba7b839773da7dd792c0d5663d5c6e06/skills/nabu/SKILL.md'

function removeSkillMetadata(markdown: string): string {
  return markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/\r?\nSource:.*\s*$/, '')
    .trim()
}

export function renderAgentsMarkdown(): string {
  return `${removeSkillMetadata(nabuSkillMarkdown)}\n\nSource: ${NABU_AGENT_SKILL_SOURCE}\n`
}
