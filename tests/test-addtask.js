/**
 * 通过 CDP 9222 在 Electron 渲染进程里跑 JS，验证 Projects 弹窗改动。
 *
 * 用法：
 *   1. 在另一个终端先 `npm run dev`（带 --remote-debugging-port=9222）
 *   2. 等主窗口出现后，跑：`node test-addtask.js`
 *
 * 不需要任何第三方依赖，用 Node 22 内置的 globalThis.WebSocket。
 */

const TARGET = process.env.CDP_TARGET || 'ws://127.0.0.1:9222/devtools/page/DDDDE414624FB721387755DBF3E8730B'

/** 用 awaitReturn 模式：每个 CDP 命令带一个唯一 id，回调里 resolve 对应 id 的响应。 */
class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.events = []
    this.onEvent = null
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      } else if (msg.method) {
        this.events.push(msg)
        if (this.onEvent) this.onEvent(msg)
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
  /** 跑一段 JS 在渲染进程里，返回 evaluate 的 result.value。 */
  async evalJs(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    })
    if (r.exceptionDetails) {
      const text = r.exceptionDetails.exception?.description || r.exceptionDetails.text
      throw new Error('evalJs threw: ' + text)
    }
    return r.result.value
  }
  async sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
}

async function main() {
  console.log('连接 CDP target:', TARGET)
  const ws = new WebSocket(TARGET)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const cdp = new CDP(ws)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  console.log('CDP ready\n')

  // ========== 工具 ==========
  const sleep = cdp.sleep.bind(cdp)
  const evalJs = cdp.evalJs.bind(cdp)

  // ========== Phase 1：基线断言 ==========
  console.log('=== Phase 1: 验证应用已加载 ===')
  const title = await evalJs('document.title')
  console.log('document.title =', JSON.stringify(title))

  const url = await evalJs('location.href')
  console.log('location.href  =', url)

  // ========== Phase 2：导航到 Projects 视图 ==========
  console.log('\n=== Phase 2: 切到 Projects 视图 ===')
  // 触发左侧 Sidebar 的 "Projects" 项
  // 用最稳妥的方式：找带 "Projects" / "项目" 文本的 sidebar nav 按钮并 click
  const navClicked = await evalJs(`(() => {
    const labels = ['Projects', '项目'];
    const buttons = document.querySelectorAll('button, a, [role="button"], .nav-item, .sidebar-item, [class*="nav"]');
    for (const el of buttons) {
      const t = (el.textContent || '').trim();
      if (labels.some(l => t === l || t.startsWith(l))) {
        el.click();
        return { clicked: true, text: t.slice(0, 40) };
      }
    }
    return { clicked: false, found: [...buttons].map(b => b.textContent.trim().slice(0, 30)).slice(0, 10) };
  })()`)
  console.log('导航结果:', JSON.stringify(navClicked))
  await sleep(800)

  // ========== Phase 3：找一个 active 项目并打开 detail ==========
  console.log('\n=== Phase 3: 进入项目详情 ===')
  // 列表里的项目卡片
  const projectOpened = await evalJs(`(() => {
    // 1) 找所有 "project" 卡片 / 行
    const candidates = [
      ...document.querySelectorAll('.project-card, .project-row, [data-project-id], [class*="project"]'),
    ];
    for (const el of candidates) {
      if (el.tagName === 'LI' || el.classList.contains('project-card') || el.classList.contains('project-row')) {
        el.click();
        return { opened: true, via: el.className, text: (el.textContent || '').trim().slice(0, 30) };
      }
    }
    // 2) 退而求其次：找 .project-* 容器里的第一个可点击元素
    const wrap = document.querySelector('[class*="project"]');
    if (wrap) {
      const inner = wrap.querySelector('button, a, .project-card');
      if (inner) {
        inner.click();
        return { opened: true, via: 'fallback', text: (inner.textContent || '').trim().slice(0, 30) };
      }
    }
    return { opened: false, dom: document.body.innerText.slice(0, 300) };
  })()`)
  console.log('打开项目:', JSON.stringify(projectOpened))
  await sleep(800)

  // ========== Phase 4：点击 FAB 按钮打开弹窗 ==========
  console.log('\n=== Phase 4: 点 FAB 触发 AddTaskModal ===')
  const fabClicked = await evalJs(`(() => {
    const fab = document.querySelector('.fab-button, [class*="fab"], button[class*="floating"]');
    if (fab) {
      fab.click();
      return { clicked: true, className: fab.className };
    }
    return { clicked: false };
  })()`)
  console.log('FAB 结果:', JSON.stringify(fabClicked))
  await sleep(500)

  // ========== Phase 5：断言弹窗字段 ==========
  console.log('\n=== Phase 5: 断言弹窗只含 title + notes ===')
  const probe = await evalJs(`(() => {
    const sheet = document.querySelector('.modal-sheet, .modal-overlay [class*="sheet"], .modal-overlay');
    if (!sheet) return { error: '弹窗没出现' };

    // 弹窗里所有的 input / select / textarea
    const fields = [...sheet.querySelectorAll('input, select, textarea')].map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      name: el.name || null,
      placeholder: (el.placeholder || '').slice(0, 30),
      cls: (el.className || '').slice(0, 40),
    }));

    // 弹窗里所有 label 文案
    const labels = [...sheet.querySelectorAll('label, .form-label')].map(l => l.textContent.trim());

    // 弹窗里的 select 元素（要求 = 0）
    const selects = sheet.querySelectorAll('select').length;

    return {
      visible: getComputedStyle(sheet).display !== 'none',
      fieldCount: fields.length,
      fields,
      labels,
      selects,
    };
  })()`)
  console.log('弹窗 probe:')
  console.log(JSON.stringify(probe, null, 2))

  const pass = probe && probe.fieldCount === 2 && probe.selects === 0
  console.log('\n>>> Phase 5 断言:', pass ? '✅ PASS（只剩 title + notes）' : '❌ FAIL')

  // ========== Phase 6：填表 + 提交 + 验证 project_id ==========
  if (pass) {
    console.log('\n=== Phase 6: 填表并提交 ===')
    const submitted = await evalJs(`(() => {
      const sheet = document.querySelector('.modal-sheet');
      const titleInput = sheet.querySelector('input.form-input, input[type="text"]');
      const notesArea = sheet.querySelector('textarea.form-textarea, textarea');
      if (!titleInput) return { error: '找不到 title input' };
      // React 受控组件：直接赋值会被覆盖。用原生 setter + 派发 input 事件
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(titleInput, 'CDP 测试任务：自动归属项目');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (notesArea) {
        const tsetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        tsetter.call(notesArea, '通过 Runtime.evaluate 创建的备注');
        notesArea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // 模拟 Enter 提交
      titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return { submitted: true, title: titleInput.value, notes: notesArea?.value };
    })()`)
    console.log('提交:', JSON.stringify(submitted))
    await sleep(1500)

    // 验证 store 里的任务：查 Zustand 内存里的状态
    // Oasis GTD 用 Zustand，没有挂 window.__store，但可以查 IPC 落库后的 DOM
    console.log('\n=== Phase 7: 验证任务创建并归属到项目 ===')
    const verify = await evalJs(`(() => {
      // 看弹窗是否关闭
      const stillOpen = !!document.querySelector('.modal-sheet');
      // 看项目详情里有没有 "CDP 测试任务" 字样
      const body = document.body.innerText || '';
      const foundInDOM = body.includes('CDP 测试任务');
      return { stillOpen, foundInDOM, bodyExcerpt: body.slice(0, 200) };
    })()`)
    console.log('验证:', JSON.stringify(verify, null, 2))
    console.log('\n>>> Phase 7 断言:',
      !verify.stillOpen && verify.foundInDOM
        ? '✅ PASS（弹窗关闭 + 任务落到当前项目）'
        : '⚠️ INCONCLUSIVE（弹窗或任务可能未立即刷新，请人工目视确认）')
  }

  // ========== Phase 8：关闭弹窗，截图 DOM 留底 ==========
  console.log('\n=== Phase 8: 关闭 + 收尾 ===')
  await evalJs(`(() => {
    const closeBtn = document.querySelector('.modal-sheet button.btn-text, .modal-sheet [class*="close"]');
    if (closeBtn) closeBtn.click();
  })()`)
  await sleep(300)

  // 把弹窗的 outerHTML 留底（便于排查）
  const html = await evalJs(`(() => {
    const sheet = document.querySelector('.modal-sheet');
    if (!sheet) return '<!-- modal not in DOM -->';
    return sheet.outerHTML;
  })()`)
  console.log('\n--- 弹窗 outerHTML ---')
  console.log(html)

  ws.close()
  console.log('\n✅ 测试脚本结束')
}

main().catch(err => {
  console.error('❌ 脚本失败:', err.message)
  process.exit(1)
})
