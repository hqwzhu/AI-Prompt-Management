const path = require("node:path");
const { build } = require("./package.json");

module.exports = {
  ...build,
  electronDist: async () =>
    path.join(__dirname, "node_modules", "electron", "dist"),
};
