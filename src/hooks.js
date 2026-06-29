// 旧版各文件通过 Babel-on-window 共享的 React hooks 别名，迁移后统一从这里 import。
// （components.jsx / sync.jsx / view-radio.jsx 内部仍保留自己的本地别名，互不冲突。）
import React from 'react';

const { useState, useEffect, useRef, useCallback } = React;

export const _us = useState;
export const _ue = useEffect;
export const _ur = useRef;
export const _uc = useCallback;

export const _u_s = useState;
export const _u_e = useEffect;
export const _u_r = useRef;
export const _u_c = useCallback;
