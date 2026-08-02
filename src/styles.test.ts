import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

const stylesheet = readFileSync('src/styles.css', 'utf8')

const tailwindListReset = `
  ol,
  ul,
  menu {
    list-style: none;
    margin: 0;
    padding: 0;
  }
`

function getComputedLists() {
  const lists = [...document.querySelectorAll<HTMLOListElement | HTMLUListElement>('.note-markdown ol, .note-markdown ul')]

  return lists.map((list) => ({
    tagName: list.tagName,
    style: window.getComputedStyle(list),
  }))
}

describe('reading-view Markdown list styles', () => {
  afterEach(() => {
    document.head.querySelector('[data-test-reading-view-styles]')?.remove()
    document.body.innerHTML = ''
  })

  it('restores markers and indentation after the Tailwind list reset', () => {
    const style = document.createElement('style')
    style.dataset.testReadingViewStyles = 'true'
    style.textContent = `${tailwindListReset}\n${stylesheet.replace(/^@import[^;]+;\s*/, '')}`
    document.head.append(style)
    document.body.innerHTML = `
      <div class="note-markdown">
        <ol>
          <li>First ordered item</li>
          <li>Second ordered item
            <ul>
              <li>Nested unordered item</li>
            </ul>
          </li>
        </ol>
        <ul>
          <li>First unordered item</li>
          <li>Second unordered item
            <ol>
              <li>Nested ordered item</li>
            </ol>
          </li>
        </ul>
      </div>
    `

    const lists = getComputedLists()
    const orderedLists = lists.filter(({ tagName }) => tagName === 'OL')
    const unorderedLists = lists.filter(({ tagName }) => tagName === 'UL')

    expect(orderedLists).toHaveLength(2)
    expect(unorderedLists).toHaveLength(2)
    expect(orderedLists.every(({ style }) => style.listStyleType === 'decimal')).toBe(true)
    expect(unorderedLists.every(({ style }) => style.listStyleType === 'disc')).toBe(true)
    expect(lists.every(({ style }) => style.paddingLeft === '22px')).toBe(true)
    expect(lists.every(({ style }) => style.marginTop === '16px' && style.marginBottom === '16px')).toBe(true)
  })
})
