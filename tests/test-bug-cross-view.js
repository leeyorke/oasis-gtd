/**
 * 复现 + 验证 bug 修复：在 NextActions 勾选 → Projects 详情视图是否同步
 *
 * 步骤：
 *   1. 确认 store 里有 1 个属于某项目的 next 任务
 *   2. 在 NextActions 视图勾选它
 *   3. 切到 Projects 详情，看是否同步成 done
 *   4. 反向：在 Projects 勾选另一条，再看 NextActions 是否同步
 */
const TARGET = 'ws://127.0.0.1:9222/devtools/page/94DA3BB7A40F3994D1DABFAA479BCF08'

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
    if (r.exceptionDetails) {
      const text = r.exceptionDetails.exception?.description || r.exceptionDetails.text
      // 业务层 throw 也算 (不再静默)，把 description 作为返回值上抛
      throw new Error('evalJs threw: ' + text)
    }
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

  // 重载页面以确保拿到最新代码
  console.log('重载页面（确保拿到修复后代码）...')
  await cdp.send('Page.reload', { ignoreCache: true })
  await sleep(2000)

  // ========== Phase 0: 准备测试数据 ==========
  console.log('\n=== Phase 0: 准备测试数据 ===')
  const setup = await evalJs(`(async () => {
    // 直接走 store: 创建 1 个项目 + 2 个属于它的 next 任务
    const store = window.__store_for_test || null;
    if (!store) return { error: 'store not on window' };
    return { ok: true, hasStore: true };
  })()`)
  console.log('store 检测:', JSON.stringify(setup))

  // 用 UI 路径：先在 Projects 视图建项目 + 加任务
  // 切到 Projects
  await evalJs(`(() => {
    for (const el of document.querySelectorAll('button, a, [class*="nav"]')) {
      if (el.textContent.trim() === '项目' || el.textContent.trim() === 'Projects') { el.click(); return }
    }
  })()`)
  await sleep(600)

  // 看现有项目列表，挑一个用
  const existing = await evalJs(`(() => {
    return [...document.querySelectorAll('.project-card')].map(c => c.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80));
  })()`)
  console.log('现有项目列表:', JSON.stringify(existing))
  let projectName = null
  if (existing.length > 0) {
    // 挑第一个看起来合适的
    projectName = existing[0]
    console.log('复用现有项目:', projectName)
  } else {
    console.log('❌ 没有项目可测试，需要先手工创建一个')
    ws.close(); return
  }

  // 进第一个项目详情
  await evalJs(`(() => { const c = document.querySelector('.project-card'); if (c) c.click() })()`)
  await sleep(800)

  // 看看项目详情里有什么
  const detail = await evalJs(`(() => {
    const body = document.body.innerText;
    const taskCards = [...document.querySelectorAll('.task-card')].map(c => c.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80));
    const sections = [...document.querySelectorAll('h2, h3, h4, [class*="section-title"], [class*="section"]')].map(s => s.textContent.trim());
    return { body: body.slice(0, 400), taskCards, sections };
  })()`)
  console.log('项目详情视图:', JSON.stringify(detail, null, 2))

  // 进详情
  await evalJs(`(() => {
    const cards = document.querySelectorAll('.project-card');
    // 找刚建的（最后一个）
    const c = cards[cards.length - 1];
    if (c) c.click();
  })()`)
  await sleep(600)

  // 加 2 个任务
  for (let i = 1; i <= 2; i++) {
    await evalJs(`(() => { const f = document.querySelector('.fab-button'); if (f) f.click() })()`)
    await sleep(400)
    const title = `任务 ${i} (${projectName})`
    await evalJs(`(() => {
      const sheet = document.querySelector('.modal-sheet');
      const input = sheet.querySelector('input.form-input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(title)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    })()`)
    await sleep(700)
  }

  // 抓项目内所有的"待完成"任务标题（直接从项目 detail 视图 body 文本抽）
  const taskList = await evalJs(`(() => {
    const body = document.body.innerText;
    // 在 "待完成" 和 "已完成" 之间切分
    const todoPart = body.split('待完成')[1]?.split('已完成')[0] || '';
    return todoPart.split('\\n').map(s => s.trim()).filter(s => s && !/^\\d+$/.test(s));
  })()`)
  console.log('项目内待完成任务:', JSON.stringify(taskList))

  if (taskList.length < 2) {
    console.log('❌ 准备数据失败，taskList:', taskList)
    ws.close(); return
  }

  // ========== Phase 1: 在 NextActions 勾选任务 A ==========
  console.log('\n=== Phase 1: 切到 NextActions，勾选第 1 个任务 ===')
  await evalJs(`(() => {
    for (const el of document.querySelectorAll('button, a, [class*="nav"]')) {
      if (el.textContent.trim() === '下一步行动' || el.textContent.trim() === 'Next Actions') { el.click(); return }
    }
  })()`)
  await sleep(700)

  const beforeNext = await evalJs(`(() => {
    const body = document.body.innerText;
    return body.split('\\n').map(s => s.trim()).filter(s => s && (s.startsWith('任务 ') || s.startsWith('CDP ') || s.startsWith('测试')));
  })()`)
  console.log('NextActions 中可见任务:', JSON.stringify(beforeNext))

  // 勾选第 1 个任务
  const targetTitle = beforeNext[0]
  console.log('勾选:', targetTitle)
  const clickResult = await evalJs(`(() => {
    for (const card of document.querySelectorAll('.task-card, [class*="task"]')) {
      const t = card.querySelector('.task-title, [class*="title"]')?.textContent?.trim();
      if (t === ${JSON.stringify(targetTitle)}) {
        const cb = card.querySelector('.task-checkbox, [class*="checkbox"]');
        if (cb) { cb.click(); return { clicked: true, via: cb.className, title: t }; }
        return { clicked: false, cardHTML: card.outerHTML.slice(0, 200) };
      }
    }
    return { clicked: false, total: document.querySelectorAll('[class*="task"]').length };
  })()`)
  console.log('勾选结果:', JSON.stringify(clickResult))
  await sleep(1500)

  // 检查 NextActions 里这条任务应该消失（因为 status 变 done）
  const afterNext = await evalJs(`(() => {
    const body = document.body.innerText;
    return body.split('\\n').map(s => s.trim()).filter(s => s && (s.startsWith('任务 ') || s.startsWith('CDP ') || s.startsWith('测试')));
  })()`)
  console.log('勾选后 NextActions 可见:', JSON.stringify(afterNext))
  const removedFromNext = !afterNext.includes(targetTitle)
  console.log('断言 A (NextActions 移除已勾选):', removedFromNext ? '✅ PASS' : '❌ FAIL')

  // ========== Phase 2: 切到 Projects 详情，检查是否同步 ==========
  console.log('\n=== Phase 2: 切到 Projects 详情，验证同步 ===')
  await evalJs(`(() => {
    for (const el of document.querySelectorAll('button, a, [class*="nav"]')) {
      if (el.textContent.trim() === '项目' || el.textContent.trim() === 'Projects') { el.click(); return }
    }
  })()`)
  await sleep(700)
  await evalJs(`(() => {
    const cards = document.querySelectorAll('.project-card');
    for (const c of cards) {
      if (c.textContent.includes(${JSON.stringify(projectName)})) { c.click(); return }
    }
  })()`)
  await sleep(800)

  const projectView = await evalJs(`(() => {
    const body = document.body.innerText;
    // 切分 "待完成" 和 "已完成" 段
    const todoPart = (body.split('待完成')[1] || '').split('已完成')[0] || '';
    const donePart = (body.split('已完成')[1] || '').split('返回项目列表')[0] || '';
    const extractTitles = (s) => s.split('\\n').map(t => t.trim()).filter(t => t && !/^\\d+$/.test(t) && t.length > 1);
    return {
      todoTitles: extractTitles(todoPart),
      doneTitles: extractTitles(donePart),
    };
  })()`)
  console.log('项目详情待完成:', JSON.stringify(projectView.todoTitles))
  console.log('项目详情已完成:', JSON.stringify(projectView.doneTitles))

  const targetInDone = projectView.doneTitles.includes(targetTitle)
  const targetNotInTodo = !projectView.todoTitles.includes(targetTitle)
  console.log('断言 B1 (Projects 详情中已勾选任务在"已完成"区):', targetInDone ? '✅ PASS' : '❌ FAIL')
  console.log('断言 B2 (Projects 详情中已勾选任务不在"待完成"区):', targetNotInTodo ? '✅ PASS' : '❌ FAIL')

  // 检查 store 内 task 状态
  const storeState = await evalJs(`(() => {
    // 通过查找已渲染的 task-card 的 class 来推断
    const cards = [...document.querySelectorAll('.task-card, [class*="task"]')];
    const items = [];
    for (const c of cards) {
      const t = c.querySelector('.task-title, [class*="title"]')?.textContent?.trim();
      if (t && t.includes('Bug 复现项目')) {
        const checked = c.querySelector('.task-checkbox.checked, [class*="checkbox"][class*="checked"]') !== null;
        const classes = c.className;
        items.push({ title: t, checked, classes });
      }
    }
    return items;
  })()`)
  console.log('store 内任务渲染状态:', JSON.stringify(storeState, null, 2))

  // ========== Phase 3: 反向测试 — 在 Projects 勾选另一条，再看 NextActions ==========
  console.log('\n=== Phase 3: 反向 - 在 Projects 勾选剩余任务 ===')
  const remaining = afterNext[0]  // NextActions 里剩下的那一条
  if (remaining) {
    console.log('在 Projects 勾选:', remaining)
    const result = await evalJs(`(() => {
      for (const card of document.querySelectorAll('.task-card')) {
        const t = card.querySelector('.task-title')?.textContent?.trim();
        if (t === ${JSON.stringify(remaining)}) {
          // 找 checkbox 元素
          const cb = card.querySelector('input[type="checkbox"], .task-checkbox, [class*="check"]');
          if (cb) {
            cb.click();
            return { clicked: true, via: cb.className || cb.tagName, title: t };
          }
          // 没有专门 checkbox，可能需要不同的点击区域
          return { clicked: false, cardHTML: card.outerHTML.slice(0, 300) };
        }
      }
      return { clicked: false };
    })()`)
    console.log('反向勾选结果:', JSON.stringify(result))

    // 如果没点中，尝试找 .task-item 里的 checkbox（Projects 用 task-item）
    if (!result.clicked) {
      const retry = await evalJs(`(() => {
        for (const item of document.querySelectorAll('.task-item, [class*="task-item"]')) {
          const t = item.querySelector('.task-title, [class*="title"]')?.textContent?.trim();
          if (t === ${JSON.stringify(remaining)}) {
            const cb = item.querySelector('.task-checkbox, [class*="checkbox"]');
            if (cb) { cb.click(); return { clicked: true, via: 'task-item' }; }
          }
        }
        return { clicked: false, itemsCount: document.querySelectorAll('.task-item').length };
      })()`)
      console.log('重试 (task-item):', JSON.stringify(retry))
      await sleep(1500)
    }
    await sleep(1200)

    // 切回 NextActions 看是否移除
    await evalJs(`(() => {
      for (const el of document.querySelectorAll('button, a, [class*="nav"]')) {
        if (el.textContent.trim() === '下一步行动' || el.textContent.trim() === 'Next Actions') { el.click(); return }
      }
    })()`)
    await sleep(700)
    const finalNext = await evalJs(`(() => {
      const body = document.body.innerText;
      return body.split('\\n').map(s => s.trim()).filter(s => s && (s.startsWith('任务 ') || s.startsWith('CDP ') || s.startsWith('测试')));
    })()`)
    console.log('反向勾选后 NextActions 可见:', JSON.stringify(finalNext))
    const reverseSync = !finalNext.includes(remaining)
    console.log('断言 C (Projects → NextActions 反向同步):', reverseSync ? '✅ PASS' : '❌ FAIL')
  }

  ws.close()
  console.log('\n✅ 测试完成')
}
main().catch(e => { console.error('❌', e); process.exit(1) })
