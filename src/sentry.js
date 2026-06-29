// Sentry 错误上报：让开发者主动看到所有用户遇到的错误（堆栈/浏览器/时间），
// 不用等用户来反馈。只在正式构建（npm run build）里启用 —— `npm run dev`
// 开发时的报错不上报，免得调试噪音灌进后台。
// DSN 不是机密：它只能往项目里「写入错误」，读不到任何数据。
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: 'https://09bc2699a079f4347d940bec3e77cd68@o4511545565904896.ingest.us.sentry.io/4511545586548736',
  enabled: import.meta.env.PROD,
  // 不采集 IP / cookie 等个人信息，只要错误本身
  sendDefaultPii: false,
});

export { Sentry };
