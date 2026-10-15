module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      // F-03: nenhum console.* em produção
      production: { plugins: [['transform-remove-console', { exclude: [] }]] },
    },
  };
};
