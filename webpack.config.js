const path = require("path");

module.exports = (env) => {
  let _mode, _entry, _externals;
  let _output = {
    path: path.resolve(__dirname, "dist"),
  };

  if (env.goal == "aws-lambda") {
    _entry = "./src/handler.ts";
    _output.filename = "snapper-handler.js";
    _output.libraryTarget = "commonjs";
    _externals = [
      "electron-fetch",
      "bufferutil",
      "utf-8-validate",
      "aws-sdk/clients/s3",
    ];
  } else if (env.goal == "cli") {
    _entry = "./src/cli.ts";
    _output.filename = "snapper-cli.js";
    _externals = ["electron-fetch", "bufferutil", "utf-8-validate"];
  } else {
    console.log("please provide correct `goal` env");
  }

  if (env.production) {
    _mode = "production";
  } else {
    _mode = "development";
  }

  return {
    mode: _mode,
    entry: _entry,
    target: "node14",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      mainFields: ["main", "module"],
      extensions: [".tsx", ".ts", ".js"],
    },
    externals: _externals,
    output: _output,
  };
};
