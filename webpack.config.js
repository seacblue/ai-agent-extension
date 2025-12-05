const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    background: './src/background/background.ts',
    content: './src/content/content.ts',
    devtools: './src/devtools/main.ts',
    panel: './src/panel/main.ts'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.js', '.vue'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.vue$/,
        use: 'vue-loader'
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'icons/[name][ext]'
        }
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[name][ext]'
        }
      }
    ]
  },
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      filename: 'devtools.html',
      template: './public/devtools.html',
      chunks: ['devtools']
    }),
    new HtmlWebpackPlugin({
      filename: 'panel.html',
      template: './public/panel.html',
      chunks: ['panel']
    })
  ],
  optimization: {
    splitChunks: {
      chunks: 'all',
      name: false,
      // 禁用代码分割，将所有模块打包到入口文件中
      cacheGroups: {
        default: false,
        vendors: false
      }
    },
    runtimeChunk: false
  }
};
