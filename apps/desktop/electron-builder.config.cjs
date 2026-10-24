module.exports = {
  appId: "com.ai-vtuber.runtime",
  productName: "AI VTuber Runtime",
  artifactName: "${productName}-${version}-${platform}-${arch}.${ext}",
  directories: {
    output: "release",
  },
  files: ["dist/**/*", "package.json"],
  extraResources: [
    {
      from: "../web/dist",
      to: "web",
      filter: ["**/*"],
    },
  ],
  win: {
    target: ["dir"],
  },
};
