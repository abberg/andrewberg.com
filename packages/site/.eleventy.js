module.exports = function (eleventyConfig) {

  eleventyConfig.setTemplateFormats(["11ty.js"]);
  eleventyConfig.addPassthroughCopy({ "home/styles.css": "styles.css" });

  return {
    dir: {
      input: "../",
      output: "public"
    },
  };
};