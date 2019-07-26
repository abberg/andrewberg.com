var fs = require('fs-extra');
var path = require('path');

fs.copySync(path.resolve(__dirname, '../src'), path.resolve(__dirname, '../public'));
