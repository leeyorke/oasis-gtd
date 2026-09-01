/**
 * 验证项目名现在在 meta 行末尾（创建时间之后）
 */
const TARGET = 'ws://127.0.0.1:9222/devtools/page/D5AE35DC7F538A9D4189CA32E9CB533F'

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id)
        this.pending.delete(m.id)
        if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })) })
  }
  async evalJs(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
}

async function main() {
  const ws = new WebSocket(TARGET)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const cdp = new CDP(ws)
  await cdp.send('Runtime.enable')
  const evalJs = cdp.evalJs.bind(cdp)
  const sleep = cdp.sleep.bind(cdp)

  await cdp.send('Page.reload', { ignoreCache: true })
  await sleep(2500)

  await evalJs(`(() => {
    for (const a of document.querySelectorAll('.nav-link')) {
      if (a.textContent.trim() === '下一步行动') { a.click(); return }
    }
  })()`)
  await sleep(1000)

  // 找"加一个mcp服务功能"任务，看 meta 的子节点顺序
  const probe = await evalJs(`(() => {
    for (const card of document.querySelectorAll('.task-card')) {
      const title = card.querySelector('.task-title')?.textContent?.trim() || '';
      if (title.includes('mcp服务')) {
        const meta = card.querySelector('.task-meta');
        // 顺序抓 meta 里的所有子节点（element 节点 + text 节点）
        const children = [...meta.childNodes].map(n => {
          if (n.nodeType === 3) return { type: 'text', text: n.textContent };
          if (n.nodeType === 1) return {
            type: 'el',
            tag: n.tagName.toLowerCase(),
            text: n.textContent.trim().slice(0, 30),
            cls: n.className?.toString?.() || '',
          };
          return { type: 'other' };
        });
        return { children, fullText: meta.textContent };
      }
    }
    return null;
  })()`)
  console.log('=== "加一个mcp服务功能" 任务的 meta 子节点顺序 ===')
  console.log(JSON.stringify(probe.children, null, 2))
  console.log('\n完整文本:', probe.fullText)

  // 断言: oasis-dev 应该是最后一个有内容的子节点
  const meaningful = probe.children.filter(c => c.type !== 'text' || c.text.trim())
  const lastMeaningful = meaningful[meaningful.length - 1]
  console.log('\n最后一个有内容的子节点:', JSON.stringify(lastMeaningful))
  const projectIsLast = lastMeaningful.type === 'el' && lastMeaningful.text === 'oasis-dev'
  console.log('断言 (项目名是最后一个):', projectIsLast ? '✅ PASS' : '❌ FAIL')

  // 看"无项目"任务的 meta 顺序，确认没在末尾追加多余 dot
  const noProj = await evalJs(`(() => {
    for (const card of document.querySelectorAll('.task-card')) {
      const title = card.querySelector('.task-title')?.textContent?.trim() || '';
      if (title.includes('【无项目】')) {
        const meta = card.querySelector('.task-meta');
        const children = [...meta.childNodes].map(n => {
          if (n.nodeType === 3) return { type: 'text', text: n.textContent };
          if (n.nodeType === 1) return { type: 'el', tag: n.tagName.toLowerCase(), text: n.textContent.trim().slice(0, 20), cls: n.className?.toString?.() || '' };
          return null;
        });
        return { children, fullText: meta.textContent };
      }
    }
    return null;
  })()`)
  console.log('\n=== "【无项目】" 任务的 meta（应无末尾项目名） ===')
  console.log(JSON.stringify(noProj.children, null, 2))
  console.log('完整文本:', noProj.fullText)

  // 断言: 无项目任务的 meta 末尾没有 dot 残留
  const noProjMeaningful = noProj.children.filter(c => c.type !== 'text' || c.text.trim())
  const lastOfNoProj = noProjMeaningful[noProjMeaningful.length - 1]
  console.log('\n无项目任务末尾:', JSON.stringify(lastOfNoProj))
  const noProjCleanEnd = lastOfNoProj.type === 'el' && lastOfNoProj.tag === 'span' && !lastOfNoProj.cls.includes('meta-dot')
  console.log('断言 (无项目任务末尾是时间文本，无 dot 残留):', noProjCleanEnd ? '✅ PASS' : '❌ FAIL')

  ws.close()
  console.log('\n✅ 验证完成')
}
main().catch(e => { console.error('❌', e); process.exit(1) })
