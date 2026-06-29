// Reusable small components: icons, sidebar, daily-quote, todo items, etc.
import React from 'react';
import { useStore, todayISO } from './store.jsx';
import { appConfirm, appAlert } from './modal.jsx';
import { AccountWidget } from './sync.jsx';
import { t, tArr } from './i18n.js';

const { useState: _us, useEffect: _ue, useRef: _ur, useCallback: _uc } = React;

// ===== Icons (lucide-style minimal strokes) =====
const Icon = {
  Sun: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>,
  Calendar: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  Week: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M9 5v14M15 5v14" /></svg>,
  Target: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>,
  Book: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5v-18Z" /><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /></svg>,
  Note: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h12l4 4v12a0 0 0 0 1 0 0H4z" /><path d="M16 4v4h4M8 12h8M8 16h5" /></svg>,
  Sparkle: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>,
  Check: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  Plus: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>,
  Play: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20" /></svg>,
  Pause: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>,
  Reset: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>,
  Refresh: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 12A9 9 0 0 1 18 5.3L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></svg>,
  X: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  Flame: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 1-6 1-9z" /></svg>,
  Heart: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
  Quote: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 11h3v6H3v-4c0-3 1.5-5 4.5-6L8 8c-1.5.5-2 1.5-2 3zM15 11h3v6h-6v-4c0-3 1.5-5 4.5-6L16 8c-1.5.5-2 1.5-2 3z" /></svg>,
  Timer: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></svg>,
  Radio: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2" /><path d="M4.93 19.07a10 10 0 0 1 0-14.14M7.76 16.24a6 6 0 0 1 0-8.48M16.24 7.76a6 6 0 0 1 0 8.48M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>,
  Archive: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg>
};

