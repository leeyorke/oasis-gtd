/**
 * 验证 Settings → AI Providers 列表只显示名称（不显示 model / base_url）
 */
const TARGET = 'ws://127.0.0.1:9222/devtools/page/1DFFE962F1C1B770C7058D038F257FA4'

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
  await cdp.send('Page.enable')
  const evalJs = cdp.evalJs.bind(cdp)
  const sleep = cdp.sleep.bind(cdp)

  await cdp.send('Page.reload', { ignoreCache: true })
  await sleep(2500)

  // 列出所有 nav-link 找 Settings 实际名
  const sidebarItems = await evalJs(`(() => {
    return [...document.querySelectorAll('.nav-link')].map(a => {
      const textSpan = a.querySelector('.nav-link-text');
      return { text: (textSpan?.textContent || a.textContent).trim(), innerHTML: a.innerHTML.slice(0, 100) };
    });
  })()`)
  console.log('Sidebar nav-link 详情:')
  console.log(JSON.stringify(sidebarItems, null, 2))

  // 列出 sidebar 里所有 a / button
  const sidebarAll = await evalJs(`(() => {
    const aside = document.querySelector('aside, [class*="sidebar"]');
    if (!aside) return { error: 'no aside' };
    return [...aside.querySelectorAll('a, button')].map(el => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 30), cls: el.className.slice(0, 30) })).slice(0, 30);
  })()`)
  console.log('Sidebar 全部元素:', JSON.stringify(sidebarAll, null, 2))

  // 切到 Settings（sidebar 第 14 个 nav-link = BOTTOM_ITEMS[0] = settings）
  const navRes = await evalJs(`(() => {
    const links = document.querySelectorAll('.nav-link');
    // BOTTOM_ITEMS 第 1 个 = settings，是数组里最后一个
    const settingsLink = links[links.length - 1];
    if (settingsLink) {
      settingsLink.click();
      return { clicked: true, text: settingsLink.textContent.trim(), html: settingsLink.innerHTML.slice(0, 200) };
    }
    return { clicked: false };
  })()`)
  console.log('Settings 导航结果:', JSON.stringify(navRes))
  await sleep(1000)

  // 看 Settings 页面结构
  const settingsStructure = await evalJs(`(() => {
    const body = document.body.innerText;
    const titles = [...document.querySelectorAll('h1, h2, h3, h4, [class*="section-title"], [class*="SectionTitle"]')].map(t => t.textContent.trim()).filter(Boolean);
    // 找所有可点击的 section 入口
    const subnavs = [...document.querySelectorAll('button, a, [class*="card"], [class*="section-card"]')].map(s => s.textContent.trim().slice(0, 30)).filter(t => t && t.length < 30);
    return { body: body.slice(0, 300), titles, subnavs: [...new Set(subnavs)].slice(0, 20) };
  })()`)
  console.log('Settings 页面结构:', JSON.stringify(settingsStructure, null, 2))

  // 切到 AI Providers section（subnav card "AI 提供商配置 LLM 端点"）
  const secRes = await evalJs(`(() => {
    for (const el of document.querySelectorAll('button, a, [class*="card"], [class*="section-card"]')) {
      const t = el.textContent.trim();
      if (t.startsWith('AI 提供商') || t.startsWith('AI Providers')) { el.click(); return { clicked: true, text: t.slice(0, 40) }; }
    }
    return { clicked: false };
  })()`)
  console.log('AI Providers section 进入结果:', JSON.stringify(secRes))
  await sleep(1000)

  // 抓 provider 列表
  console.log('=== Settings → AI Providers 列表 ===')
  const probe = await evalJs(`(() => {
    // SectionTitle 是普通 div，特征：fontFamily var(--font-display) + fontSize 2rem
    // 但更简单：找所有含 Edit/Pencil 按钮（这些就是 provider 卡片）
    // provider 卡片结构 = flex row, 包含 名称 + (旧版) model · base_url
    // 用 Edit 按钮的祖父级 (向上 2-3 层) 找卡片

    const editButtons = [...document.querySelectorAll('button[title*="Edit"], button[title*="编辑"], button[title*="Remove"], button[title*="删除"]')];
    const rows = [];
    const seen = new Set();
    for (const btn of editButtons) {
      // 向上找 5 层
      let el = btn;
      for (let i = 0; i < 6; i++) {
        if (el.parentElement) el = el.parentElement;
        else break;
      }
      // 找含 Edit 按钮且有 flex 的祖先
      let card = btn;
      while (card && !(card.style && card.style.display === 'flex' && card.style.justifyContent === 'space-between')) {
        card = card.parentElement;
      }
      if (!card) continue;
      const text = card.textContent.replace(/\\s+/g, ' ').trim();
      if (seen.has(text)) continue;
      seen.add(text);
      // 也看子结构
      const children = [...card.children].map(c => c.textContent.trim().replace(/\\s+/g, ' '));
      rows.push({ text: text.slice(0, 100), children });
    }
    return { rowCount: rows.length, rows };
  })()`)
  console.log(JSON.stringify(probe, null, 2))


  // 准备测试数据：先看 store 有没有 provider
  const beforeCount = await evalJs(`(() => {
    // 找含 Edit/Pencil 按钮的 provider 卡片
    const editButtons = [...document.querySelectorAll('button[title*="Edit"], button[title*="编辑"]')];
    return editButtons.length;
  })()`)
  console.log('当前 AI Providers 列表 provider 数量:', beforeCount)

  if (beforeCount === 0) {
    console.log('\n没有 provider，先添加一个用于测试')
    // 找 "Add" 按钮或 "添加" 按钮
    const addRes = await evalJs(`(() => {
      for (const b of document.querySelectorAll('button')) {
        const t = b.textContent.trim();
        if (/^(Add|添加|添加提供商|添加 AI)/i.test(t)) { b.click(); return { clicked: true, text: t }; }
      }
      return { clicked: false, allButtons: [...document.querySelectorAll('button')].map(b => b.textContent.trim().slice(0, 30)).filter(t => t).slice(-20) };
    })()`)
    console.log('点 Add 按钮结果:', JSON.stringify(addRes))
    await sleep(800)
    // 在表单里填一个 provider
    const fillRes = await evalJs(`(() => {
      // 找表单里所有 input/select
      const inputs = [...document.querySelectorAll('.modal-sheet input, .modal-sheet textarea, [class*="provider"] input, form input')];
      return { inputCount: inputs.length, types: inputs.map(i => ({ tag: i.tagName, type: i.type, name: i.name, placeholder: i.placeholder?.slice(0, 30) })) };
    })()`)
    console.log('表单 inputs:', JSON.stringify(fillRes, null, 2))
  }

  await sleep(500)

  // === 验证 1: 列表中不应出现任何 URL（base_url 是 http:// 开头）===
  console.log('\n=== 验证 1: 列表文本不应含 URL ===')
  const hasUrl = probe.rows.some(r => /https?:\/\//i.test(r.text))
  console.log('含 URL:', hasUrl ? '❌ FAIL' : '✅ PASS')

  // === 验证 2: 列表文本不应出现 model 字段 ===
  // model 一般是 gpt-4o, claude-..., llama3, ... 这些关键词
  const modelKeywords = ['gpt-', 'claude-', 'llama', 'mistral', 'qwen', 'gemini', 'gemma']
  const hasModel = probe.rows.some(r => modelKeywords.some(k => r.text.toLowerCase().includes(k)))
  console.log('含 model 关键词:', hasModel ? '⚠️ CHECK（可能是 provider 名称中带模型名）' : '✅ PASS')

  // === 验证 3: 抓第一个 provider 卡片的完整 HTML 看结构 ===
  console.log('\n=== 验证 3: 第一个 provider 卡片 HTML 结构 ===')
  const firstCardHtml = await evalJs(`(() => {
    const editButtons = [...document.querySelectorAll('button[title*="Edit"], button[title*="编辑"]')];
    if (editButtons.length === 0) return null;
    // 找包含 "·" 字符的最近祖先（兼容老结构），或直接找 provider 卡片
    // 更稳：找包含 setActive/Edit/Remove 按钮组的容器
    const btn = editButtons[0];
    let card = btn.parentElement;
    while (card && card.children.length < 2) card = card.parentElement;
    return card ? card.outerHTML.slice(0, 800) : null;
  })()`)
  console.log(firstCardHtml)

  ws.close()
  console.log('\n✅ 验证完成')
}
main().catch(e => { console.error('❌', e); process.exit(1) })
