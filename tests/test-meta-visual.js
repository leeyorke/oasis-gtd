/**
 * 看 task-meta 在浏览器里实际渲染的样子（HTML 片段 + 位置信息）
 */
const TARGET = 'ws://127.0.0.1:9222/devtools/page/B2689DA145DAD52D3F7E0DD1E61BE992'

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

  // 切到 NextActions
  await evalJs(`(() => {
    for (const a of document.querySelectorAll('.nav-link')) {
      if (a.textContent.trim() === '下一步行动') { a.click(); return }
    }
  })()`)
  await sleep(800)

  // 看"加一个mcp服务功能"任务的 meta 完整 HTML
  const probe = await evalJs(`(() => {
    for (const card of document.querySelectorAll('.task-card')) {
      const title = card.querySelector('.task-title')?.textContent?.trim() || '';
      if (title.includes('mcp服务')) {
        const meta = card.querySelector('.task-meta');
        // 数 gap
        const cs = getComputedStyle(meta);
        return {
          html: meta.outerHTML,
          gap: cs.gap,
          display: cs.display,
          alignItems: cs.alignItems,
          flexWrap: cs.flexWrap,
        };
      }
    }
    return null;
  })()`)
  console.log('Meta 实际 HTML:')
  console.log(probe.html)
  console.log('\nMeta 容器样式:')
  console.log(JSON.stringify({ gap: probe.gap, display: probe.display, alignItems: probe.alignItems, flexWrap: probe.flexWrap }, null, 2))

  ws.close()
}
main().catch(e => { console.error('❌', e); process.exit(1) })