// ===== Sidebar =====
function Sidebar({ view, setView, openRecurring, onCollapse, onZen }) {
  const store = useStore();
  const { state } = store;
  const todayList = store.getTodos(todayISO());
  const todoCount = todayList.filter((td) => !td.done).length;
  const nav = [
  { id: 'today', label: t('nav.today'), icon: 'Sun', badge: todoCount || null },
  { id: 'week', label: t('nav.week'), icon: 'Week' },
  { id: 'month', label: t('nav.month'), icon: 'Calendar' },
  { id: 'year', label: t('nav.year'), icon: 'Target' }];

  const nav2 = [
  { id: 'journal', label: t('nav.journal'), icon: 'Heart' },
  { id: 'notes', label: t('nav.notes'), icon: 'Note', badge: state.notes.length }];

  const nav3 = [
  { id: 'radio', label: t('nav.radio'), icon: 'Radio' }];

  const renderSection = (label, items) => (
    <div className="nav-section">
      <div className="nav-label">{label}</div>
      {items.map((n) => {
        const I = Icon[n.icon];
        return (
          <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => setView(n.id)}>
            <span className="icon"><I /></span>
            <span>{n.label}</span>
            {n.badge != null && <span className="badge">{n.badge}</span>}
          </button>);
      })}
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21c0-7 4-12 9-13-1 7-4 12-9 13z" fill="currentColor" fillOpacity="0.25"/>
            <path d="M12 21c0-7 4-12 9-13-1 7-4 12-9 13z"/>
            <path d="M12 21c-1-4-1-8 0-12"/>
            <path d="M11 21c-3-1-5-3-6-6"/>
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-name">future</div>
          <div className="brand-sub">grow at your pace</div>
        </div>
        <button className="nav-collapse-btn" onClick={onCollapse} aria-label={t('nav.collapse')} title={t('nav.collapse')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
      </div>
      {renderSection(t('nav.sectionPlanning'), nav)}
      {renderSection(t('nav.sectionReflect'), nav2)}
      {renderSection(t('nav.sectionSound'), nav3)}
      <div className="sidebar-footer">
        <div className="sidebar-quick">
          <button className="sidebar-quick-btn" onClick={openRecurring} title={t('nav.recurringTitle')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 0-3 6.7L21 16"/><path d="M21 8v8h-5"/></svg>
            {t('nav.recurring')}
          </button>
        </div>
        {onZen && (
          <button className="sidebar-zen-btn" onClick={onZen} title={t('nav.zenTitle')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21c0-7 4-12 9-13-1 7-4 12-9 13z" fill="currentColor" fillOpacity="0.25"/><path d="M12 21c-1-4-1-8 0-12"/><path d="M11 21c-3-1-5-3-6-6"/></svg>
            {t('nav.zen')}
          </button>
        )}
        <AccountWidget />
      </div>
    </aside>);

}

// ===== Daily quote (rotates daily but can refresh) =====
// 手动换一句只覆盖【当天】：override 带日期存（date|idx），次日自动回到按日轮换。
// （旧实现存 quote_idx 不带日期，刷新过一次就永远卡在那句上。）
function DailyQuote() {
  const dailyIdx = () => {
    const today = new Date();
    return (today.getFullYear() * 365 + today.getMonth() * 31 + today.getDate()) % window.QUOTES.length;
  };
  const [idx, setIdx] = _us(() => {
    try {
      localStorage.removeItem('quote_idx');   // 清掉旧版不带日期的 key
      const [d, n] = (localStorage.getItem('quote_pick_v1') || '').split('|');
      if (d === todayISO() && Number.isInteger(+n) && +n >= 0 && +n < window.QUOTES.length) return +n;
    } catch {}
    return dailyIdx();
  });
  const refresh = () => {
    const n = (idx + 1) % window.QUOTES.length;
    setIdx(n);
    try { localStorage.setItem('quote_pick_v1', `${todayISO()}|${n}`); } catch {}
  };
  const q = window.QUOTES[idx];
  return (
    <div className="hero-quote">
      <button className="refresh" onClick={refresh} title={t('quote.refresh')}><Icon.Refresh /></button>
      <div>{q.t}</div>
      <div className="author">{q.a}</div>
    </div>);

}

// ===== 写给自己的话（首页 hero，替代每日语录）=====
// 存进会同步的 state（store.selfNote），所以电脑 / 手机看到同一句、随云端同步。
// 一打开网页就显示；点一下即可编辑。空着时给个温柔的提示邀请写一句。
function SelfNote() {
  const store = useStore();
  const note = store.state.selfNote || '';
  const [editing, setEditing] = _us(false);
  const [draft, setDraft] = _us(note);
  const taRef = _ur(null);

  const startEdit = () => { setDraft(store.state.selfNote || ''); setEditing(true); };
  const save = () => { store.updateField('selfNote', draft.trim()); setEditing(false); };

  // 进入编辑时聚焦，并把光标移到末尾
  _ue(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus();
      const v = el.value; el.value = ''; el.value = v;
    }
  }, [editing]);

  if (editing) {
    return (
      <div className="hero-quote hero-selfnote is-editing">
        <textarea
          ref={taRef}
          className="selfnote-input"
          value={draft}
          maxLength={200}
          rows={3}
          placeholder={t('selfnote.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
        />
        <div className="selfnote-actions">
          <button className="btn btn-ghost" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={save}>{t('common.save')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="hero-quote hero-selfnote" onClick={startEdit} title={t('selfnote.clickToEdit')}>
      <button className="refresh" onClick={(e) => { e.stopPropagation(); startEdit(); }} title={t('common.edit')}>✎</button>
      {note
        ? <div className="selfnote-text">{note}</div>
        : <div className="selfnote-empty">{t('selfnote.placeholder')}</div>}
      <div className="author">{t('selfnote.byline')}</div>
    </div>
  );
}

// OKR accent color by icon slot — shared by 年度页 / 待办挂靠 chip / 今日 OKR 条
const okrColor = (icon) =>
  icon === 'b' ? 'var(--warm)' :
  icon === 'c' ? 'var(--success)' :
  icon === 'd' ? '#8e7bb8' : 'var(--accent)';

// ===== Todo row =====
// Drag props (draggable/dragging/dragOver/onDrag*) are optional — supplied by
// TodoRows so open items can be reordered. Done items are dropped through.
function TodoRow({ t: td, onToggle, onText, onDelete, onTag, onOkr, compact,
                   draggable, dragging, dragOver, onDragStart, onDragEnd, onDragOver, onDrop }) {
  const { state } = useStore();
  const okrs = state.okrs || [];
  const tagOpts = ['study', 'side', 'life', 'health'];
  const tagLabels = { study: 'STUDY', side: 'SIDE', life: 'LIFE', health: 'HEALTH' };
  // 已迁移存根（Bullet Journal 的「→」）：搬到今天后留在原日期的只读记号 ——
  // 不能勾选/拖动/改挂靠，只能删。不删原条目是为了躲开云合并的删除复活。
  if (td.migrated) {
    return (
      <div className="todo-item migrated" title={t('todo.migratedTo', { date: td.migrated })}>
        <span className="todo-check migrated-mark" aria-hidden="true">→</span>
        <div className="todo-text">{td.text}</div>
        {td.tag && <span className={`todo-tag ${td.tag}`}>{tagLabels[td.tag]}</span>}
        <button className="todo-delete" onClick={onDelete} aria-label="delete"><Icon.X /></button>
      </div>
    );
  }
  const cycle = () => {
    const i = tagOpts.indexOf(td.tag || 'study');
    onTag(tagOpts[(i + 1) % tagOpts.length]);
  };
  // 挂靠年度目标：点击在 无 → 目标1 → 目标2 → … → 无 之间轮换（和分类标签同款交互）
  const linkedOkr = td.okrId ? okrs.find(o => o.id === td.okrId) : null;
  const cycleOkr = () => {
    if (!onOkr) return;
    const ids = okrs.map(o => o.id);
    const i = ids.indexOf(td.okrId);
    onOkr(i === -1 ? ids[0] : (i + 1 < ids.length ? ids[i + 1] : null));
  };
  return (
    <div className={`todo-item ${td.done ? 'done' : ''} ${dragging ? 'dragging' : ''} ${dragOver ? 'drag-over' : ''}`}
      onDragOver={draggable ? (e) => { e.preventDefault(); onDragOver && onDragOver(); } : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); onDrop && onDrop(); } : undefined}>
      {draggable && (
        <span className="todo-drag" draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart && onDragStart(); }}
          onDragEnd={onDragEnd}
          onClick={(e) => e.stopPropagation()}
          title={t('todo.dragSort')}>⠿</span>
      )}
      <button className={`todo-check ${td.done ? 'checked' : ''}`} onClick={onToggle} aria-label="toggle">
        <Icon.Check />
      </button>
      <div className="todo-text"
      contentEditable suppressContentEditableWarning
      onBlur={(e) => onText(e.currentTarget.textContent)}>
        {td.text}</div>
      {onOkr && okrs.length > 0 && (
        linkedOkr ? (
          <button className="todo-okr linked" style={{ color: okrColor(linkedOkr.icon) }}
            onClick={cycleOkr} title={t('todo.linkedOkr', { name: linkedOkr.name })}>
            {linkedOkr.initial || '◎'}
          </button>
        ) : (
          <button className="todo-okr" onClick={cycleOkr} title={t('todo.linkOkr')}>◎</button>
        )
      )}
      {td.tag && <button className={`todo-tag ${td.tag}`} onClick={cycle} title={t('todo.switchTag')}>{tagLabels[td.tag]}</button>}
      <button className="todo-delete" onClick={onDelete} aria-label="delete"><Icon.X /></button>
    </div>);

}

