// @vitest-environment jsdom
import { expect, it } from 'vitest'
import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import { highlightCode } from './codeHighlight'

it('isolates highlighted comments from host styles and preserves source text', () => {
  const source = 'npm install react\n\n# 包尚未发布时，生成 tarball\nyarn build\n# class="token comment" <script> &'
  const host = document.createElement('div')
  host.innerHTML = highlightCode(source, Prism.languages.bash)
  expect(host.textContent).toBe(source)
  expect(host.querySelector('.comment, .token, script')).toBeNull()
  expect(host.querySelectorAll('.sk-token-comment')).toHaveLength(2)
  for (const el of host.querySelectorAll('span')) for (const name of el.classList) expect(name).toMatch(/^sk-token/)
})
