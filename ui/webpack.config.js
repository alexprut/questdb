const path = require("path")
const { CleanWebpackPlugin } = require("clean-webpack-plugin")
const CopyWebpackPlugin = require("copy-webpack-plugin")
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const AnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin

const PORT = 9001
const BACKEND_PORT = 9000
const isProdBuild = process.env.NODE_ENV === "production"
const runBundleAnalyzer = process.env.ANALYZE

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development"
}

const PATHS = {
  assets: `${__dirname}/assets`,
  src: `${__dirname}/src`,
}

const devPlugins = [
  new ForkTsCheckerWebpackPlugin({
    eslint: true,
    measureCompilationTime: false,
  }),
]

const basePlugins = [
  new CleanWebpackPlugin(),
  new HtmlWebpackPlugin({
    favicon: "assets/favicon.ico",
    template: "src/index.hbs",
    minify: {
      minifyCSS: true,
      minifyJS: true,
      minifyURLs: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
    },
  }),
  new MiniCssExtractPlugin({
    filename: isProdBuild ? "[name].[hash].css" : "[name].css",
    chunkFilename: isProdBuild ? "[id].[hash].css" : "[id].css",
  }),
]

const prodPlugins = [
  new CopyWebpackPlugin([{ from: "./assets/", to: "assets/" }]),
  new OptimizeCSSAssetsPlugin({
    cssProcessorPluginOptions: {
      preset: ['default', { discardComments: { removeAll: true } }],
    },
  })
]

module.exports = {
  devServer: {
    compress: true,
    host: "localhost",
    hot: false,
    overlay: !isProdBuild && {
      errors: true,
      warnings: false,
    },
    port: PORT,
    proxy: {
      context: ["/imp", "/exp", "/exec"],
      target: `http://localhost:${BACKEND_PORT}/`,
    },
  },
  mode: isProdBuild ? "production" : "development",
  entry: {
    qdb: "./src/js/index",
  },
  output: {
    filename: isProdBuild ? "[name].[hash].js" : "[name].js",
    chunkFilename: isProdBuild ? "[id].[hash].js" : "[id].js",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.(png|svg|jpg|gif)$/,
        use: ["file-loader"],
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        use: ["file-loader"],
      },
      {
        test: /\.hbs$/,
        loader: "handlebars-loader",
      },
      {
        test: /\.(ts|js)x?$/,
        exclude: /node_modules/,
        loader: "babel-loader",
      },
      {
        test: /\worklet\.(ts|js)$/,
        loaders: ["worker-loader", "babel-loader"],
      },
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
      {
        test: /\.s[ac]ss$/i,
        use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"],
      },
    ],
  },
  plugins: [
    ...basePlugins,
    ...(isProdBuild ? prodPlugins : devPlugins),
    ...(runBundleAnalyzer ? [new AnalyzerPlugin({ analyzerPort: 9999 })] : []),
  ],
}
