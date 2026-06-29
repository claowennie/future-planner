// ===== Shared ‹ 上一段 / 回到现在 / 下一段 › navigation for week/month/year =====
function PeriodNav({ offset, setOffset, prevTitle, nextTitle, resetLabel, nextDisabled }) {
  return (
    <div className="period-nav">
      <button className="period-btn" onClick={() => setOffset(offset - 1)} title={prevTitle}>‹</button>
      {offset !== 0 && (
        <button className="period-btn period-reset" onClick={() => setOffset(0)}>{resetLabel}</button>
      )}
      <button className="period-btn" onClick={() => setOffset(offset + 1)} title={nextTitle}
        disabled={!!nextDisabled} style={nextDisabled ? { opacity: 0.3, cursor: 'default' } : undefined}>›</button>
    </div>
  );
}

// Week view — 7-day kanban with date-keyed todos.
// offset 翻周：todos 本来就按日期键控，翻到哪一周都照常可看可改（替代原「历史」页）。
function WeekView() {
  const store = useStore();
  const [offset, setOffset] = _us(0); // 0 = 本周，-1 = 上周，+1 = 下周…
  const now = new Date();
  const isCurrent = offset === 0;
  const wStart = startOfWeek(new Date(now.getTime() + offset * 7 * 86400000));
  const todayIdx = getMonIndex(now);
  // 主题槽位按「该日期落在月份的第几周」存，本周沿用 now 保持原行为，翻页时用那周的周一
  const themeDate = isCurrent ? now : wStart;

  return (
    <div className="main-inner">
      <div className="hero">
        <div>
          <div className="greeting">
            {isCurrent
              ? <>本周 · <span className="accent serif">This Week</span></>
              : <><span className="accent serif">{fmtMD(wStart)}</span> 那一周{offset > 0 ? ' · 未来' : ''}</>}
          </div>
          <div className="greeting-sub">
            {fmtMD(wStart)} – {fmtMD(new Date(wStart.getTime() + 6*86400000))} · {
              isCurrent ? '把大目标拆成每天可以完成的小事'
              : offset < 0 ? '走过的一周都留在这里，也可以随时补记'
              : '提前为未来的一周做点安排'}
          </div>
        </div>
        <PeriodNav offset={offset} setOffset={setOffset}
          prevTitle="上一周" nextTitle="下一周" resetLabel="回到本周" />
      </div>

      <div className="week-goal">
        <div>
          <div className="week-goal-label">{isCurrent ? '本周主题 · Theme' : '那周主题 · Theme'}</div>
        </div>
        <input
          className="week-goal-text serif"
          value={store.getWeekTheme(themeDate)}
          onChange={(e) => store.setWeekTheme(themeDate, e.target.value)}
          placeholder={isCurrent ? '给这一周一个名字…' : '给那一周一个名字…'}
        />
      </div>

      <div className="week-grid">
        {WEEKDAY_CN.map((wd, i) => {
          const day = new Date(wStart.getTime() + i * 86400000);
          const iso = toISO(day);
          const list = store.getTodos(iso);
          const done = list.filter(t => t.done).length;
          return (
            <div className={`week-day ${isCurrent && i === todayIdx ? 'today' : ''}`} key={i}>
              <div className="week-day-head">
                <div>
                  <div className="week-day-name">周{wd}</div>
                  <div className="week-day-num">{day.getDate()}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{list.length ? `${done}/${list.length}` : ''}</div>
              </div>
              <div className="todo-list" style={{ flex: 1 }}>
                <TodoRows iso={iso} compact />
              </div>
              <TodoAdd
                onAdd={(text) => store.addTodo(iso, { id: uid(), text, tag: 'study', done: false })}
                placeholder="+"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Day todo modal — centered popup showing one day's full todolist =====
// Month cells can only show a couple of todos; clicking a day opens this so the
// whole list is visible (and editable — same state.todos[iso] as every view).
function DayTodosModal({ iso, onClose }) {
  const store = useStore();
  _ue(() => {
    if (!iso) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [iso]);
  if (!iso) return null;
  const d = fromISO(iso);
  const list = store.getTodos(iso);
  const done = list.filter(t => t.done).length;
  const isToday = iso === todayISO();
  return ReactDOM.createPortal((
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auth-modal day-todo-modal">
        <button className="auth-close" onClick={onClose}>×</button>
        <div className="auth-head">
          <div className="auth-title serif">
            {d.getMonth() + 1}月{d.getDate()}日
            <span className="day-modal-weekday"> · 周{WEEKDAY_CN[getMonIndex(d)]}{isToday ? ' · 今天' : ''}</span>
          </div>
          <div className="auth-sub">{list.length ? `${done}/${list.length} 已完成` : '这一天还没有安排，写点什么？'}</div>
        </div>
        <div className="todo-list day-modal-list">
          <TodoRows iso={iso} />
          <TodoAdd
            onAdd={(text) => store.addTodo(iso, { id: uid(), text, tag: 'study', done: false })}
            placeholder="加一件这天要做的事…  ↵"
          />
        </div>
      </div>
    </div>
  ), document.body);
}

// ===== Month view =====
// offset 翻月：日历格子/分主题/日待办弹窗全都按所看月份取数，翻到过去任何一个月
// 都能看到当时的记录（替代原「历史」页的按月浏览）。
function MonthView() {
  const store = useStore();
  const { state } = store;
  const [openIso, setOpenIso] = _us(null);
  const [offset, setOffset] = _us(0); // 0 = 本月，-1 = 上月，+1 = 下月…
  const now = new Date();
  const isCurrent = offset === 0;
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const todayDate = now.getDate();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const leadingBlanks = getMonIndex(firstOfMonth);

  // 翻看的月份给一行足迹小结（数据来自 computeMonthStats，原历史页同款）
  const monthStats = !isCurrent ? window.computeMonthStats(state, firstOfMonth) : null;

  // 本月分主题：按「年-月」键控存储 —— 一到新月份自动变空白（无需手动清），用户逐周自填；
  // 当月只显示「已到达的周」：没到第 2/3/4 周就不显示对应主题；翻看其他月份时四周全显示。
  const WEEKS = 4;
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const currentWeek = isCurrent ? Math.min(WEEKS, Math.ceil(todayDate / 7)) : WEEKS;
  const blankThemes = () => Array.from({ length: WEEKS }, () => ({ title: '', progress: 0 }));
  const themesMap = (state.monthThemes && !Array.isArray(state.monthThemes) && typeof state.monthThemes === 'object') ? state.monthThemes : {};
  let monthThemes = Array.isArray(themesMap[monthKey]) ? themesMap[monthKey] : blankThemes();
  // Sync the current week's slot with the Week page's 本周主题: if this slot has
  // no title yet, fall back to the legacy per-week store so both pages agree.
  const curIdx = currentWeek - 1;
  const legacyWeekTitle = isCurrent ? store.getWeekGoal(weekKey(now)) : '';
  if (curIdx >= 0 && legacyWeekTitle && !(monthThemes[curIdx] && monthThemes[curIdx].title)) {
    monthThemes = monthThemes.slice();
    monthThemes[curIdx] = { ...(monthThemes[curIdx] || { title: '', progress: 0 }), title: legacyWeekTitle };
  }
  const setTheme = (idx, patch) => {
    store.updateField('monthThemes', (prev) => {
      const obj = (prev && !Array.isArray(prev) && typeof prev === 'object') ? { ...prev } : {};
      const arr = Array.isArray(obj[monthKey]) ? obj[monthKey].slice() : blankThemes();
      arr[idx] = { ...(arr[idx] || { title: '', progress: 0 }), ...patch };
      obj[monthKey] = arr;
      return obj;
    });
  };

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) {
    const d = new Date(year, month, 1 - (leadingBlanks - i));
    cells.push({ d, muted: true });
  }
  for (let dn = 1; dn <= lastOfMonth.getDate(); dn++) {
    cells.push({ d: new Date(year, month, dn), muted: false });
  }
  while (cells.length % 7 !== 0 || cells.length < 35) {
    const last = cells[cells.length - 1].d;
    const next = new Date(last); next.setDate(last.getDate() + 1);
    cells.push({ d: next, muted: next.getMonth() !== month });
  }

  // Show todos count per day from store as a "load" indicator
  const todoCount = (d) => {
    const iso = toISO(d);
    return store.getTodos(iso).length;
  };

  return (
    <div className="main-inner">
      <div className="hero">
        <div>
          <div className="greeting">
            <span className="serif accent">{MONTH_CN[month]}</span> · {year}
          </div>
          <div className="greeting-sub">
            {isCurrent
              ? '一个月可以走多远？不是看一天，是看一整月的轨迹。'
              : monthStats && monthStats.totalTodos > 0
                ? `这个月完成了 ${monthStats.completedTodos}/${monthStats.totalTodos} 件事`
                  + (monthStats.totalHabitDays > 0 ? ` · ${monthStats.totalHabitDays} 次打卡` : '')
                  + (monthStats.totalPomos > 0 ? ` · 🍅${monthStats.totalPomos}` : '')
                  + (monthStats.journalCount > 0 ? ` · ${monthStats.journalCount} 篇日记` : '')
                : offset < 0 ? '这个月还没有留下记录。' : '未来的一个月，可以先排上几件事。'}
          </div>
        </div>
        <PeriodNav offset={offset} setOffset={setOffset}
          prevTitle="上个月" nextTitle="下个月" resetLabel="回到本月" />
      </div>

      <div className="month-grid" style={{ marginBottom: 8 }}>
        {WEEKDAY_CN.map(d => <div key={d} className="month-day-name">周{d}</div>)}
      </div>
      <div className="month-grid month-grid-body">
        {cells.map((c, i) => {
          const isToday = isCurrent && !c.muted && c.d.getDate() === todayDate && c.d.getMonth() === month;
          const count = !c.muted ? todoCount(c.d) : 0;
          const iso = toISO(c.d);
          const dayList = !c.muted ? store.getTodos(iso).slice(0, 2) : [];
          const dayDone = !c.muted ? store.getTodos(iso).filter(t => t.done).length : 0;
          return (
            <div key={i} className={`month-day ${c.muted?'muted':''} ${isToday?'today':''}`}
              onClick={c.muted ? undefined : () => setOpenIso(iso)}
              title={c.muted ? undefined : '点击查看这天的全部待办'}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div className="month-day-num">{c.d.getDate()}</div>
                {count > 0 && <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{dayDone}/{count}</div>}
              </div>
              {dayList.map((t, j) => (
                <div key={j} className={`month-event ${t.tag === 'study' ? 'accent' : t.tag === 'side' ? 'warm' : ''}`}
                  style={{ textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.55 : 1 }}>
                  {t.text}
                </div>
              ))}
              {count > 2 && (
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>+ {count - 2}</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 28 }}>
        <div className="tiny" style={{ marginBottom: 10 }}>本月分主题 · Monthly Themes</div>
        <div className="month-themes">
          {monthThemes.slice(0, currentWeek).map((t, i) => (
            <div className="month-theme" key={i}>
              <div className="month-theme-week">WEEK {i + 1}</div>
              <input
                className="month-theme-title-input"
                value={t.title}
                placeholder="这周的主题…"
                onChange={(e) => setTheme(i, { title: e.target.value })}
              />
              <div className="month-theme-progress"><div className="month-theme-fill" style={{ width: t.progress + '%' }}/></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <input type="range" min="0" max="100" step="5" value={t.progress}
                  onChange={(e) => setTheme(i, { progress: Number(e.target.value) })}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--ink-soft)', minWidth: 30, textAlign: 'right' }}>{t.progress}%</span>
              </div>
            </div>
          ))}
        </div>
        {currentWeek < WEEKS && (
          <div className="tiny" style={{ marginTop: 10, color: 'var(--ink-soft)', opacity: 0.7 }}>
            第 {currentWeek + 1} 周及以后的主题，到那一周会自动出现。
          </div>
        )}
      </div>

      <DayTodosModal iso={openIso} onClose={() => setOpenIso(null)} />
    </div>
  );
}

// Aggregate one calendar year's footprint from the date-keyed maps —
// used by the Year page when翻看过去的年份（OKR 只属于当年，往年用数字回顾）。
function computeYearStats(state, year) {
  const inYear = (iso) => typeof iso === 'string' && iso.startsWith(String(year));
  let totalTodos = 0, completedTodos = 0, totalPomos = 0, totalHabitDays = 0, daysWithGratitude = 0, activeDays = 0;
  Object.entries(state.todos || {}).forEach(([iso, list]) => {
    if (!inYear(iso) || !list || !list.length) return;
    activeDays++;
    totalTodos += list.length;
    completedTodos += list.filter(t => t.done).length;
  });
  Object.entries(state.pomoCount || {}).forEach(([iso, n]) => { if (inYear(iso)) totalPomos += n; });
  Object.values(state.habitDays || {}).forEach(days => {
    Object.keys(days || {}).forEach(iso => { if (inYear(iso)) totalHabitDays++; });
  });
  Object.entries(state.gratitude || {}).forEach(([iso, items]) => {
    if (inYear(iso) && (items || []).some(x => x && x.trim())) daysWithGratitude++;
  });
  const journalCount = (state.journal || []).filter(j => new Date(j.date).getFullYear() === year).length;
  const notesCount = (state.notes || []).filter(n => n.createdAt && new Date(n.createdAt).getFullYear() === year).length;
  return { totalTodos, completedTodos, totalPomos, totalHabitDays, daysWithGratitude, activeDays, journalCount, notesCount };
}

// ===== Year view — OKRs (fully editable) =====
function YearView() {
  const { state, updateField } = useStore();
  const [offset, setOffset] = _us(0); // 0 = 今年，-1 = 去年…（不允许翻到未来）
  const now = new Date();
  const thisYear = now.getFullYear();
  const year = thisYear + offset;
  const isCurrent = offset === 0;
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const yearProgress = Math.round((now - start) / (end - start) * 100);

  const colorFor = window.okrColor;

  // 每个 OKR 被挂靠待办的完成情况：累计 + 最近 7 天（让年度页能看到日常的推进）
  const okrActivity = (() => {
    const map = {};
    const weekAgoISO = toISO(new Date(Date.now() - 7 * 86400000));
    Object.entries(state.todos || {}).forEach(([iso, list]) => {
      (list || []).forEach(t => {
        if (!t.okrId || !t.done) return;
        const m = map[t.okrId] || (map[t.okrId] = { total: 0, week: 0 });
        m.total++;
        if (iso >= weekAgoISO) m.week++;
      });
    });
    return map;
  })();

  const updateOKR = (oid, patch) => {
    updateField('okrs', list => list.map(o => o.id === oid ? { ...o, ...patch } : o));
  };
  const updateKR = (oid, ki, patch) => {
    updateField('okrs', list => list.map(o => o.id === oid ? {
      ...o, krs: o.krs.map((k, j) => j === ki ? { ...k, ...patch } : k)
    } : o));
  };
  const addKR = (oid) => {
    updateField('okrs', list => list.map(o => o.id === oid ? {
      ...o, krs: [...o.krs, { name: '新关键结果', cur: 0, max: 100 }]
    } : o));
  };
  const removeKR = (oid, ki) => {
    updateField('okrs', list => list.map(o => o.id === oid ? {
      ...o, krs: o.krs.filter((_, j) => j !== ki)
    } : o));
  };
  const addOKR = () => {
    const next = { id: uid(), icon: ['a','b','c','d'][state.okrs.length % 4], initial: 'N',
      name: '新目标', aim: '一句话描述这个目标',
      krs: [{ name: '关键结果 1', cur: 0, max: 100 }] };
    updateField('okrs', list => [...list, next]);
  };
  const removeOKR = (oid) => {
    if (!confirm('删除这个年度目标？')) return;
    updateField('okrs', list => list.filter(o => o.id !== oid));
  };
  const cycleIcon = (oid, cur) => {
    const order = ['a','b','c','d'];
    const next = order[(order.indexOf(cur) + 1) % 4];
    updateOKR(oid, { icon: next });
  };

  // 翻看过去的年份：OKR 是「当年」的东西，往年改用一页数字回顾
  const yearStats = !isCurrent ? computeYearStats(state, year) : null;

  return (
    <div className="main-inner">
      <div className="year-head">
        <div>
          <div className="year-title">
            <span className="accent">{year}</span><br/>
            <span style={{ fontSize: 22, color: 'var(--ink-dim)', letterSpacing: '0.06em' }}>
              {isCurrent ? 'be the kind of person you want to become.' : 'the year you walked through.'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <PeriodNav offset={offset} setOffset={setOffset}
            prevTitle="上一年" nextTitle="下一年" resetLabel="回到今年" nextDisabled={offset >= 0} />
          <div className="year-progress-card">
            <div className="year-progress-num">{isCurrent ? yearProgress : 100}%</div>
            <div className="year-progress-label">{isCurrent ? '已经走过 / of the year' : '已经走完 / completed'}</div>
          </div>
        </div>
      </div>

      {!isCurrent && (
        <div className="year-review">
          {yearStats.activeDays === 0 ? (
            <div className="encourage" style={{ marginTop: 24 }}>
              {year}年没有留下记录 — 那时这棵树还没有种下 🌱
            </div>
          ) : (
            <div className="year-review-grid">
              {[
                { num: yearStats.activeDays, label: '有记录的日子' },
                { num: `${yearStats.completedTodos}/${yearStats.totalTodos}`, label: '完成的事' },
                { num: yearStats.totalPomos, label: '番茄钟 🍅' },
                { num: yearStats.totalHabitDays, label: '习惯打卡（次）' },
                { num: yearStats.daysWithGratitude, label: '写下好事的天数' },
                { num: yearStats.journalCount, label: '成功日记（篇）' },
                { num: yearStats.notesCount, label: '随手笔记（条）' },
              ].map((s, i) => (
                <div className="year-review-stat" key={i}>
                  <div className="year-review-num serif">{s.num}</div>
                  <div className="year-review-label">{s.label}</div>
                </div>
              ))}
            </div>
          )}
          <div className="tiny" style={{ marginTop: 16, color: 'var(--ink-soft)', opacity: 0.75 }}>
            年度 OKR 只属于当下这一年；想看那年某天具体做了什么，去「本月」页往回翻。
          </div>
        </div>
      )}

      {isCurrent && (
      <div className="okr-list">
        {state.okrs.map((o) => {
          const overall = o.krs.length === 0 ? 0 : Math.round(
            o.krs.reduce((sum, k) => sum + Math.min(1, (k.cur || 0) / (k.max || 1)), 0) / o.krs.length * 100
          );
          return (
            <div className="okr" key={o.id}>
              <div className="okr-head">
                <button className={`okr-icon ${o.icon}`} onClick={() => cycleIcon(o.id, o.icon)} title="换个颜色"
                  style={{ border: 'none', cursor: 'pointer' }}>
                  <input
                    value={o.initial}
                    onChange={(e) => updateOKR(o.id, { initial: e.target.value.slice(0, 1) })}
                    style={{
                      width: 24, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none',
                      fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'inherit',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </button>
                <div style={{ flex: 1 }}>
                  <input
                    className="okr-name-input"
                    value={o.name}
                    onChange={(e) => updateOKR(o.id, { name: e.target.value })}
                    placeholder="目标名称…"
                  />
                  <input
                    className="okr-aim-input"
                    value={o.aim}
                    onChange={(e) => updateOKR(o.id, { aim: e.target.value })}
                    placeholder="一句话描述这个目标…"
                  />
                </div>
                <div className="okr-percent">{overall}<span className="pct">%</span></div>
                <button className="okr-remove" onClick={() => removeOKR(o.id)} title="删除目标">×</button>
              </div>
              <div className="okr-bar">
                <div className="okr-bar-fill" style={{ width: overall + '%', background: colorFor(o.icon) }}/>
              </div>
              {(() => {
                const act = okrActivity[o.id];
                return act && act.total > 0 ? (
                  <div className="okr-activity">
                    🌱 已为它完成 {act.total} 件事{act.week > 0 ? ` · 最近 7 天 ${act.week} 件` : ''}
                  </div>
                ) : (
                  <div className="okr-activity dim">
                    还没有待办挂靠这个目标 — 在任何待办上点 ◎ 选中它，做完的每件事都会算到这里
                  </div>
                );
              })()}
              <div className="okr-krs">
                {o.krs.map((k, ki) => {
                  const pct = Math.min(100, Math.round((k.cur || 0) / (k.max || 1) * 100));
                  return (
                    <div className="okr-kr" key={ki}>
                      <input
                        className="okr-kr-name-input"
                        value={k.name}
                        onChange={(e) => updateKR(o.id, ki, { name: e.target.value })}
                        placeholder="关键结果…"
                      />
                      <div className="kr-progress"><div className="kr-progress-fill" style={{ width: pct + '%', background: colorFor(o.icon) }}/></div>
                      <div className="okr-kr-numeric">
                        <input
                          type="number"
                          value={k.cur}
                          onChange={(e) => updateKR(o.id, ki, { cur: parseFloat(e.target.value) || 0 })}
                          className="okr-kr-num"
                        />
                        <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>/</span>
                        <input
                          type="number"
                          value={k.max}
                          onChange={(e) => updateKR(o.id, ki, { max: parseFloat(e.target.value) || 1 })}
                          className="okr-kr-num"
                        />
                      </div>
                      <input type="range" min="0" max={k.max} value={k.cur}
                        onChange={(e) => updateKR(o.id, ki, { cur: parseFloat(e.target.value) })}
                        className="okr-kr-range"
                      />
                      <button className="okr-kr-remove" onClick={() => removeKR(o.id, ki)} title="删除">×</button>
                    </div>
                  );
                })}
                <button className="okr-kr-add" onClick={() => addKR(o.id)}>+ 添加关键结果</button>
              </div>
            </div>
          );
        })}
        <button className="okr-add" onClick={addOKR}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span>
          <span>添加年度目标</span>
        </button>
      </div>
      )}
    </div>
  );
}

Object.assign(window, { WeekView, MonthView, YearView, PeriodNav });
