// 新用户 3 步引导：写名字 → 挑习惯 → 种第一个年度目标。
// 只在「本地完全没有数据 + 没走过引导」时出现（替代旧的 SEED 示例数据直灌）；
// 每步可跳过，老用户可以直接跳去登录（触发 future:open-auth，由 AccountWidget 接）。
import React from 'react';
import { _us } from './hooks.js';
import { useStore, uid, isEmptyState } from './store.jsx';
import { FourSeasonsTree } from './tree.jsx';
import { getSeason } from './growth-tree.jsx';
import { t, tArr } from './i18n.js';

const HABIT_EMOJIS = ['🌅', '📖', '🏃', '🌙', '💧', '✍️', '🌿', '🧠'];
const HABIT_TEMPLATES = tArr('onb.habitNames').map((name, i) => ({ name, emoji: HABIT_EMOJIS[i] }));

const DONE_KEY = 'onboarding_done_v1';

function Onboarding() {
  const store = useStore();
  const [open, setOpen] = _us(() => {
    try {
      if (localStorage.getItem(DONE_KEY)) return false;
      return isEmptyState(store.state);
    } catch { return false; }
  });
  const [step, setStep] = _us(0);
  const [name, setName] = _us('');
  const [picked, setPicked] = _us([]); // HABIT_TEMPLATES 的下标数组
  const [goal, setGoal] = _us('');
  const [aim, setAim] = _us('');

  if (!open) return null;

  const close = () => {
    try { localStorage.setItem(DONE_KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
  };

  const finish = () => {
    const g = goal.trim();
    store.setState((s) => ({
      ...s,
      name: name.trim() || s.name,
      habits: [
        ...s.habits,
        ...picked.map((i) => ({ id: uid(), name: HABIT_TEMPLATES[i].name, emoji: HABIT_TEMPLATES[i].emoji })),
      ],
      okrs: g ? [...s.okrs, {
        id: uid(), icon: 'a',
        initial: (g[0] || 'G').toUpperCase(),
        name: g, aim: aim.trim(),
        krs: [{ name: t('year.krDefault'), cur: 0, max: 100 }],
      }] : s.okrs,
    }));
    close();
  };

  const goLogin = () => {
    close();
    window.dispatchEvent(new CustomEvent('future:open-auth'));
  };

  const togglePick = (i) => {
    setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  };

  const STEPS = [
    {
      title: t('onb.step1Title'),
      sub: t('onb.step1Sub'),
      body: (
        <input className="onb-input" value={name} autoFocus maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setStep(1); }}
          placeholder={t('onb.namePh')} />
      ),
      canNext: true,
    },
    {
      title: t('onb.step2Title'),
      sub: t('onb.step2Sub'),
      body: (
        <div className="onb-chips">
          {HABIT_TEMPLATES.map((tpl, i) => (
            <button key={i} type="button"
              className={`onb-chip ${picked.includes(i) ? 'on' : ''}`}
              onClick={() => togglePick(i)}>
              {tpl.emoji} {tpl.name}
            </button>
          ))}
        </div>
      ),
      canNext: true,
    },
    {
      title: t('onb.step3Title'),
      sub: t('onb.step3Sub'),
      body: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="onb-input" value={goal} autoFocus maxLength={40}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={t('onb.goalPh')} />
          <input className="onb-input" value={aim} maxLength={60}
            onChange={(e) => setAim(e.target.value)}
            placeholder={t('onb.aimPh')} style={{ fontSize: 13.5 }} />
        </div>
      ),
      canNext: true,
    },
    {
      title: t('onb.step4Title'),
      sub: t('onb.step4Sub'),
      body: (
        <div className="onb-ritual">
          <div className="onb-ritual-col">
            <div className="onb-ritual-title">{t('onb.ritualLeft')}</div>
            <div className="onb-ritual-line">{t('onb.ritual1')}</div>
            <div className="onb-ritual-line">{t('onb.ritual2')}</div>
            <div className="onb-ritual-line">{t('onb.ritual3')}</div>
          </div>
          <div className="onb-tree-arrow" style={{ paddingBottom: 0 }}>→</div>
          <div className="onb-ritual-col">
            <div className="onb-ritual-title">{t('onb.ritualRight')}</div>
            <div className="onb-ritual-journal">
              <span style={{ fontSize: 18 }}>📖</span> {t('onb.ritualJournal')}
            </div>
          </div>
        </div>
      ),
      canNext: true,
    },
    {
      title: t('onb.step5Title'),
      sub: t('onb.step5Sub'),
      body: (
        <div>
          <div className="onb-tree-row">
            {[0, 3, 6].map((stage, i) => (
              <React.Fragment key={stage}>
                {i > 0 && <div className="onb-tree-arrow">→</div>}
                <div className="onb-tree-col">
                  <div className="onb-tree-cell">
                    <FourSeasonsTree stage={stage} season={getSeason()} tod="day" />
                  </div>
                  <div className="onb-tree-label">{tArr('onb.treeLabels')[i]}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 10, textAlign: 'center' }}>
            {t('onb.treeHint')}
          </div>
        </div>
      ),
      canNext: true,
    },
  ];

  const cur = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="auth-overlay">
      <div className="auth-modal onb-modal">
        <div className="onb-steps" aria-hidden="true">
          {STEPS.map((_, i) => <div key={i} className={`onb-step-dot ${i <= step ? 'active' : ''}`} />)}
        </div>
        <div className="auth-head">
          <div className="auth-title serif">{cur.title}</div>
          <div className="auth-sub">{cur.sub}</div>
        </div>
        {cur.body}
        <div className="onb-actions">
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <button type="button" className="onb-skip" onClick={close}>{t('onb.skip')}</button>
            {step === 0 && (
              <button type="button" className="onb-skip" style={{ textDecoration: 'underline' }} onClick={goLogin}>
                {t('onb.haveAccount')}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>{t('onb.prev')}</button>}
            <button className="btn btn-primary" onClick={() => (last ? finish() : setStep(step + 1))}>
              {last ? t('onb.start') : t('onb.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Onboarding = Onboarding;

export { Onboarding };
