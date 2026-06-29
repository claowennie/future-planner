import { _ue } from './hooks.js';
import { appConfirm } from './modal.jsx';
import { openPrivacy } from './privacy.jsx';
import { deleteAccount } from './sync.jsx';

// Tweaks panel — visible when Tweaks is toggled on
function AppTweaks() {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "accent": "default",
    "density": "comfortable",
    "fontPair": "modern"
  }/*EDITMODE-END*/;
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Apply effects to <div id="root"> & <html>
  _ue(() => {
    const root = document.getElementById('root');
    if (!root) return;
    root.classList.remove('accent-warm','accent-forest','accent-plum');
    if (tweaks.accent && tweaks.accent !== 'default') root.classList.add('accent-' + tweaks.accent);
    root.classList.toggle('density-compact', tweaks.density === 'compact');
  }, [tweaks.accent, tweaks.density]);

  _ue(() => {
    const r = document.documentElement;
    if (tweaks.fontPair === 'classic') {
      r.style.setProperty('--font-sans', '"Newsreader", "Noto Serif SC", "Source Han Serif SC", Georgia, serif');
      r.style.setProperty('--font-serif', '"Newsreader", "Noto Serif SC", "Source Han Serif SC", Georgia, serif');
    } else if (tweaks.fontPair === 'mono') {
      r.style.setProperty('--font-sans', '"JetBrains Mono", "PingFang SC", monospace');
      r.style.removeProperty('--font-serif');
    } else {
      r.style.removeProperty('--font-sans');
      r.style.removeProperty('--font-serif');
    }
  }, [tweaks.fontPair]);

  const accentColorMap = { default: '#3656c4', warm: '#c97f4a', forest: '#4f8a5f', plum: '#7a5dc9' };
  const colorToKey = { '#3656c4': 'default', '#c97f4a': 'warm', '#4f8a5f': 'forest', '#7a5dc9': 'plum' };

  return (
    <window.TweaksPanel title="Tweaks">
      <window.TweakSection label="主色调 · Accent" />
      <window.TweakColor
        label="主色"
        value={accentColorMap[tweaks.accent] || '#3656c4'}
        options={['#3656c4', '#c97f4a', '#4f8a5f', '#7a5dc9']}
        onChange={(v) => setTweak('accent', colorToKey[v] || 'default')}
      />
      <window.TweakSection label="布局 · Layout" />
      <window.TweakRadio
        label="密度"
        value={tweaks.density}
        options={[{value:'comfortable', label:'宽松'}, {value:'compact', label:'紧凑'}]}
        onChange={(v) => setTweak('density', v)}
      />
      <window.TweakSelect
        label="字体"
        value={tweaks.fontPair}
        options={[
          {value:'modern', label:'Modern · Sans + Serif'},
          {value:'classic', label:'Classic · 衬线为主'},
          {value:'mono', label:'Mono · 等宽'},
        ]}
        onChange={(v) => setTweak('fontPair', v)}
      />
      <window.TweakSection label="数据 · Data" />
      <window.TweakButton
        label="清空所有本地数据"
        onClick={async () => {
          if (await appConfirm({
            title: '清空所有本地数据',
            message: '清空这台设备上的所有数据？（待办、笔记、日记等）\n\n如果你已登录云同步，建议先点左下角「⎋」登出再清空，否则云端数据会把它们同步回来。',
            confirmText: '清空', danger: true,
          })) {
            localStorage.removeItem('study_planner_v1');
            localStorage.removeItem('study_planner_v2');
            localStorage.removeItem('last_edit_at');
            location.reload();
          }
        }}
      />
      <window.TweakButton
        secondary
        label="载入示例数据（体验用）"
        onClick={async () => {
          if (await appConfirm({
            title: '载入示例数据',
            message: '载入一套示例数据来体验各功能？会覆盖当前本地数据。\n\n注意：请在未登录状态下体验；登录前记得点「清空所有本地数据」，免得示例混进你的账号。',
            confirmText: '载入',
          })) {
            localStorage.setItem('study_planner_v2', JSON.stringify(window.SEED));
            localStorage.removeItem('last_edit_at');
            location.reload();
          }
        }}
      />
      <window.TweakSection label="隐私 · Privacy" />
      <window.TweakButton
        secondary
        label="隐私政策"
        onClick={openPrivacy}
      />
      <window.TweakButton
        secondary
        label="注销账号（永久删除云端数据）"
        onClick={deleteAccount}
      />
    </window.TweaksPanel>
  );
}

window.AppTweaks = AppTweaks;

export { AppTweaks };
