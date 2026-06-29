// Journal view — past entries (5 good things + reflection)
function JournalView() {
  const { state, updateField } = useStore();
  const [query, setQuery] = _us('');

  const filtered = (() => {
    if (!query.trim()) return state.journal;
    const q = query.trim().toLowerCase();
    return state.journal.filter(j =>
      (j.reflection || '').toLowerCase().includes(q) ||
      (j.good || []).some(g => (g || '').toLowerCase().includes(q))
    );
  })();

  // Delete by object identity — `filtered` holds the same references as
  // state.journal, so this removes exactly the clicked entry whether or not
  // it has an id (example + auto-archived entries have none) and even while
  // a search filter is active.
  const remove = (entry) => {
    if (!confirm('删除这篇日记？删除后无法恢复。')) return;
    updateField('journal', list => list.filter(x => x !== entry));
  };

  return (
    <div className="main-inner">
      <div className="hero">
        <div>
          <div className="greeting"><span className="serif accent">成功日记</span> · Journal</div>
          <div className="greeting-sub">每一页都是你曾经存在过的证据。Be your own witness.</div>
        </div>
        <div className="search-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索日记…"
          />
          {query && <button className="search-clear" onClick={() => setQuery('')}>×</button>}
        </div>
      </div>

      {filtered.map((j, i) => {
        const d = new Date(j.date);
        return (
          <div className="journal-entry fade-in" key={i}>
            <button className="journal-del" onClick={() => remove(j)} title="删除这篇日记">×</button>
            <div className="journal-date">
              <div className="journal-day-num">{d.getDate()}</div>
              <div className="journal-month">{MONTH_EN[d.getMonth()]}</div>
              <div className="journal-weekday">{WEEKDAY_EN[getMonIndex(d)]}</div>
            </div>
            <div>
              <div className="journal-section">
                <div className="journal-section-label">Five Good Things · 五件好事</div>
                <ul className="journal-good-list">
                  {j.good.map((g, k) => <li key={k}>{g}</li>)}
                </ul>
              </div>
              <div className="journal-section">
                <div className="journal-section-label">Reflection · 心得</div>
                <div className="journal-reflection">"{j.reflection}"</div>
              </div>
              <div className="journal-meta">
                <span>🍅 完成 {j.pomo} 个番茄钟</span>
                <span>· {d.toLocaleDateString('zh-CN', { weekday: 'long' })}</span>
              </div>
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="encourage">
          {query ? `没有找到包含「${query}」的日记` : '每一天都值得被记下来 — 哪怕只是一句话。'}
        </div>
      )}
      {filtered.length > 0 && !query && (
        <div className="encourage">每一天都值得被记下来 — 哪怕只是一句话。</div>
      )}
    </div>
  );
}

// ===== Image utilities =====
async function compressImageToDataURL(file, maxDim = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const out = canvas.toDataURL('image/jpeg', quality);
        resolve(out);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ===== Single moment card (朋友圈 style) =====
// 朋友圈式头像：默认是树叶 SVG，点一下可换成自己的照片（存进会同步的 state.avatar，
// 压缩成小图，电脑/手机看到同一张）。editable=false 时只展示、不可点。
function UserAvatar({ editable = true }) {
  const { state, updateField } = useStore();
  const src = state.avatar || '';
  const fileRef = _ur(null);
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    try {
      const url = await compressImageToDataURL(f, 256, 0.85);
      updateField('avatar', url);
    } catch (err) { alert('头像处理失败：' + err.message); }
  };
  return (
    <div className={`moment-avatar${editable ? ' editable' : ''}`}
      onClick={editable ? () => fileRef.current && fileRef.current.click() : undefined}
      title={editable ? '点击更换头像' : undefined}>
      {src
        ? <img src={src} alt="头像" />
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21c0-7 4-12 9-13-1 7-4 12-9 13z" fill="currentColor" fillOpacity="0.3"/>
            <path d="M12 21c-1-4-1-8 0-12"/>
            <path d="M11 21c-3-1-5-3-6-6"/>
          </svg>}
      {editable && <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />}
    </div>
  );
}

// 笔记时间 — 每次渲染从 createdAt 实时算，而不是用创建那一刻写死的字符串
//（老 bug：date 字段存了「刚刚」就永远显示「刚刚」）。没有 createdAt 的旧笔记
// 退回显示原来的 date 字符串。
function fmtNoteDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 3600 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return `今天 ${hm}`;
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (sameDay(d, yest)) return `昨天 ${hm}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function MomentCard({ note, onRemove, onEdit }) {
  const [lightbox, setLightbox] = _us(null);
  // 展开/收起长文：默认折叠到固定行数，仅当正文真的溢出时才显示「展开全文」。
  const [expanded, setExpanded] = _us(false);
  const [overflowing, setOverflowing] = _us(false);
  const bodyRef = _ur(null);
  _ue(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = () => {
      // 折叠态下 scrollHeight 超过可视高度即说明被截断。
      setOverflowing(el.scrollHeight - el.clientHeight > 2);
    };
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', check);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', check); };
  }, [note.body, expanded]);
  const tagColors = {
    IDEA: 'cool', QUOTE: 'warm', LEARN: 'fresh', TODO: '', REFLECT: '', BOOK: 'cool', MOMENT: 'fresh',
  };
  const tagLabels = {
    IDEA: '💡 IDEA', QUOTE: '✍️ QUOTE', LEARN: '📚 LEARN',
    TODO: '✓ TODO', REFLECT: '🌿 REFLECT', BOOK: '📖 BOOK', MOMENT: '📸 MOMENT',
  };
  const colorClass = note.color || tagColors[note.tag] || '';
  const images = note.images || [];

  return (
    <div className={`moment ${colorClass}`}>
      <div className="moment-head">
        <UserAvatar />
        <div className="moment-meta">
          <span className="moment-tag">{tagLabels[note.tag] || note.tag}</span>
          <span className="moment-date">{fmtNoteDate(note.createdAt) || note.date || ''}{note.edited ? ' · 已编辑' : ''}</span>
        </div>
        {onEdit && <button className="moment-edit" onClick={onEdit} title="编辑">✎</button>}
        <button className="moment-del" onClick={onRemove} title="删除">×</button>
      </div>
      {note.body && (
        <div className="moment-body-wrap">
          <div ref={bodyRef} className={`moment-body${expanded ? ' expanded' : ''}`}>{note.body}</div>
          {(overflowing || expanded) && (
            <button className="moment-more" onClick={() => setExpanded(v => !v)}>
              {expanded ? '收起' : '展开全文'}
            </button>
          )}
        </div>
      )}
      {images.length > 0 && (
        <div className={`moment-images grid-${Math.min(images.length, 9)}`}>
          {images.slice(0, 9).map((src, i) => (
            <div className="moment-image" key={i} onClick={() => setLightbox(src)}>
              <img src={src} alt="" loading="lazy" />
            </div>
          ))}
        </div>
      )}
      {lightbox && ReactDOM.createPortal((
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightbox(null)} aria-label="关闭">×</button>
          <div className="lightbox-hint">点击任意处关闭</div>
        </div>
      ), document.body)}
    </div>
  );
}

// ===== Composer (write a new moment) =====
function MomentComposer({ onSubmit, onCancel, initial, submitLabel = '发布 · Share', storageKey }) {
  // 草稿恢复：优先用持久化草稿（storageKey），否则用传入的 initial（编辑已发布笔记时预填）。
  // 这样在随手笔记里写到一半切去 Claudio 换歌、再切回来，内容不会丢。
  const restoreDraft = () => {
    if (storageKey) {
      try { const raw = localStorage.getItem(storageKey); if (raw) return JSON.parse(raw); } catch {}
    }
    return initial || null;
  };
  const [seed] = _us(restoreDraft);
  const [body, setBody] = _us(seed?.body || '');
  const [tag, setTag] = _us(seed?.tag || 'MOMENT');
  const [images, setImages] = _us(seed?.images || []);
  const [color, setColor] = _us(seed?.color || '');
  const [busy, setBusy] = _us(false);
  const fileRef = _ur(null);
  const dropRef = _ur(null);

  // 自动把草稿写进 localStorage（每次改动都存），空了就清掉。图片可能很大，
  // 超出配额时退一步只存文字，至少别让正在写的字丢了。
  _u_e(() => {
    if (!storageKey) return;
    if (!body.trim() && images.length === 0) { try { localStorage.removeItem(storageKey); } catch {} return; }
    try { localStorage.setItem(storageKey, JSON.stringify({ body, tag, color, images })); }
    catch { try { localStorage.setItem(storageKey, JSON.stringify({ body, tag, color, images: [] })); } catch {} }
  }, [body, tag, color, images, storageKey]);

  const clearDraft = () => { if (storageKey) { try { localStorage.removeItem(storageKey); } catch {} } };

  const tags = ['MOMENT','IDEA','QUOTE','LEARN','TODO','REFLECT','BOOK'];
  const colors = ['', 'warm', 'cool', 'fresh'];

  const addFiles = async (files) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const next = [];
      for (const f of Array.from(files).slice(0, 9 - images.length)) {
        if (!f.type.startsWith('image/')) continue;
        const url = await compressImageToDataURL(f);
        next.push(url);
      }
      if (next.length) setImages(prev => [...prev, ...next].slice(0, 9));
    } catch (e) {
      alert('图片处理失败：' + e.message);
    } finally {
      setBusy(false);
    }
  };

  // Drag & drop on the textarea / composer
  _u_e(() => {
    const el = dropRef.current;
    if (!el) return;
    const onOver = (e) => { e.preventDefault(); el.classList.add('drop-active'); };
    const onLeave = () => el.classList.remove('drop-active');
    const onDrop = (e) => {
      e.preventDefault();
      el.classList.remove('drop-active');
      const fs = e.dataTransfer?.files;
      if (fs && fs.length) addFiles(fs);
    };
    el.addEventListener('dragover', onOver);
    el.addEventListener('dragleave', onLeave);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragover', onOver);
      el.removeEventListener('dragleave', onLeave);
      el.removeEventListener('drop', onDrop);
    };
  }, [images.length]);

  // Paste image from clipboard
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const submit = () => {
    if (!body.trim() && images.length === 0) return;
    onSubmit({ body: body.trim(), tag, color, images });
    clearDraft();
  };
  const cancel = () => { clearDraft(); onCancel(); };

  return (
    <div className="moment-composer" ref={dropRef}>
      <div className="composer-tags">
        {tags.map(t => (
          <button key={t}
            className={`composer-tag ${tag === t ? 'active' : ''}`}
            onClick={() => setTag(t)}>
            {t}
          </button>
        ))}
      </div>
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onPaste={handlePaste}
        placeholder="此刻你在想什么？  ⌘V 粘贴图片，也可以拖拽进来"
        className="composer-body"
      />
      {images.length > 0 && (
        <div className={`composer-images grid-${Math.min(images.length, 9)}`}>
          {images.map((src, i) => (
            <div className="composer-image" key={i}>
              <img src={src} alt="" />
              <button className="img-remove" onClick={() => setImages(images.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {images.length < 9 && (
            <button className="composer-add-image" onClick={() => fileRef.current?.click()} disabled={busy}>
              <span style={{ fontSize: 22, opacity: 0.5 }}>＋</span>
            </button>
          )}
        </div>
      )}
      <div className="composer-foot">
        <div className="composer-tools">
          <button className="composer-tool" onClick={() => fileRef.current?.click()} disabled={busy} title="添加图片">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2"/>
              <circle cx="9" cy="10" r="2"/>
              <path d="m21 16-5-5L4 20"/>
            </svg>
            {busy ? '处理中…' : '图片'}
          </button>
          <div className="composer-colors">
            {colors.map(c => (
              <button key={c || 'p'}
                className={`color-swatch ${c} ${color === c ? 'active' : ''}`}
                onClick={() => setColor(c)} title={c || '默认'} />
            ))}
          </div>
        </div>
        <div className="composer-actions">
          <button className="btn btn-ghost" onClick={cancel}>取消</button>
          <button className="btn btn-primary" onClick={submit}
            disabled={!body.trim() && images.length === 0}>
            {submitLabel}
          </button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}

// ===== Notes view — moments feed =====
function NotesView() {
  const { state, updateField } = useStore();
  // 若上次离开随手笔记时新笔记草稿还没发布，重挂时自动重新打开编辑器
  //（具体内容由 MomentComposer 从 localStorage 恢复）。
  const [composing, setComposing] = _us(() => {
    try {
      const raw = localStorage.getItem('notes_draft_new');
      if (raw) { const d = JSON.parse(raw); if ((d.body && d.body.trim()) || (d.images && d.images.length)) return true; }
    } catch {}
    return false;
  });
  const [editingId, setEditingId] = _us(null);
  const [query, setQuery] = _us('');

  const submit = (data) => {
    updateField('notes', list => [{
      id: uid(),
      tag: data.tag,
      body: data.body,
      color: data.color,
      images: data.images,
      createdAt: Date.now(),
    }, ...list]);
    setComposing(false);
  };

  const saveEdit = (id, data) => {
    updateField('notes', list => list.map(n => n.id === id
      ? { ...n, tag: data.tag, body: data.body, color: data.color, images: data.images, edited: true, editedAt: Date.now() }
      : n));
    setEditingId(null);
  };

  const remove = (id) => {
    if (!confirm('删除这条记录？')) return;
    updateField('notes', list => list.filter(n => n.id !== id));
  };

  // 渲染前统一按时间倒序 — 存储顺序不可靠（云同步合并会把另一台设备的新笔记
  // 追加到队尾）。没有 createdAt 的旧笔记排到最后，维持原有相对顺序。
  const sorted = (() => {
    const list = state.notes || [];
    const withTs = list.filter(n => n && n.createdAt);
    const withoutTs = list.filter(n => n && !n.createdAt);
    withTs.sort((a, b) => b.createdAt - a.createdAt);
    return [...withTs, ...withoutTs];
  })();

  const filtered = (() => {
    if (!query.trim()) return sorted;
    const q = query.trim().toLowerCase();
    return sorted.filter(n =>
      (n.body || '').toLowerCase().includes(q) ||
      (n.tag || '').toLowerCase().includes(q)
    );
  })();

  return (
    <div className="main-inner">
      <div className="hero">
        <div>
          <div className="greeting"><span className="serif accent">随手笔记</span> · Notes</div>
          <div className="greeting-sub">把灵感、想法、瞬间存起来 — 像写给自己的朋友圈。</div>
        </div>
        <div className="search-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索笔记…"
          />
          {query && <button className="search-clear" onClick={() => setQuery('')}>×</button>}
        </div>
      </div>

      <div className="notes-feed">
        {!query && (
          composing ? (
            <MomentComposer storageKey="notes_draft_new" onSubmit={submit} onCancel={() => setComposing(false)} />
          ) : (
            <button className="composer-trigger" onClick={() => setComposing(true)}>
              <span className="trigger-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21c0-7 4-12 9-13-1 7-4 12-9 13z" fill="currentColor" fillOpacity="0.3"/>
                  <path d="M12 21c-1-4-1-8 0-12"/>
                </svg>
              </span>
              <span className="trigger-text">写一条… 或拖拽图片到这里</span>
              <span className="trigger-cta">＋ 发布</span>
            </button>
          )
        )}

        {filtered.map(n => (
          editingId === n.id ? (
            <MomentComposer key={n.id}
              initial={{ body: n.body, tag: n.tag, color: n.color || '', images: n.images || [] }}
              submitLabel="保存 · Save"
              storageKey={'notes_draft_edit_' + n.id}
              onSubmit={(data) => saveEdit(n.id, data)}
              onCancel={() => setEditingId(null)} />
          ) : (
            <MomentCard key={n.id} note={n} onRemove={() => remove(n.id)} onEdit={() => setEditingId(n.id)} />
          )
        ))}

        {filtered.length === 0 && !composing && (
          <div className="encourage" style={{ marginTop: 40 }}>
            {query ? `没有找到包含「${query}」的笔记` : '还没有记录。今天发生了什么值得留下的事？'}
          </div>
        )}
      </div>
    </div>
  );
}

// （原「历史 · Archive」页已移除 — 翻看历史改为：本周/本月/年度页面里直接 ‹ › 往回翻。）

Object.assign(window, { JournalView, NotesView, MomentCard, MomentComposer, UserAvatar });
