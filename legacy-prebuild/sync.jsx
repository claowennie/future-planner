// Supabase cloud sync + auth UI
const { useState: _u_s, useEffect: _u_e, useRef: _u_r, useCallback: _u_c } = React;

// === Initialize client ===
const sbClient = (() => {
  try {
    if (!window.supabase || !window.SUPABASE_CONFIG) return null;
    return window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch (e) { console.warn('Supabase init failed:', e); return null; }
})();
window.sbClient = sbClient;

// ====== Auth modal ======
// Simple email + password sign-in / sign-up. No OTP, no recovery — those
// require a paid SMTP setup. To make signup work without email confirmation,
// turn OFF "Confirm email" in Supabase → Authentication → Providers → Email.
function AuthModal({ open, onClose, onSignedIn }) {
  const [mode, setMode] = _u_s('signin'); // signin | signup
  const [email, setEmail] = _u_s('');
  const [password, setPassword] = _u_s('');
  const [loading, setLoading] = _u_s(false);
  const [err, setErr] = _u_s('');
  const [info, setInfo] = _u_s('');

  _u_e(() => { if (open) { setErr(''); setInfo(''); } }, [open]);

  if (!open) return null;

  const goMode = (m) => { setMode(m); setErr(''); setInfo(''); setPassword(''); };

  const submit = async (e) => {
    e?.preventDefault?.();
    setErr(''); setInfo(''); setLoading(true);
    try {
      if (mode === 'signin') {
        const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSignedIn?.(data.user);
      } else {
        const { data, error } = await sbClient.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          onSignedIn?.(data.user);
        } else {
          // Confirm-email is still on in Supabase. Tell the user how to fix.
          setInfo('注册成功，但 Supabase 后台开启了「邮箱验证」需要点链接确认。建议在 Authentication → Providers → Email 关闭 Confirm email 后重新注册。');
        }
      }
    } catch (ex) {
      setErr(ex.message || '出错了，请重试');
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal((
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auth-modal">
        <button className="auth-close" onClick={onClose} aria-label="close">×</button>
        <div className="auth-head">
          <div className="auth-title serif">{mode === 'signin' ? '欢迎回来' : '开启你的同步空间'}</div>
          <div className="auth-sub">{mode === 'signin' ? '登录后，数据自动同步到云端' : '注册一个账号，多设备同步'}</div>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label className="auth-label">邮箱 · Email
            <input type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus
              autoComplete="email" />
          </label>
          <label className="auth-label">密码 · Password
            <input type="password" required minLength={6} value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 个字符"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </label>
          {err && <div className="auth-err">{err}</div>}
          {info && <div className="auth-info">{info}</div>}
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? '处理中…' : mode === 'signin' ? '登录' : '注册并登录'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'signin' ? (
            <>第一次来？<button type="button" onClick={() => goMode('signup')}>创建账号</button></>
          ) : (
            <>已经有账号？<button type="button" onClick={() => goMode('signin')}>去登录</button></>
          )}
        </div>

        <div className="auth-foot">
          数据保存在 Supabase 云端，遵循行级安全 — 只有你能看到自己的数据。
        </div>
      </div>
    </div>
  ), document.body);
}

// ====== Account widget (in sidebar) ======
function AccountWidget() {
  const store = useStore();
  const [user, setUser] = _u_s(null);
  const [openAuth, setOpenAuth] = _u_s(false);
  const [syncStatus, setSyncStatus] = _u_s('idle'); // idle | syncing | synced | error | offline
  const lastSyncedRef = _u_r('');
  const debounceRef = _u_r(null);
  // Gate uploads until the first pull of this session has reconciled, so a
  // device that just opened with stale local data can't push it over newer
  // cloud data before it has even seen the cloud.
  const hasPulledRef = _u_r(false);

  // Refs so the async sync helpers always read the *latest* state/user/etc
  // without retriggering effects whenever the state changes.
  const stateRef = _u_r(store.state); stateRef.current = store.state;
  const userRef = _u_r(user); userRef.current = user;
  const applyCloudRef = _u_r(store.applyCloudState); applyCloudRef.current = store.applyCloudState;

  // Subscribe to auth state changes
  _u_e(() => {
    if (!sbClient) { setSyncStatus('offline'); return; }
    sbClient.auth.getUser().then(({ data }) => setUser(data.user || null));
    const { data: sub } = sbClient.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uploadNow = async (explicit) => {
    const u = userRef.current;
    if (!u || !sbClient) return;
    const payload = explicit || stateRef.current;
    const nowIso = new Date().toISOString();
    const { error } = await sbClient
      .from('planner_data')
      .upsert({ user_id: u.id, data: payload, updated_at: nowIso });
    if (error) throw error;
    lastSyncedRef.current = JSON.stringify(payload);
    localStorage.setItem('last_synced_at_' + u.id, String(new Date(nowIso).getTime()));
  };

  // Fetch cloud and reconcile. Used by login, focus, polling, and realtime.
  //
  // Conflict-safe protocol (replaces the old blob last-write-wins, which let a
  // stale device clobber newer data irreversibly):
  //   · cloud empty            → seed it from local (if local non-empty)
  //   · no unsynced local edits → clean pull: cloud wins (back up local first)
  //   · unsynced local edits + cloud changed → CONFLICT → MERGE the two (union,
  //     never lose), apply the merge, and push it back so devices converge.
  // Every overwrite/merge backs up the current local state first (planner_backups_v1).
  const pullNow = async () => {
    const u = userRef.current;
    if (!u || !sbClient) return;
    try {
      setSyncStatus('syncing');
      const { data, error } = await sbClient
        .from('planner_data')
        .select('data, updated_at')
        .eq('user_id', u.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;

      const local = stateRef.current;
      const localLastEdit = parseInt(localStorage.getItem('last_edit_at') || '0', 10);
      const localLastSync = parseInt(localStorage.getItem('last_synced_at_' + u.id) || '0', 10);
      const localHasUnsynced = localLastEdit > localLastSync;

      const cloudHasContent = data && data.data && !window.isEmptyState(data.data);
      if (!cloudHasContent) {
        // Cloud empty or stub — seed it from local, but only if we actually
        // have something (never push an empty/seed state over a real cloud).
        hasPulledRef.current = true;
        if (!window.isEmptyState(local)) await uploadNow(local);
        setSyncStatus('synced');
        return;
      }

      const cloudJson = JSON.stringify(data.data);
      if (cloudJson === lastSyncedRef.current) {
        hasPulledRef.current = true;
        setSyncStatus('synced');
        return;
      }

      if (!localHasUnsynced) {
        // Clean pull — nothing local to protect, so cloud wins. Back up first.
        window.pushBackup && window.pushBackup('cloud-pull');
        lastSyncedRef.current = cloudJson;
        localStorage.setItem('last_synced_at_' + u.id, String(new Date(data.updated_at).getTime()));
        applyCloudRef.current(data.data);
      } else {
        // CONFLICT: we have edits the cloud never saw, AND the cloud changed.
        // Merge instead of choosing a loser — the union keeps both sides.
        window.pushBackup && window.pushBackup('conflict-merge');
        const merged = window.mergeStates ? window.mergeStates(local, data.data) : local;
        applyCloudRef.current(merged);
        await uploadNow(merged); // push the union so the other device converges to it
      }
      hasPulledRef.current = true;
      setSyncStatus('synced');
    } catch (e) {
      console.warn('sync pull failed:', e);
      setSyncStatus('error');
    }
  };

  // Initial pull on login
  _u_e(() => { if (user && sbClient) pullNow(); }, [user]);

  // Pull when the tab regains focus — fastest reaction for the
  // "edited on phone, switched to laptop" case.
  _u_e(() => {
    if (!user || !sbClient) return;
    const onVisible = () => { if (document.visibilityState === 'visible') pullNow(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [user]);

  // Periodic poll (15s) — handles the "both devices left open" case
  _u_e(() => {
    if (!user || !sbClient) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') pullNow();
    }, 15000);
    return () => clearInterval(t);
  }, [user]);

  // Realtime push — instant if Replication is enabled on planner_data in
  // Supabase Dashboard → Database → Replication. Silently degrades to the
  // 15s poll above if not enabled, so this is safe to leave on either way.
  _u_e(() => {
    if (!user || !sbClient) return;
    const channel = sbClient
      .channel(`planner_data:${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'planner_data',
        filter: `user_id=eq.${user.id}`,
      }, () => pullNow())
      .subscribe();
    return () => { sbClient.removeChannel(channel); };
  }, [user]);

  // Debounced upload on local edits
  _u_e(() => {
    if (!user || !sbClient) return;
    // Don't upload before the first pull has reconciled this session, and only
    // push when there's a genuine local edit since the last sync — together
    // these stop a freshly-opened, stale device from overwriting the cloud.
    if (!hasPulledRef.current) return;
    const lastEdit = parseInt(localStorage.getItem('last_edit_at') || '0', 10);
    const lastSync = parseInt(localStorage.getItem('last_synced_at_' + user.id) || '0', 10);
    if (lastEdit <= lastSync) return;
    const snapshot = JSON.stringify(store.state);
    if (snapshot === lastSyncedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSyncStatus('syncing');
    debounceRef.current = setTimeout(async () => {
      try {
        await uploadNow();
        setSyncStatus('synced');
      } catch (e) {
        console.warn('sync upload failed:', e);
        setSyncStatus('error');
      }
    }, 1500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [store.state, user]);

  const signOut = async () => {
    if (!confirm('登出账号？本地数据仍会保留。')) return;
    await sbClient.auth.signOut();
    setUser(null);
    setSyncStatus('idle');
  };

  // Restore from an automatic pre-overwrite backup (the undo safety net).
  const restore = () => {
    const list = window.listBackups ? window.listBackups() : [];
    if (!list.length) { alert('暂无可恢复的备份。\n（每次「云端覆盖本地」或合并前都会自动备份一份到这里。）'); return; }
    const lines = list.slice().reverse()
      .map((b) => `${b.i} · ${b.when} · ${(b.size / 1024).toFixed(0)}KB${b.reason ? ' · ' + b.reason : ''}`)
      .join('\n');
    const ans = prompt('输入要恢复的备份编号（恢复后会重新加载页面，且会被同步到云端）：\n\n' + lines, String(list[list.length - 1].i));
    if (ans == null) return;
    const i = parseInt(ans, 10);
    if (window.restoreBackup && window.restoreBackup(i)) {
      setSyncStatus('syncing');
      setTimeout(() => location.reload(), 150);
    } else {
      alert('恢复失败：编号无效');
    }
  };

  if (!sbClient) {
    return (
      <div className="account-widget account-offline">
        <span className="dot dot-offline"></span>
        <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>云同步未配置</span>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <button className="account-widget account-cta" onClick={() => setOpenAuth(true)}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>登录 / 注册</span>
          <span style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginLeft: 4 }}>· 多设备同步</span>
        </button>
        <AuthModal open={openAuth} onClose={() => setOpenAuth(false)} onSignedIn={() => setOpenAuth(false)} />
      </>
    );
  }

  const statusText = {
    idle: '已登录',
    syncing: '同步中…',
    synced: '已同步 ✓',
    error: '同步失败',
    offline: '离线',
  }[syncStatus] || '已登录';

  const initial = (user.email || '?').charAt(0).toUpperCase();
  const displayEmail = (user.email || '').replace(/(.{2}).*(@.*)/, '$1***$2');

  return (
    <div className="account-widget account-active">
      <div className="account-avatar">{initial}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="account-email">{displayEmail}</div>
        <div className="account-status">
          <span className={`dot dot-${syncStatus}`}></span>
          {statusText}
        </div>
      </div>
      <button className="account-signout" onClick={restore} title="从自动备份恢复数据" style={{ marginRight: 2 }}>⟲</button>
      <button className="account-signout" onClick={signOut} title="登出">⎋</button>
    </div>
  );
}

window.AccountWidget = AccountWidget;
window.AuthModal = AuthModal;
