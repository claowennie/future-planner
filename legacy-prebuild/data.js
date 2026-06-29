// Seed data — first launch only. Uses date-keyed v2 schema.
window.SEED = (() => {
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const todayISO = iso(today);

  // Compute Monday-based week start
  const dayIdx = (today.getDay() + 6) % 7;
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - dayIdx); weekStart.setHours(0,0,0,0);
  const weekISO = (i) => iso(addDays(weekStart, i));
  const weekStartISO = iso(weekStart);

  // Pre-fill habits-completed grid: past days in current week up to today get most habits checked
  const habits = [
    { id: 'h1', name: '晨间冥想', emoji: '🌅' },
    { id: 'h2', name: '阅读 30 mins', emoji: '📖' },
    { id: 'h3', name: '运动 / 散步', emoji: '🏃' },
    { id: 'h4', name: '不刷短视频', emoji: '🌿' },
    { id: 'h5', name: '早睡（< 23:30）', emoji: '🌙' },
  ];
  const habitDays = {};
  const seedPattern = {
    h1: [1,1,1,1,0],
    h2: [1,1,0,1,1],
    h3: [1,0,1,1,0],
    h4: [1,1,1,0,1],
    h5: [0,1,1,1,1],
  };
  habits.forEach(h => {
    habitDays[h.id] = {};
    const p = seedPattern[h.id] || [1,1,1,1,1];
    for (let i = 0; i <= dayIdx && i < p.length; i++) {
      if (p[i]) habitDays[h.id][weekISO(i)] = 1;
    }
  });

  // Build todos per day in current week
  const todos = {};
  todos[todayISO] = [
    { id: 't1', text: '阅读《深度工作》ch.3 — 30 mins', tag: 'study', done: true },
    { id: 't2', text: '完成 LeetCode 每日一题（动态规划）', tag: 'study', done: true },
    { id: 't3', text: '副业：写一篇博客草稿 — 番茄钟 × 2', tag: 'side', done: false },
    { id: 't4', text: '复习昨天的法语 Anki 卡片', tag: 'study', done: false },
    { id: 't5', text: '7:30 PM 散步 30 mins', tag: 'health', done: false },
    { id: 't6', text: '给妈妈打个电话', tag: 'life', done: false },
  ];
  // Add some for other days of this week (only if not today)
  const otherWeek = {
    0: [{ text: '《深度工作》ch.3', tag: 'study', done: true }, { text: '晨跑 5km', tag: 'health', done: true }],
    1: [{ text: 'LeetCode DP × 2', tag: 'study', done: true }, { text: '博客草稿', tag: 'side', done: true }],
    2: [{ text: '法语口语课', tag: 'study', done: true }, { text: '阅读 ch.4', tag: 'study', done: false }],
    3: [{ text: '完成 LC 每日一题', tag: 'study', done: true }, { text: '博客草稿 × 2 番茄', tag: 'side', done: false }, { text: '散步 30 mins', tag: 'health', done: false }],
    4: [{ text: '完成博客并发布', tag: 'side', done: false }, { text: 'Anki 复习', tag: 'study', done: false }],
    5: [{ text: '周复盘 + 整理笔记', tag: 'study', done: false }, { text: '和朋友咖啡', tag: 'life', done: false }],
    6: [{ text: '下周计划 + 主题书选择', tag: 'study', done: false }],
  };
  for (let i = 0; i < 7; i++) {
    const k = weekISO(i);
    if (k === todayISO) continue;
    const items = otherWeek[i] || [];
    todos[k] = items.map((it, j) => ({ id: `s${i}-${j}`, ...it }));
  }

  return {
    name: '朋友',
    todos,
    habits,
    habitDays,
    gratitude: { [todayISO]: ['', '', '', '', ''] },
    reflection: {},
    pomoCount: { [todayISO]: 3 },
    pomoFocus: 25 * 60,
    pomoBreak: 5 * 60,
    pomoLong: 15 * 60,
    streakDays: 14,
    weekGoals: { [weekStartISO]: '完成《深度工作》前三章 + 上线博客 MVP' },
    monthThemes: {},
    archivedDates: {},
    okrs: [
      {
        id: 'o1', icon: 'a', initial: 'L',
        name: 'Learn deeply — 成为更扎实的人',
        aim: '从泛读转向精读，建立可调用的知识库',
        krs: [
          { name: '完成 12 本主题书的精读笔记', cur: 7, max: 12 },
          { name: '每周输出 1 篇结构化总结', cur: 32, max: 52 },
          { name: '法语 B1 通过', cur: 70, max: 100 },
        ],
      },
      {
        id: 'o2', icon: 'b', initial: 'S',
        name: 'Ship side projects — 把想法做出来',
        aim: '从「学」到「做」，每个季度发布一个小东西',
        krs: [
          { name: '上线个人博客 + 写满 24 篇', cur: 9, max: 24 },
          { name: '完成 1 个开源小工具', cur: 40, max: 100 },
          { name: '副业月入达到 ¥3000', cur: 1200, max: 3000 },
        ],
      },
      {
        id: 'o3', icon: 'c', initial: 'B',
        name: 'Be well — 身体与情绪',
        aim: '在努力的同时，照顾好自己',
        krs: [
          { name: '保持 5 个核心习惯（90% 达成率）', cur: 78, max: 90 },
          { name: '体检指标全部正常', cur: 0, max: 1 },
          { name: '每月 1 次离线休息日', cur: 4, max: 12 },
        ],
      },
      {
        id: 'o4', icon: 'd', initial: 'C',
        name: 'Connect — 与人，与世界',
        aim: '走出书房，去和真实的人聊天',
        krs: [
          { name: '每月 2 次有质量的深聊', cur: 9, max: 24 },
          { name: '加入 1 个学习社群并贡献', cur: 60, max: 100 },
        ],
      },
    ],
    notes: [
      { id: 'n1', tag: 'IDEA', body: '把每周复盘做成一个 newsletter，邀请 5 个朋友互相督促。', color: 'cool', date: '5天前' },
      { id: 'n2', tag: 'QUOTE', body: '"知识的反义词不是无知，是傲慢。" — 听到的一句话，要记住。', color: 'warm', date: '昨天' },
      { id: 'n3', tag: 'LEARN', body: 'Spaced repetition 的最佳间隔: 1天 → 3天 → 7天 → 14天 → 30天。\n配合主动回忆效果最好。', color: '', date: '3天前' },
      { id: 'n4', tag: 'TODO', body: '调研一下 Notion AI / Obsidian + Anki 的组合工作流。下周决定迁移方案。', color: 'fresh', date: '今天' },
      { id: 'n5', tag: 'REFLECT', body: '我容易在「准备阶段」停留太久。下次直接开始，边做边调整。', color: '', date: '上周' },
      { id: 'n6', tag: 'BOOK', body: '《Deep Work》Cal Newport — 第三章 deliberate practice 的部分要重读。', color: 'cool', date: '4天前' },
    ],
    journal: [
      {
        date: addDays(today, -1),
        good: [
          '坚持完成了番茄钟 4 个，今天的代码很专注',
          '主动给爸打了电话，他听上去很开心',
          '终于把拖了三天的博客草稿写完了开头',
          '中午吃了一顿喜欢的饭，认真吃',
          '收到朋友的一条暖心消息',
        ],
        reflection: '今天发现自己一旦开始，其实并不难。难的是开始之前那十分钟的心理拉扯。明天试试两分钟法则：告诉自己只做两分钟，往往就停不下来。',
        pomo: 4,
      },
      {
        date: addDays(today, -2),
        good: [
          '完成了一节法语 listening，听懂了 80%',
          '中午没刷手机，去公园散步了',
          '帮同事 review 了一个 PR，被夸了',
          '认真做了晚饭',
          '早睡了',
        ],
        reflection: '不要小看每一个 "完成" 的瞬间。它们是构成自我认同的砖块。',
        pomo: 3,
      },
      {
        date: addDays(today, -3),
        good: [
          '晨间冥想 10 分钟，整天都比较平静',
          '读完了一章《深度工作》',
          '早睡了，明天会很有精神',
          '认真和家人吃了顿饭',
          '晚上看了一集喜欢的剧',
        ],
        reflection: '休息不是奖励，是工作的一部分。今天让自己 8 点就关电脑了，没有任何负罪感。',
        pomo: 2,
      },
    ],
  };
})();