// ===== Draggable todo rows (no add box) =====
// Renders one date's todos with completion-sink toggling and drag-to-reorder of
// open items. Used by both 今日 and 本周 — they share state.todos[iso], so a
// reorder or a completion in one view is the same change everywhere.
function TodoRows({ iso, compact }) {
  const store = useStore();
  const list = store.getTodos(iso);
  const [dragId, setDragId] = _us(null);
  const [overId, setOverId] = _us(null);
  const endDrag = () => { setDragId(null); setOverId(null); };
  return list.map(td => (
    <TodoRow key={td.id} t={td} compact={compact}
      draggable={!td.done && !td.migrated}
      dragging={dragId === td.id}
      dragOver={overId === td.id && dragId !== null && dragId !== td.id}
      onDragStart={() => setDragId(td.id)}
      onDragEnd={endDrag}
      onDragOver={() => { if (!td.done && overId !== td.id) setOverId(td.id); }}
      onDrop={() => { if (dragId !== null && !td.done) store.reorderTodos(iso, dragId, td.id); endDrag(); }}
      onToggle={() => store.toggleTodo(iso, td.id)}
      onText={(text) => store.setTodos(iso, l => l.map(x => x.id === td.id ? { ...x, text } : x))}
      onTag={(tag) => store.setTodos(iso, l => l.map(x => x.id === td.id ? { ...x, tag } : x))}
      onOkr={(okrId) => store.setTodos(iso, l => l.map(x => x.id === td.id ? { ...x, okrId: okrId || undefined } : x))}
      onDelete={() => store.removeTodo(iso, td.id)}
    />
  ));
}

