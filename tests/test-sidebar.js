const TARGET = 'ws://127.0.0.1:9222/devtools/page/57FEF44847D4A0FAC13A6557C8371971'
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

  const items = await evalJs(`(() => {
    // 找 sidebar 里所有导航项
    const candidates = document.querySelectorAll('aside button, aside a, nav button, nav a, [class*="sidebar"] button, [class*="sidebar"] a, [class*="nav"] button, [class*="nav"] a');
    return [...candidates].map(c => ({ text: c.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40), cls: c.className.slice(0, 50) })).filter(x => x.text);
  })()`)
  console.log('Sidebar nav items:')
  console.log(JSON.stringify(items, null, 2))
  ws.close()
}
main().catch(e => { console.error('❌', e); process.exit(1) })
