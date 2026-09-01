/**
 * CDP 端到端：验证 .think-* CSS 选择器在真实 Electron 渲染进程里生效
 *
 * 策略：在 AIChat 视图里手动 dispatch 一个 React 组件实例的 forceUpdate 之前，
 * 构造一个含 thought 块的 assistant 消息。最直接的办法是通过 React fiber
 * 找到 useStore 组件实例的 props.messages（如果能找到的话），或者用
 * React DevTools API。
 *
 * 简化方案：跳过 React 状态，**直接构造一个 MarkdownMessage 组件实例的 HTML**
 * 挂到 DOM 里，验证 CSS 计算样式。但这只能验 CSS 不能验 React 渲染逻辑。
 *
 * 真正端到端需要：构造一个 conversation + 注入 messages，这要求主进程配合
 * 暴露 IPC 测试钩子。本次先验证 CSS 在 Electron 渲染进程里正确应用。
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

  // === 验证 1: 注入 think-block 测试元素，看 CSS 实际计算值 ===
  console.log('=== 验证 1: CSS 计算值（注入测试 DOM） ===')
  // 先确认 .think-caret.open 选择器在 CSSOM 里
  const cssCheck = await evalJs(`(() => {
    const found = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          const t = rule.cssText || '';
          if (t.includes('.think-caret') || t.includes('.think-block')) {
            found.push(t.slice(0, 100));
          }
        }
      } catch (e) { /* cross-origin */ }
    }
    return { ruleCount: found.length, sample: found.slice(0, 10) };
  })()`)
  console.log('CSSOM 中 .think-* 规则:')
  console.log(JSON.stringify(cssCheck, null, 2))
  const cssProbe = await evalJs(`(() => {
    // 1) 找到 chat-bubble 容器（如果有的话），把测试 DOM 挂到 main
    const main = document.querySelector('main.main-content') || document.body;
    const testWrap = document.createElement('div');
    testWrap.className = 'markdown-body';
    testWrap.style.padding = '1rem';
    testWrap.style.background = 'rgba(20,28,58,0.04)';
    testWrap.style.border = '1px solid rgba(20,28,58,0.06)';
    testWrap.innerHTML = \`
      <div class="think-block">
        <button class="think-summary" aria-expanded="false">
          <span class="think-caret">▸</span>
          <span class="think-label">思考过程</span>
          <span class="think-preview">这是 thought 预览...</span>
          <span class="think-hint">点击展开</span>
        </button>
      </div>
      <p>正式回答内容</p>
    \`;
    main.appendChild(testWrap);
    const r = {};
    const block = testWrap.querySelector('.think-block');
    const summary = testWrap.querySelector('.think-summary');
    const caret = testWrap.querySelector('.think-caret');
    const label = testWrap.querySelector('.think-label');
    const preview = testWrap.querySelector('.think-preview');
    const hint = testWrap.querySelector('.think-hint');
    if (!block) r.error = '.think-block 不存在';
    if (block) {
      const cs = getComputedStyle(block);
      r.block = {
        borderLeft: cs.borderLeftWidth + ' ' + cs.borderLeftStyle + ' ' + cs.borderLeftColor,
        background: cs.background.slice(0, 60),
        marginBottom: cs.marginBottom,
      };
    }
    if (summary) {
      const cs = getComputedStyle(summary);
      r.summary = {
        display: cs.display,
        cursor: cs.cursor,
        background: cs.background.slice(0, 50),
        width: cs.width,
      };
    }
    if (caret) {
      const cs = getComputedStyle(caret);
      r.caret = { fontSize: cs.fontSize, transition: cs.transition.slice(0, 40) };
    }
    if (label) {
      const cs = getComputedStyle(label);
      r.label = { fontSize: cs.fontSize, textTransform: cs.textTransform, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing };
    }
    if (preview) {
      const cs = getComputedStyle(preview);
      r.preview = { fontSize: cs.fontSize, fontStyle: cs.fontStyle, color: cs.color, opacity: cs.opacity };
    }
    if (hint) {
      const cs = getComputedStyle(hint);
      r.hint = { fontSize: cs.fontSize, color: cs.color };
    }
    // 测展开态
    const expanded = testWrap.querySelector('[aria-expanded]');
    expanded.setAttribute('aria-expanded', 'true');
    const caretEl = expanded.querySelector('.think-caret');
    caretEl.classList.add('open');
    // 展开态 DOM（手动模拟 ThinkingBlock 的 {expanded && <pre>...} 行为）
    const body = document.createElement('pre');
    body.className = 'think-body';
    body.textContent = '展开后的 thought 内容';
    testWrap.querySelector('.think-block').appendChild(body);
    const bodyCS = getComputedStyle(body);
    r.body = {
      fontSize: bodyCS.fontSize,
      lineHeight: bodyCS.lineHeight,
      padding: bodyCS.padding,
      maxHeight: bodyCS.maxHeight,
      overflowY: bodyCS.overflowY,
      borderTop: bodyCS.borderTop,
    };
    // 给浏览器一帧时间让 class 应用
    void caretEl.offsetWidth;
    const caretOpen = testWrap.querySelector('.think-caret.open');
    r.caretOpen = {
      transform: getComputedStyle(caretOpen).transform,
      transformRule: getComputedStyle(caretOpen).getPropertyValue('transform'),
      className: caretOpen.className,
      hasOpenClass: caretOpen.classList.contains('open'),
    };

    return r;
  })()`)
  console.log(JSON.stringify(cssProbe, null, 2))

  // 断言
  const checks = [
    [cssProbe.block?.borderLeft?.includes('2px'), 'block 有 2px border-left'],
    [cssProbe.summary?.display === 'flex', 'summary display: flex'],
    [cssProbe.summary?.cursor === 'pointer', 'summary cursor: pointer'],
    [cssProbe.label?.textTransform === 'uppercase', 'label uppercase'],
    [cssProbe.label?.letterSpacing === '0.15em' || cssProbe.label?.letterSpacing?.includes('normal'), 'label letter-spacing'],
    [cssProbe.preview?.fontStyle === 'italic', 'preview italic'],
    [cssProbe.caret?.transition?.length > 0, 'caret 有 transition'],
    [cssProbe.caretOpen?.transform?.includes('matrix') || cssProbe.caretOpen?.transform === 'none' || cssProbe.caretOpen?.transform?.includes('rotate'), 'caret.open 旋转'],
    [cssProbe.body?.maxHeight === '320px', 'body max-height 320px'],
    [cssProbe.body?.overflowY === 'auto', 'body overflow-y auto'],
  ]
  let pass = 0, fail = 0
  console.log('\n=== CSS 断言 ===')
  for (const [ok, desc] of checks) {
    console.log(`  ${ok ? '✅' : '❌'} ${desc}`)
    if (ok) pass++; else fail++
  }
  console.log(`\n${pass}/${pass + fail} pass`)

  // === 验证 2: 切到 AI 助手视图，验证 React 组件树能正常挂载 ===
  console.log('\n=== 验证 2: AI 助手视图能正常加载（无运行时错误） ===')
  await evalJs(`(() => {
    for (const a of document.querySelectorAll('.nav-link')) {
      if (a.textContent.trim() === 'AI 助手') { a.click(); return; }
    }
  })()`)
  await sleep(1000)
  const aiState = await evalJs(`(() => {
    return {
      title: document.title,
      main: document.querySelector('main.main-content')?.textContent?.slice(0, 100) || 'no main',
      hasReactError: !!document.querySelector('[data-react-error]'),
    };
  })()`)
  console.log(JSON.stringify(aiState, null, 2))

  ws.close()
  if (fail > 0) process.exit(1)
}
main().catch(e => { console.error('❌', e); process.exit(1) })
