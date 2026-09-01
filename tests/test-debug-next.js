/**
 * 调试：看 NextActions 视图实际渲染了什么
 */
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
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
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

  // 切到 NextActions
  await evalJs(`(() => {
    for (const el of document.querySelectorAll('button, a, [class*="nav"]')) {
      if (el.textContent.trim() === '下一步行动' || el.textContent.trim() === 'Next Actions') { el.click(); return }
    }
  })()`)
  await sleep(1000)

  // 看 body 全部文本
  const body = await evalJs(`document.body.innerText`)
  console.log('=== NextActions 页面 body 文本（截取） ===')
  console.log(body.slice(0, 800))

  // 查 task-card 数量
  const cardCount = await evalJs(`document.querySelectorAll('.task-card').length`)
  console.log(`\n.task-card 数量: ${cardCount}`)

  // 查 .task-title 数量
  const titleCount = await evalJs(`document.querySelectorAll('.task-title').length`)
  console.log(`.task-title 数量: ${titleCount}`)

  // 查 main 元素里有什么
  const main = await evalJs(`(() => {
    const m = document.querySelector('main, [class*="main-content"], [class*="content"]');
    return m ? m.outerHTML.slice(0, 2000) : 'no main';
  })()`)
  console.log('\n=== main 区域 HTML 片段 ===')
  console.log(main)

  ws.close()
}
main().catch(e => { console.error('❌', e); process.exit(1) })
