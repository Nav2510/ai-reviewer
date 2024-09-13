const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const nodeExternals = require("webpack-node-externals");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

module.exports = [
  // ESM modules
  {
    entry: {
      // Entry point for application
      index: "./src/index.ts",
      scripts: "./src/scripts/openai/index.ts",
    },
    externals: [nodeExternals()],
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname, "./lib"), // Output folder
      clean: true,
    },
    resolve: {
      extensions: [".js", ".ts"],
    },
    mode: "development", // 'development' or 'production'
    target: "node",
    module: {
      rules: [
        {
          test: /\.ts$/, // Apply this rule to .ts files
          use: "ts-loader",
          exclude: /node_modules/, // Exclude dependencies
        },
      ],
    },
    devtool: "source-map", // Generate source maps for debugging
    plugins: [
      new CleanWebpackPlugin(),
      new NodePolyfillPlugin(),
      new CopyWebpackPlugin({
        patterns: [
          { from: "src/assets/workflows/review.yml", to: "./" }, // Copy review.yml to dist folder
        ],
      }),
    ],
  },
];
