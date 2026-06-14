const path = require('path');
const { readdirSync } = require('fs');

module.exports = function (eleventyConfig) {
  eleventyConfig.setTemplateFormats('11ty.js');
  eleventyConfig.addPassthroughCopy({ 'home/styles.css': 'styles.css' });

  const directories = readdirSync(path.join(__dirname, '../'), {
    withFileTypes: true,
  })
    .filter(
      (dirent) =>
        dirent.isDirectory() &&
        dirent.name !== 'site' &&
        dirent.name !== 'model_base'
    )
    .map((dirent) => dirent.name);

  directories.forEach((directoryName) => {
    eleventyConfig.addPassthroughCopy({
      [`../${directoryName}/dist/*.*`]: directoryName,
    });
  });

  eleventyConfig.addCollection('pages', () => {
    return directories;
  });

  return {
    dir: {
      input: '../',
      output: 'public',
    },
  };
};
