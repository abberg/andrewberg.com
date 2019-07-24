var fs = require('fs');
var path = require('path');

// destination.txt will be created or overwritten by default.
fs.copyFile(path.resolve(__dirname, '../src/index.html'), path.resolve(__dirname, '../public/index.html'), (err) => {
    if (err) throw err;
    console.log('index was copied');
});
