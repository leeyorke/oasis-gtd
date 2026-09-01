/**
 * 验证 .modal-actions 去掉 border-top 后，弹窗底部只剩 1 条线
 */
const TARGET = 'ws://127.0.0.1:9222/devtools/page/3DE6FF99180BEAB721D59021DAF23B7C'

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
  await cdp.send('Page.enable')
  const evalJs = cdp.evalJs.bind(cdp)
  const sleep = cdp.sleep.bind(cdp)

  // 强制 reload 一次确保 CSS 重新拉取
  console.log('重新加载页面以应用 CSS 改动...')
  await cdp.send('Page.reload', { ignoreCache: true })
  await sleep(2000)

  // === 验证 1：进 Projects 详情 + 打开 AddTaskModal ===
  console.log('\n=== 1) Projects 弹窗 (AddTaskModal) ===')
  await evalJs(`(() => {
    for (const el of document.querySelectorAll('button, a, [class*="nav"]')) {
      if (el.textContent.trim() === '项目' || el.textContent.trim() === 'Projects') { el.click(); return }
    }
  })()`)
  await sleep(600)
  await evalJs(`(() => { const c = document.querySelector('.project-card'); if (c) c.click() })()`)
  await sleep(600)
  await evalJs(`(() => { const f = document.querySelector('.fab-button'); if (f) f.click() })()`)
  await sleep(500)

  const probe1 = await evalJs(`(() => {
    const sheet = document.querySelector('.modal-sheet');
    if (!sheet) return { error: '弹窗没出现' };
    const ta = sheet.querySelector('textarea.form-textarea');
    const actions = sheet.querySelector('.modal-actions');
    const taCS = getComputedStyle(ta);
    const aCS = getComputedStyle(actions);
    return {
      textareaBorderBottom: taCS.borderBottomWidth + ' ' + taCS.borderBottomStyle,
      actionsBorderTop: aCS.borderTopWidth + ' ' + aCS.borderTopStyle,
      actionsPaddingTop: aCS.paddingTop,
      actionsMarginTop: aCS.marginTop,
    };
  })()`)
  console.log(JSON.stringify(probe1, null, 2))
  const pass1 = probe1.textareaBorderBottom.includes('1px') && probe1.actionsBorderTop.startsWith('0px')
  console.log('断言:', pass1 ? '✅ 1 条线 (textarea 下边线)' : '❌ 失败')

  // 关掉弹窗
  await evalJs(`(() => { const b = document.querySelector('.modal-sheet button.btn-text'); if (b) b.click() })()`)
  await sleep(300)
  await evalJs(`(() => { const b = document.querySelector('.project-card')?.closest('[class*="back"], [class*="return"]') || [...document.querySelectorAll('button')].find(b=>b.textContent.includes('返回')); if (b) b.click() })()`).catch(()=>{})
  await sleep(400)

  // === 验证 2：进 Thoughts 弹窗（如果它有 AddTaskModal 模式） ===
  // Thoughts 用的是 inline QuickCapture，弹窗形态不固定。我们直接验证全局 .modal-actions 样式：
  console.log('\n=== 2) 全局 .modal-actions CSS 校验 ===')
  const globalCheck = await evalJs(`(() => {
    // 创建一个临时 .modal-actions 元素验证 CSS
    const div = document.createElement('div');
    div.className = 'modal-actions';
    div.style.visibility = 'hidden';
    document.body.appendChild(div);
    const cs = getComputedStyle(div);
    const result = {
      borderTop: cs.borderTopWidth + ' ' + cs.borderTopStyle,
      paddingTop: cs.paddingTop,
    };
    document.body.removeChild(div);
    return result;
  })()`)
  console.log(JSON.stringify(globalCheck, null, 2))
  const pass2 = globalCheck.borderTop.startsWith('0px')
  console.log('断言:', pass2 ? '✅ 全局 .modal-actions border-top 已移除' : '❌ 失败')

  ws.close()
  console.log('\n✅ 验证完成')
}
main().catch(e => { console.error('❌', e); process.exit(1) })
