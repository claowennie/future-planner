// Root app
function App() {
  const store = useLocalState();
  const [view, setView] = _us('today');
  const [recurringOpen, setRecurringOpen] = _us(false);
  const [navOpen, setNavOpen] = _us(() => (typeof window !== 'undefined' ? window.innerWidth > 860 : true));
  // Zen mode — hide all UI and just look at the background growth tree.
  const [zen, setZen] = _us(false);

  // Keep nav state sane across resize: opening past the breakpoint reveals the sidebar,
  // shrinking below it tucks the drawer away.
  _ue(() => {
    let wasNarrow = window.innerWidth <= 860;
    const onResize = () => {
      const narrow = window.innerWidth <= 860;
      if (narrow !== wasNarrow) {
        wasNarrow = narrow;
        setNavOpen(!narrow);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Close the drawer after navigating on mobile
  const navigate = (v) => {
    setView(v);
    if (window.innerWidth <= 860) setNavOpen(false);
  };
  // Let deep components (e.g. 今日页的 OKR 条) jump between views without prop drilling
  window.__appNavigate = navigate;

  // Apply seasonal + time-of-day class to body
  _ue(() => {
    const apply = () => {
      const tod = window.getTimeOfDay?.() || 'day';
      const season = window.getSeason?.() || 'summer';
      document.body.className = `tod-${tod} season-${season}`;
    };
    apply();
    const t = setInterval(apply, 60000); // refresh each minute
    return () => clearInterval(t);
  }, []);

  // Spawn recurring tasks for today (once per session per date)
  _ue(() => {
    window.spawnRecurringForToday?.(store.state, store.setState);
  }, []);

  // Zen mode: drop a body class so CSS can hide every panel but the background,
  // and let Esc bring the interface back.
  _ue(() => {
    document.body.classList.toggle('zen-mode', zen);
    if (!zen) return;
    const onKey = (e) => { if (e.key === 'Escape') setZen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zen]);

  const Views = {
    today: window.TodayView,
    week: window.WeekView,
    month: window.MonthView,
    year: window.YearView,
    journal: window.JournalView,
    notes: window.NotesView,
  };
  const Current = Views[view] || window.TodayView;

  // 电台要在切换页面时保持播放 + 对话不丢，所以它一旦被打开过就一直挂载，
  // 切到别的页面只用 CSS 隐藏（隐藏的 <audio> 照样继续播）。其余页面照常按 view 切换/淡入。
  const [radioMounted, setRadioMounted] = _us(false);
  _ue(() => { if (view === 'radio') setRadioMounted(true); }, [view]);

  return (
    <StoreCtx.Provider value={store}>
      {window.BackgroundTree && <window.BackgroundTree />}
      <div className={`app ${navOpen ? '' : 'nav-collapsed'}`}>
        <Sidebar view={view} setView={navigate} onCollapse={() => setNavOpen(false)} openRecurring={() => setRecurringOpen(true)} onZen={() => setZen(true)} />
        <main className="main">
          {view !== 'radio' && <div className="fade-in" key={view}><Current/></div>}
          {radioMounted && window.RadioView && (
            <div style={{ display: view === 'radio' ? 'contents' : 'none' }}>
              <window.RadioView/>
            </div>
          )}
        </main>
      </div>
      {!navOpen && (
        <button className="nav-open-btn" onClick={() => setNavOpen(true)} aria-label="展开侧栏" title="展开侧栏">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      )}
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      {zen && (
        <>
          <button className="zen-exit" onClick={() => setZen(false)} title="退出沉浸 · Esc" aria-label="退出沉浸">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          <div className="zen-hint">静静看着它长大 🌱 · 按 Esc 或点右上角退出</div>
        </>
      )}
      <window.AppTweaks/>
      {window.QuickCapture && <window.QuickCapture />}
      {window.RecurringManager && <window.RecurringManager open={recurringOpen} onClose={() => setRecurringOpen(false)} />}
    </StoreCtx.Provider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
