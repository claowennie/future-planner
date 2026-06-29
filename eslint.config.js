// 只为迁移保驾：抓「忘了 import 的跨文件标识符」(no-undef)。
// 风格类规则一概不开，避免噪音淹没真问题。
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
      'react/jsx-no-undef': ['error', { allowGlobals: true }],
      'no-unused-vars': 'off',
      // `t` 是 i18n 翻译函数的保留名：局部变量/参数再叫 t 会遮蔽它，
      // 内部一调 t('…') 就是把对象当函数 —— 本月页主题循环线上炸过一次。
      'no-restricted-syntax': ['error',
        { selector: "VariableDeclarator > Identifier.id[name='t']",
          message: "`t` 是 i18n 保留名，会遮蔽翻译函数 —— 换个名字（如 tm/td/th）" },
        { selector: ":function Identifier.params[name='t']",
          message: "`t` 是 i18n 保留名，会遮蔽翻译函数 —— 换个名字（如 tm/td/th）" },
        { selector: "ObjectPattern Property[shorthand=true] > Identifier.value[name='t']",
          message: "`t` 是 i18n 保留名，会遮蔽翻译函数 —— 换个名字（如 tm/td/th）" },
      ],
    },
  },
];