// ===== 幽灵示例（空列表的演示条目）=====
// 纯界面装饰，不进数据 —— 永远不会混进账号、不需要清理；用户一有真实条目就消失。
// 点击 = 用户主动采用，把它变成自己的第一条真实待办（即时上手，顺便示范分类标签）。
function GhostTodo({ text, tag, onAdopt }) {
  const tagLabels = { study: 'STUDY', side: 'SIDE', life: 'LIFE', health: 'HEALTH' };
  return (
    <button type="button" className="todo-item ghost-item" onClick={onAdopt} title={t('todo.ghostTitle')}>
      <span className="todo-check ghost-check" aria-hidden="true"></span>
      <span className="todo-text ghost-text">{text}</span>
      {tag && <span className={`todo-tag ${tag}`}>{tagLabels[tag]}</span>}
      <span className="ghost-badge">{t('todo.ghostBadge')}</span>
    </button>
  );
}

// 一个用户是否还没真正用过待办（任何日期都没有条目）— 幽灵示例只对这类新手出现，
// 老用户某天清空了列表不该再看到示例。
function hasNoTodosAtAll(state) {
  return Object.values(state.todos || {}).every((l) => !l || l.length === 0);
}

function TodoAdd({ onAdd, placeholder }) {
  if (placeholder == null) placeholder = t('todo.addPlaceholder');
  const [v, setV] = _us('');
  const submit = () => {
    const txt = v.trim();
    if (!txt) return;
    onAdd(txt);
    setV('');
  };
  return (
    <div className="todo-add">
      <div className="todo-add-icon"><Icon.Plus /></div>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {if (e.key === 'Enter') submit();}}
        placeholder={placeholder} />
      
    </div>);

}

// ===== Data backup buttons (export / import JSON) =====
function DataBackupButtons() {
  const store = useStore();
  const fileRef = _ur(null);

  const exportData = () => {
    try {
      const data = JSON.stringify(store.state, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const d = new Date();
      a.download = `future-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { appAlert({ title: t('backup.exportFailTitle'), message: e.message }); }
  };

  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const obj = JSON.parse(e.target.result);
        if (!obj.todos && !obj.habits) {
          appAlert({ title: t('backup.importBadTitle'), message: t('backup.importBadMsg') });
          return;
        }
        if (await appConfirm({ title: t('backup.importConfirmTitle'), message: t('backup.importConfirmMsg'), confirmText: t('backup.importConfirmBtn'), danger: true })) {
          store.setState(obj);
          setTimeout(() => location.reload(), 200);
        }
      } catch (err) {
        appAlert({ title: t('backup.parseFailTitle'), message: err.message });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="data-backup">
      <button className="backup-btn" onClick={exportData} title={t('backup.exportTitle')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
        {t('backup.export')}
      </button>
      <button className="backup-btn" onClick={() => fileRef.current?.click()} title={t('backup.importTitle')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V9M7 14l5-5 5 5M5 3h14" /></svg>
        {t('backup.import')}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importData(f);
          e.target.value = '';
        }} />
      
    </div>);

}

Object.assign(window, { Icon, Sidebar, DailyQuote, SelfNote, TodoRow, TodoRows, TodoAdd, DataBackupButtons, okrColor, GhostTodo, hasNoTodosAtAll });

export { Icon, Sidebar, DailyQuote, SelfNote, TodoRow, TodoRows, TodoAdd, DataBackupButtons, okrColor, GhostTodo, hasNoTodosAtAll };