/**
 * Webpack配置文件 - 用于将所有 JS 模块打包成单一文件
 */

const path = require('path');

module.exports = {
  mode: 'production',
  entry: {
    // 定义多个入口点，每个入口点将被打包成一个单一文件
    content: './src/content/content.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist_singlefile'),
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  optimization: {
    // 完全禁用代码分割，确保所有代码都打包到主文件中
    splitChunks: false,
  },
};
