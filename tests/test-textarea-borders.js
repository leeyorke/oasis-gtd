/**
 * 探针脚本：进 Projects 详情 → 打开弹窗 → 量 textarea 的实际边框
 */
const TARGET = 'ws://127.0.0.1:9222/devtools/page/3DE6FF99180BEAB721D59021DAF23B7C'

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map()
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
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
}

async function main() {
  const ws = new WebSocket(TARGET)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  const cdp = new CDP(ws)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  const evalJs = cdp.evalJs.bind(cdp)
  const sleep = cdp.sleep.bind(cdp)

  // 切到 Projects
  await evalJs(`(() => {
    for (const el of document.querySelectorAll('button, a, [role="button"], .nav-item, [class*="nav"]')) {
      if (el.textContent.trim() === '项目' || el.textContent.trim() === 'Projects') { el.click(); return }
    }
  })()`)
  await sleep(700)
  // 进第一个项目
  await evalJs(`(() => {
    const c = document.querySelector('.project-card');
    if (c) c.click();
  })()`)
  await sleep(700)
  // 点 FAB
  await evalJs(`(() => {
    const f = document.querySelector('.fab-button');
    if (f) f.click();
  })()`)
  await sleep(500)

  // === 探针：量 textarea 的所有边框 ===
  const probe = await evalJs(`(() => {
    const ta = document.querySelector('.modal-sheet textarea.form-textarea');
    if (!ta) return { error: '找不到 textarea' };
    const cs = getComputedStyle(ta);
    return {
      borderTop: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
      borderRight: cs.borderRightWidth + ' ' + cs.borderRightStyle + ' ' + cs.borderRightColor,
      borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomStyle + ' ' + cs.borderBottomColor,
      borderLeft: cs.borderLeftWidth + ' ' + cs.borderLeftStyle + ' ' + cs.borderLeftColor,
      outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor,
      boxShadow: cs.boxShadow,
      background: cs.background.slice(0, 80),
      // 量 textarea 元素 + 它周围元素的 bounding box
      rect: ta.getBoundingClientRect().toJSON ? ta.getBoundingClientRect().toJSON() : (() => { const r = ta.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height} })(),
      // 看 textarea 后面紧跟什么元素
      nextSibling: ta.nextElementSibling ? { tag: ta.nextElementSibling.tagName, cls: ta.nextElementSibling.className } : null,
      // 整个 modal-sheet 的 border 概览
      sheetOutline: (() => { const s = getComputedStyle(ta.closest('.modal-sheet')); return { borderTop: s.borderTop, borderBottom: s.borderBottom, boxShadow: s.boxShadow.slice(0, 60) } })(),
    };
  })()`)
  console.log('=== TEXTAREA BORDERS ===')
  console.log(JSON.stringify(probe, null, 2))

  // 也量一下 input 的边框做对比
  const inputProbe = await evalJs(`(() => {
    const i = document.querySelector('.modal-sheet input.form-input');
    const cs = getComputedStyle(i);
    return {
      borderTop: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
      borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomStyle + ' ' + cs.borderBottomColor,
      outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor,
    };
  })()`)
  console.log('\n=== INPUT BORDERS (对比) ===')
  console.log(JSON.stringify(inputProbe, null, 2))

  // 量 .modal-actions 顶部的 border
  const actionsProbe = await evalJs(`(() => {
    const a = document.querySelector('.modal-sheet .modal-actions');
    if (!a) return { error: 'no actions' };
    const cs = getComputedStyle(a);
    return {
      borderTop: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
      borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomStyle + ' ' + cs.borderBottomColor,
      paddingTop: cs.paddingTop,
      marginTop: cs.marginTop,
    };
  })()`)
  console.log('\n=== MODAL-ACTIONS BORDERS ===')
  console.log(JSON.stringify(actionsProbe, null, 2))

  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
