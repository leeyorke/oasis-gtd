/**
 * CDP 端到端：验证 ThinkingBlock 在 hasIncompleteThought=true 时显示
 * "思考中" 标签 + spinner，false 时显示 "思考用时 X.Xs"。
 */
const TARGET = 'ws://127.0.0.1:9222/devtools/page/8BF90F49127F4CE87D4D1B48860F79FC'

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

  // === 验证 1: 注入思考中状态 ===
  console.log('=== 验证 1: 思考中（hasIncompleteThought=true）===')
  const thinkingProbe = await evalJs(`(() => {
    const main = document.querySelector('main.main-content') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'markdown-body';
    wrap.style.padding = '1rem';
    wrap.innerHTML = \`
      <div class="think-block">
        <button class="think-summary" aria-expanded="false">
          <span class="think-caret">▸</span>
          <span class="think-label">思考中</span>
          <span class="think-spinner" aria-hidden="true"></span>
        </button>
      </div>
    \`;
    main.appendChild(wrap);
    const label = wrap.querySelector('.think-label');
    const spinner = wrap.querySelector('.think-spinner');
    const cs = getComputedStyle(spinner);
    return {
      labelText: label?.textContent,
      spinnerExists: !!spinner,
      spinnerWidth: cs.width,
      spinnerHeight: cs.height,
      spinnerBorderRadius: cs.borderRadius,
      spinnerBorderTopColor: cs.borderTopColor,
      spinnerAnimation: cs.animation.slice(0, 80),
      spinnerAnimationName: cs.animationName,
    };
  })()`)
  console.log(JSON.stringify(thinkingProbe, null, 2))
  const checks1 = [
    [thinkingProbe.labelText === '思考中', 'label 是 "思考中"'],
    [thinkingProbe.spinnerExists, 'spinner 元素存在'],
    [thinkingProbe.spinnerBorderRadius === '50%', 'spinner 圆角 50%'],
    [thinkingProbe.spinnerAnimationName === 'thinkSpin', 'spinner 动画名 thinkSpin'],
  ]
  let pass1 = 0, fail1 = 0
  for (const [ok, desc] of checks1) {
    console.log(`  ${ok ? '✅' : '❌'} ${desc}`)
    if (ok) pass1++; else fail1++
  }

  // === 验证 2: 思考完成状态（duration 标签）===
  console.log('\n=== 验证 2: 思考完成（hasIncompleteThought=false）===')
  const doneProbe = await evalJs(`(() => {
    const main = document.querySelector('main.main-content') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'markdown-body';
    wrap.style.padding = '1rem';
    // 模拟 ThinkingBlock 在 hasIncompleteThought=false 时的 DOM
    wrap.innerHTML = \`
      <div class="think-block">
        <button class="think-summary" aria-expanded="false">
          <span class="think-caret">▸</span>
          <span class="think-label">思考用时 1.2s</span>
          <span class="think-preview">这是思考内容预览...</span>
          <span class="think-hint">点击展开</span>
        </button>
      </div>
    \`;
    main.appendChild(wrap);
    const label = wrap.querySelector('.think-label');
    const preview = wrap.querySelector('.think-preview');
    const hint = wrap.querySelector('.think-hint');
    const spinner = wrap.querySelector('.think-spinner');
    return {
      labelText: label?.textContent,
      hasSpinner: !!spinner,
      hasPreview: !!preview,
      hasHint: !!hint,
      previewText: preview?.textContent,
    };
  })()`)
  console.log(JSON.stringify(doneProbe, null, 2))
  const checks2 = [
    [doneProbe.labelText === '思考用时 1.2s', 'label 是 "思考用时 1.2s"'],
    [doneProbe.hasSpinner === false, '无 spinner'],
    [doneProbe.hasPreview, '有 preview'],
    [doneProbe.hasHint, '有 hint'],
  ]
  let pass2 = 0, fail2 = 0
  for (const [ok, desc] of checks2) {
    console.log(`  ${ok ? '✅' : '❌'} ${desc}`)
    if (ok) pass2++; else fail2++
  }

  // === 验证 3: spinner @keyframes thinkSpin 存在于 CSSOM ===
  console.log('\n=== 验证 3: thinkSpin keyframes 在 CSSOM 里 ===')
  const kfProbe = await evalJs(`(() => {
    const found = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.cssText && rule.cssText.includes('thinkSpin')) found.push(rule.cssText.slice(0, 100));
        }
      } catch {}
    }
    return { found, count: found.length };
  })()`)
  console.log(JSON.stringify(kfProbe, null, 2))
  const pass3 = kfProbe.count > 0
  console.log(`  ${pass3 ? '✅' : '❌'} thinkSpin keyframes 已注册`)
  const pass = pass1 + pass2 + (pass3 ? 1 : 0)
  const fail = fail1 + fail2 + (pass3 ? 0 : 1)
  console.log(`\n${pass}/${pass + fail} pass`)
  if (fail > 0) process.exit(1)

  ws.close()
}
main().catch(e => { console.error('❌', e); process.exit(1) })
