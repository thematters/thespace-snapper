const path = require("path");

module.exports = {
  mode: "development",
  entry: "./src/handler.ts",
  cache: false,
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        include: path.resolve(__dirname, "node_modules/native-fetch"),
      },
    ],
    exprContextRegExp: /^\.\/fetch\.node/,
  },
  resolve: {
    mainFields: ["main", "module"],
    extensions: [".tsx", ".ts", ".js"],
  },
  externals: [
    "electron-fetch",
    "bufferutil",
    "utf-8-validate",
    "aws-sdk/clients/s3",
  ],
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "snapper-handler.js",
    libraryTarget: "commonjs",
  },
  target: "node16",
};
