// eslint-config-next 16 は flat config を直接出す。FlatCompat は要らない
// （eslintrc 経由だと react プラグインの循環参照で config-validator が落ちる）。
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**', '.open-next/**', 'node_modules/**',
      'src/legacy/**', 'test-results/**', 'playwright-report/**',
    ],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
