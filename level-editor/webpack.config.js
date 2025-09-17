const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html'
    })
  ],
  devServer: {
    static: [
      { directory: path.join(__dirname, 'public'), publicPath: '/' },
      // Serve project root and key asset folders for runtime compatibility
      { directory: path.resolve(__dirname, '..'), publicPath: '/' },
      { directory: path.resolve(__dirname, '../images'), publicPath: '/images' },
      { directory: path.resolve(__dirname, '../animations'), publicPath: '/animations' },
      { directory: path.resolve(__dirname, '../audio'), publicPath: '/audio' },
      { directory: path.resolve(__dirname, '../web'), publicPath: '/web' }
    ],
    compress: true,
    port: 9885,
    hot: true,
    open: true
  }
};
